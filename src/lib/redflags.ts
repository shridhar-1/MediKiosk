/**
 * ============================================================================
 * MediKiosk — Emergency (Red-Flag) Detection Engine
 * ============================================================================
 * SINGLE SOURCE OF TRUTH for how MediKiosk classifies an intake as an
 * emergency. The physician-facing explainer page (/physician/logic) renders
 * the rule tables exported from this file, so the code and the explanation
 * can never drift apart.
 *
 * ── How classification works (3 layers) ─────────────────────────────────────
 *  LAYER 1  Deterministic rule matching on the structured interview answers
 *           (chief complaint + associated symptoms + onset/duration/site/
 *           character/radiation/severity). Runs on EVERY answer save, in
 *           milliseconds. See RED_FLAG_RULES below.
 *  LAYER 1b Free-text / ASR screening of everything the patient *said or
 *           typed* (English + Hindi + Hinglish keywords). See
 *           evaluateRedFlagsFromText() and TEXT_RULES.
 *  LAYER 2  LLM adjudication for gray-zone cases (inside summary-engine.ts):
 *           the model may raise, but never silently lower, a red flag.
 *  LAYER 3  Safety reconciliation: any layer saying "emergency" wins; the
 *           final priority + every fired rule ID is persisted on the session
 *           (audit trail) and shown to the physician with the evidence.
 *
 * ── Priority escalation ─────────────────────────────────────────────────────
 *  emergency  → patient skips the queue, triage desk is paged immediately
 *  urgent     → patient goes to the head of the routine queue
 *  routine    → normal FIFO queue
 *
 * ── Design principles ───────────────────────────────────────────────────────
 *  1. Rules are DATA, not code — clinicians can review/extend without redeploy.
 *  2. Fail-safe: unknown inputs can never *downgrade* a fired emergency.
 *  3. Every verdict carries its evidence, so a human can always answer
 *     "why was this flagged?"
 * ============================================================================
 */

export type InterviewAnswers = Record<string, { values: string[]; text: string }>;

export type RulePriority = "emergency" | "urgent";

/** A fired rule, with the evidence that fired it — the audit unit. */
export type FiredRule = {
  id: string;
  name: string;
  priority: RulePriority;
  reason: string;
  action: string;
  evidence: string[];
};

/** Public result — backwards-compatible with the original RedFlagResult. */
export type RedFlagResult = {
  triggered: boolean;
  priority: "routine" | "urgent" | "emergency";
  reasons: string[];
  /** New: machine-readable detail for the audit trail + explainer UI. */
  fired: FiredRule[];
};

type RuleContext = {
  chief: string;
  associated: Set<string>;
  onset: string;
  duration: string;
  site: string;
  character: string;
  radiation: Set<string>;
  severity: number;
  feverHigh: boolean;
  allValues: Set<string>;
};

export type RedFlagRule = {
  id: string;
  name: string;
  category: "Cardiac" | "Neuro" | "Respiratory" | "GI" | "Infection" | "Severity";
  priority: RulePriority;
  /** Physician-facing reason string (shown on the console card). */
  reason: string;
  /** What the system automatically does when this rule fires. */
  action: string;
  /** Fires when ANY test row is true ("OR" of rows; each row is an "AND" of checks). */
  tests: { label: string; fired: (c: RuleContext) => boolean }[];
};

/* ── Shared checks ──────────────────────────────────────────────────────── */
const ACS_LIKE = (c: RuleContext) =>
  c.chief === "chest_pain" || c.site === "center_chest" || c.site === "left_chest" || c.character === "squeezing";

const ACS_MODIFIER = (c: RuleContext) =>
  c.associated.has("dyspnoea") ||
  c.associated.has("sweating") ||
  c.associated.has("syncope") ||
  c.radiation.has("left_arm") ||
  c.radiation.has("jaw_neck") ||
  c.chief === "breathless";

/* ── LAYER 1 — structured-answer rule table ─────────────────────────────── */
export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "RF-ACS-01",
    name: "Acute coronary syndrome",
    category: "Cardiac",
    priority: "emergency",
    reason: "Possible acute coronary syndrome — chest pain with dyspnoea, diaphoresis, syncope or radiation to arm/jaw",
    action: "Bypass queue · page triage desk immediately · stat ECG on arrival",
    tests: [
      { label: "ACS-like chest pain + any of (dyspnoea, sweating, syncope, radiation to left arm/jaw)", fired: (c) => ACS_LIKE(c) && ACS_MODIFIER(c) },
    ],
  },
  {
    id: "RF-CP-02",
    name: "Sudden chest pain",
    category: "Cardiac",
    priority: "urgent",
    reason: "Sudden-onset chest pain of a few hours — needs same-hour triage",
    action: "Priority queue · ECG before consultation",
    tests: [
      { label: "chest pain + sudden onset + duration of hours", fired: (c) => c.chief === "chest_pain" && c.onset === "sudden" && c.duration === "hours" },
    ],
  },
  {
    id: "RF-RESP-03",
    name: "Acute breathlessness",
    category: "Respiratory",
    priority: "emergency",
    reason: "Acute breathlessness — rule out PE, ACS, severe asthma",
    action: "Bypass queue · SpO₂ at triage · oxygen ready",
    tests: [
      { label: "breathless + (sudden onset OR syncope)", fired: (c) => c.chief === "breathless" && (c.onset === "sudden" || c.associated.has("syncope")) },
    ],
  },
  {
    id: "RF-STROKE-04",
    name: "Stroke / TIA (FAST)",
    category: "Neuro",
    priority: "emergency",
    reason: "Possible stroke / TIA — FAST-positive symptoms",
    action: "Bypass queue · code stroke · CT on arrival",
    tests: [
      { label: "any FAST sign: slurred speech / one-sided weakness / vision loss", fired: (c) => c.associated.has("speech") || c.associated.has("weak_side") || c.associated.has("vision") },
    ],
  },
  {
    id: "RF-MEN-05",
    name: "Meningitis / encephalitis",
    category: "Infection",
    priority: "emergency",
    reason: "Headache with meningism, rash or altered sensorium",
    action: "Bypass queue · isolate · urgent physician review",
    tests: [
      { label: "(headache OR fever) + any of (neck stiffness, confusion, rash)", fired: (c) => (c.chief === "headache" || c.chief === "fever" || c.associated.has("neck_stiff") || c.associated.has("confusion")) && (c.associated.has("neck_stiff") || c.associated.has("confusion") || c.associated.has("rash")) },
    ],
  },
  {
    id: "RF-GIB-06",
    name: "Gastrointestinal bleed",
    category: "GI",
    priority: "emergency",
    reason: "Gastrointestinal bleed",
    action: "Bypass queue · vitals + IV access at triage",
    tests: [
      { label: "vomiting blood OR blood in stool", fired: (c) => c.associated.has("blood_vomit") || c.associated.has("blood_stool") },
    ],
  },
  {
    id: "RF-HPT-07",
    name: "Haemoptysis",
    category: "Respiratory",
    priority: "emergency",
    reason: "Haemoptysis",
    action: "Priority physician review · isolate until TB excluded",
    tests: [
      { label: "coughing blood", fired: (c) => c.associated.has("blood_cough") },
    ],
  },
  {
    id: "RF-SYN-08",
    name: "Syncope with cardiorespiratory symptoms",
    category: "Cardiac",
    priority: "emergency",
    reason: "Syncope with cardiorespiratory symptoms",
    action: "Bypass queue · ECG + orthostatic vitals",
    tests: [
      { label: "fainting + (ACS-like pain OR breathlessness)", fired: (c) => c.associated.has("syncope") && (ACS_LIKE(c) || c.chief === "breathless") },
    ],
  },
  {
    id: "RF-SEV-09",
    name: "Severe pain",
    category: "Severity",
    priority: "urgent",
    reason: "Severe pain score — pain 8/10 or worse",
    action: "Head of routine queue · analgesia review",
    tests: [
      { label: "severity ≥ 8 for chest / abdomen / headache pain", fired: (c) => c.severity >= 8 && (c.chief === "chest_pain" || c.chief === "abdomen" || c.chief === "headache") },
    ],
  },
  {
    id: "RF-FEV-10",
    name: "Fever with red flags",
    category: "Infection",
    priority: "urgent",
    reason: "Fever with rash, neck stiffness or confusion",
    action: "Head of routine queue · vitals at triage",
    tests: [
      { label: "high/continuous fever (or fever chief complaint) + (rash, neck stiffness, confusion)", fired: (c) => c.feverHigh && (c.associated.has("rash") || c.associated.has("neck_stiff") || c.associated.has("confusion")) },
    ],
  },
];

/** Stand-alone symptom options that alone justify at least urgent review. */
export const EMERGENCY_OPTIONS = new Set([
  "speech",
  "weak_side",
  "vision",
  "confusion",
  "neck_stiff",
  "blood_vomit",
  "blood_stool",
  "blood_cough",
  "syncope",
]);

function buildContext(answers: InterviewAnswers): RuleContext {
  const allValues = new Set<string>();
  for (const a of Object.values(answers)) for (const v of a.values) allValues.add(v);

  return {
    chief: answers.chief_complaint?.values[0] ?? "",
    associated: new Set(answers.associated?.values ?? []),
    onset: answers.onset?.values[0] ?? "",
    duration: answers.duration?.values[0] ?? "",
    site: answers.pain_site?.values[0] ?? "",
    character: answers.pain_character?.values[0] ?? "",
    radiation: new Set(answers.pain_radiation?.values ?? []),
    severity: Number(answers.severity?.values[0] ?? 0),
    feverHigh: answers.fever_pattern?.values.includes("high_continuous") || answers.chief_complaint?.values[0] === "fever",
    allValues,
  };
}

/** LAYER 1 — evaluate the structured interview answers. */
export function evaluateRedFlags(answers: InterviewAnswers): RedFlagResult {
  const ctx = buildContext(answers);
  const fired: FiredRule[] = [];

  for (const rule of RED_FLAG_RULES) {
    const hit = rule.tests.find((t) => t.fired(ctx));
    if (hit) {
      fired.push({
        id: rule.id,
        name: rule.name,
        priority: rule.priority,
        reason: rule.reason,
        action: rule.action,
        evidence: [hit.label],
      });
    }
  }

  // Fallback: a single hard red-flag option was ticked but no combination rule
  // caught it — still never let the patient sit in the routine queue silently.
  if (!fired.length) {
    const single = [...ctx.allValues].find((v) => EMERGENCY_OPTIONS.has(v));
    if (single) {
      fired.push({
        id: "RF-SINGLE-99",
        name: "Red-flag symptom selected during interview",
        priority: "urgent",
        reason: "Red-flag symptom selected during interview",
        action: "Head of routine queue · triage vitals",
        evidence: [`selected: ${single}`],
      });
    }
  }

  return reconcile(fired);
}

/* ── LAYER 1b — free-text / voice-transcript screening ───────────────────── */

type TextRule = {
  id: string; // maps onto the same rule family as Layer 1
  name: string;
  priority: RulePriority;
  reason: string;
  action: string;
  /** ALL keywords of any one group must appear ("AND" inside a group). */
  anyOf: string[][];
};

/**
 * Spoken/typed narration screening. Keywords cover English, Hindi (Devanagari)
 * and Hinglish (romanized Hindi) because ASR output varies by language.
 */
export const TEXT_RULES: TextRule[] = [
  {
    id: "RF-ACS-01",
    name: "Acute coronary syndrome (from speech)",
    priority: "emergency",
    reason: "Possible acute coronary syndrome — chest pain with dyspnoea, diaphoresis, syncope or radiation to arm/jaw",
    action: "Bypass queue · page triage desk immediately · stat ECG on arrival",
    anyOf: [
      ["chest pain", "seene me dard", "seenon me dard", "सीने में दर्द", "chhati me dard", "chati me dard", " dil me dard "],
      ["left arm", "jaw", "pasina", "sweating", "saans", "breathless", "fainting", "behosh", "बांह", "जबड़ा"],
    ],
  },
  {
    id: "RF-STROKE-04",
    name: "Stroke / TIA (from speech)",
    priority: "emergency",
    reason: "Possible stroke / TIA — FAST-positive symptoms",
    action: "Bypass queue · code stroke · CT on arrival",
    anyOf: [
      // any single FAST sign is sufficient
      ["slurred speech", "bol nahi pa raha", " बोलने में", "face droop", "muh tedha", "मुंह टेढ़ा", "ek taraf kamzori", "एक तरफ कमज़ोरी", "one side weak", "haath kamzori"],
    ],
  },
  {
    id: "RF-RESP-03",
    name: "Acute respiratory distress (from speech)",
    priority: "emergency",
    reason: "Acute respiratory distress — cannot complete sentences / gasping / stridor",
    action: "Bypass queue · SpO₂ at triage · oxygen ready",
    anyOf: [["unable to speak full sentences", "gasping for air", "stridor", "saans phool", "saans nahi", "सांस नहीं", "hawa nahi"]],
  },
  {
    id: "RF-MEN-05",
    name: "Meningism (from speech)",
    priority: "emergency",
    reason: "Headache with meningism, rash or altered sensorium",
    action: "Bypass queue · isolate · urgent physician review",
    anyOf: [
      // any single strong meningism phrase is sufficient
      ["neck stiffness", "gardan me akdan", "गर्दन में अकड़न", "gardan me dard", " रोशनी " ],
    ],
  },
  {
    id: "RF-GIB-06",
    name: "GI bleed (from speech)",
    priority: "emergency",
    reason: "Gastrointestinal bleed — blood in vomit or stool",
    action: "Bypass queue · vitals + IV access at triage",
    anyOf: [["vomiting blood", "khoon ki ulti", "खून की उल्टी", "black stool", "kala stool", "khoon", "खून"]],
  },
];

/** LAYER 1b — screen a free-text transcript (voice or typed narration). */
export function evaluateRedFlagsFromText(transcript: string): RedFlagResult {
  const t = ` ${transcript.toLowerCase()} `;
  const fired: FiredRule[] = [];

  for (const rule of TEXT_RULES) {
    // rule fires if EVERY keyword group has at least one match
    const matched = rule.anyOf.every((group) => group.some((kw) => t.includes(kw.toLowerCase())));
    if (matched) {
      fired.push({
        id: rule.id,
        name: rule.name,
        priority: rule.priority,
        reason: rule.reason,
        action: rule.action,
        evidence: ["detected in spoken/typed narration"],
      });
    }
  }
  return reconcile(fired);
}

/** LAYER 3 — safety reconciliation: any emergency wins; merge everything. */
export function mergeRedFlagResults(...results: RedFlagResult[]): RedFlagResult {
  const firedMap = new Map<string, FiredRule>();
  for (const r of results) {
    for (const f of r.fired) {
      const existing = firedMap.get(f.id);
      if (!existing) firedMap.set(f.id, f);
      else {
        // same rule from two layers → keep highest priority, merge evidence
        const rank = { routine: 0, urgent: 1, emergency: 2 } as const;
        if (rank[f.priority] > rank[existing.priority]) existing.priority = f.priority;
        existing.evidence = [...new Set([...existing.evidence, ...f.evidence])];
      }
    }
  }
  return reconcile([...firedMap.values()]);
}

function reconcile(fired: FiredRule[]): RedFlagResult {
  const priority: RedFlagResult["priority"] = fired.some((f) => f.priority === "emergency")
    ? "emergency"
    : fired.length
      ? "urgent"
      : "routine";
  return {
    triggered: fired.length > 0,
    priority,
    reasons: [...new Set(fired.map((f) => f.reason))],
    fired,
  };
}