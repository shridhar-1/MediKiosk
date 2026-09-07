// ── Drug-Safety Engine — allergy, interaction, condition & vitals flags ───
// Same philosophy as redflags.ts: rules are DATA, every verdict carries its
// evidence, nothing is ever invented. Deterministic — no LLM involved.
//
//   LAYER A  Drug–Allergy : allergy on file vs detected medication (name or
//             class cross-match, e.g. "penicillin" allergy vs Amoxicillin)
//   LAYER B  Drug–Drug    : dangerous pairs commonly seen in Indian OPDs
//   LAYER C  Drug–Condition: β-blocker with asthma, NSAID with ulcer/kidney,
//             NSAID with fever+rash (dengue season), steroid with diabetes
//   LAYER D  Vitals said out loud: "BP 190/110", "sugar 400", "SpO2 88"…
//
// Output: FiredRule[] (same type as redflags.ts) → mergeRedFlagResults()
// escalates session priority exactly like a symptom red flag.

import type { FiredRule, RulePriority } from "@/lib/redflags";

// ── Drug classes (generic + common Indian brand/short names) ──────────────
const DRUG_CLASSES: Record<string, string[]> = {
  penicillins: ["penicillin", "amoxicillin", "augmentin", "ampicillin", "clavam"],
  sulfa: ["sulfamethoxazole", "cotrimoxazole", "septran", "bactrim", "sulfa"],
  nsaid: ["ibuprofen", "brufen", "diclofenac", "voltaren", "aspirin", "ecosprin", "naproxen", "nimesulide", "paracetamol"],
  "beta-blocker": ["atenolol", "metoprolol", "propranolol", "bisoprolol", "carvedilol"],
  acei: ["enalapril", "ramipril", "lisinopril", "captopril"],
  arb: ["telmisartan", "losartan", "olmesartan", "valsartan"],
  anticoagulant: ["warfarin", "acitrom", "heparin", "dabigatran", "apixaban", "rivaroxaban"],
  antiplatelet: ["aspirin", "ecosprin", "clopidogrel", "plavix", "prasugrel"],
  statin: ["atorvastatin", "rosuvastatin", "simvastatin"],
  steroid: ["prednisolone", "dexamethasone", "defcort", "wysolone"],
  macrolide: ["azithromycin", "azee", "clarithromycin", "erythromycin"],
  quinolone: ["ciprofloxacin", "levofloxacin", "ofloxacin", "moxifloxacin"],
  diuretic: ["furosemide", "lasix", "torsemide", "hydrochlorothiazide", "chlorthalidone"],
  spironolactone: ["spironolactone", "aldactone"],
};

function classesOf(medsText: string): Map<string, string[]> {
  const t = medsText.toLowerCase();
  const found = new Map<string, string[]>();
  for (const [cls, members] of Object.entries(DRUG_CLASSES)) {
    const hits = members.filter((m) => t.includes(m));
    if (hits.length > 0) found.set(cls, hits);
  }
  return found;
}

// ── LAYER A: drug–allergy (class-aware cross-match) ────────────────────────
function checkAllergy(allergies: string, medsText: string): FiredRule[] {
  const fired: FiredRule[] = [];
  const allergyList = allergies
    .toLowerCase()
    .split(/[,;]|\band\b|\n/)
    .map((a) => a.trim())
    .filter((a) => a.length > 2 && a !== "none" && a !== "no known allergies" && !a.startsWith("no known"));
  if (allergyList.length === 0) return fired;

  const medClasses = classesOf(medsText);
  const severe = /severe|anaphyla|swelling|breath|rash/.test(allergies.toLowerCase());

  for (const allergy of allergyList) {
    // 1) direct: the allergy substance itself appears in the medication text
    if (allergy.length >= 4 && medsText.toLowerCase().includes(allergy)) {
      fired.push(rule(
        "DS-ALG-01",
        "Drug–allergy conflict (direct)",
        severe ? "emergency" : "urgent",
        `Allergy on file: "${allergy}" — the SAME substance was detected in the medication list.`,
        "Do not dispense · verify with the treating doctor before prescribing",
        [`allergy: ${allergy}`, "match: direct name in medications"],
      ));
      continue;
    }
    // 2) class cross-match: "penicillin" allergy vs amoxicillin (penicillins)
    for (const [cls, members] of medClasses) {
      const classHit = DRUG_CLASSES[cls]?.some((m) => allergy.includes(m) && m.length >= 4);
      if (classHit) {
        fired.push(rule(
          "DS-ALG-02",
          `Drug–allergy conflict (${cls} class)`,
          severe ? "emergency" : "urgent",
          `Allergy on file: "${allergy}" (${cls} class) — detected ${members.join(", ")} from the SAME class.`,
          "Class cross-reaction risk · flag to the doctor before dispensing",
          [`allergy: ${allergy}`, `same class detected: ${members.join(", ")}`],
        ));
        break;
      }
    }
  }
  return fired;
}

// ── LAYER B: drug–drug interactions ────────────────────────────────────────
const DRUG_DRUG_RULES: {
  id: string; name: string; priority: RulePriority; reason: string;
  classes: [string, string];
}[] = [
  { id: "DS-DDI-01", name: "NSAID + blood thinner", priority: "urgent",
    reason: "NSAID with an anticoagulant/antiplatelet — serious bleeding risk",
    classes: ["nsaid", "anticoagulant"] },
  { id: "DS-DDI-02", name: "NSAID + blood thinner (aspirin)", priority: "urgent",
    reason: "NSAID with aspirin therapy — bleeding risk and aspirin may stop protecting the heart",
    classes: ["nsaid", "antiplatelet"] },
  { id: "DS-DDI-03", name: "Triple whammy (NSAID + BP medicine + water pill)", priority: "urgent",
    reason: "NSAID + ACEi/ARB + diuretic together — kidney injury risk (the 'triple whammy')",
    classes: ["nsaid", "diuretic"] },
  { id: "DS-DDI-04", name: "Warfarin + antibiotic", priority: "urgent",
    reason: "Anticoagulant with a macrolide/quinolone antibiotic — blood thinning can rise dangerously",
    classes: ["anticoagulant", "macrolide"] },
  { id: "DS-DDI-05", name: "Statin + macrolide", priority: "urgent",
    reason: "Statin with macrolide antibiotic — muscle-damage (rhabdomyolysis) risk",
    classes: ["statin", "macrolide"] },
  { id: "DS-DDI-06", name: "BP medicine + potassium-sparing diuretic", priority: "urgent",
    reason: "ACEi/ARB with spironolactone — potassium can rise to unsafe levels",
    classes: ["arb", "spironolactone"] },
  { id: "DS-DDI-07", name: "NSAID + BP medicine", priority: "urgent",
    reason: "Regular NSAID use with ACEi/ARB — blood pressure control and kidney function worsen",
    classes: ["nsaid", "arb"] },
];

function checkDrugDrug(medsText: string): FiredRule[] {
  const fired: FiredRule[] = [];
  const medClasses = classesOf(medsText);
  for (const r of DRUG_DRUG_RULES) {
    const [a, b] = r.classes;
    const aHits = medClasses.get(a);
    const bHits = medClasses.get(b);
    // aspirin is in both nsaid & antiplatelet — require a different partner drug
    if (aHits && bHits && !(r.id === "DS-DDI-02" && aHits.every((h) => bHits.includes(h)))) {
      fired.push(rule(r.id, r.name, r.priority, r.reason,
        "Doctor review before dispensing · consider dose change or alternative",
        [`${a}: ${aHits.join(", ")}`, `${b}: ${bHits.join(", ")}`]));
    }
  }
  return fired;
}

// ── LAYER C: drug–condition dangers ────────────────────────────────────────
const DRUG_CONDITION_RULES: {
  id: string; name: string; priority: RulePriority; reason: string;
  drugClass: string; conditionWords: string[];
}[] = [
  { id: "DS-DC-01", name: "β-blocker with asthma/COPD", priority: "urgent",
    reason: "β-blocker detected in a patient reporting asthma/COPD — can trigger bronchospasm",
    drugClass: "beta-blocker", conditionWords: ["asthma", "copd", "wheez", "bronch", "saans"] },
  { id: "DS-DC-02", name: "NSAID with ulcer/bleeding history", priority: "urgent",
    reason: "NSAID detected with peptic ulcer / gastritis / bleeding history — bleed risk",
    drugClass: "nsaid", conditionWords: ["ulcer", "gastritis", "acidity", "bleeding"] },
  { id: "DS-DC-03", name: "NSAID with kidney disease", priority: "urgent",
    reason: "NSAID detected in a patient reporting kidney disease — further kidney damage risk",
    drugClass: "nsaid", conditionWords: ["kidney", "renal", "creatinine", "dialysis", "kidni"] },
  { id: "DS-DC-04", name: "NSAID with fever + rash (dengue season)", priority: "urgent",
    reason: "NSAID taken with fever AND rash — bleeding risk if this is dengue; paracetamol is the safe choice",
    drugClass: "nsaid", conditionWords: ["fever", "rash", "temp", "jvar", "platelet"] },
  { id: "DS-DC-05", name: "Steroid with diabetes", priority: "urgent",
    reason: "Steroid course detected in a diabetic patient — blood sugar can spike dangerously",
    drugClass: "steroid", conditionWords: ["diabet", "sugar", "hba1c", "madhumeh"] },
];

function checkDrugCondition(medsText: string, conditionsText: string): FiredRule[] {
  const fired: FiredRule[] = [];
  const medClasses = classesOf(medsText);
  const cond = conditionsText.toLowerCase();
  for (const r of DRUG_CONDITION_RULES) {
    const hits = medClasses.get(r.drugClass);
    if (hits) {
      const matched = r.conditionWords.filter((w) => cond.includes(w));
      // dengue rule needs BOTH fever-ish and rash-ish words
      const isDengue = r.id === "DS-DC-04";
      const feverish = matched.some((w) => ["fever", "temp", "jvar"].includes(w));
      const rashish = matched.some((w) => ["rash", "platelet"].includes(w));
      if (matched.length > 0 && (!isDengue || (feverish && rashish))) {
        fired.push(rule(r.id, r.name, r.priority, r.reason,
          "Doctor review · safer alternative may be needed",
          [`${r.drugClass}: ${hits.join(", ")}`, `condition mentions: ${matched.join(", ")}`]));
      }
    }
  }
  return fired;
}

// ── LAYER D: vitals said out loud ──────────────────────────────────────────
const VITALS_RULES: {
  id: string; name: string; priority: RulePriority; reason: string; action: string;
  regex: RegExp;
}[] = [
  { id: "DS-VIT-01", name: "Severe hypertension", priority: "urgent",
    reason: "Blood pressure reported at/above 180 systolic or 110 diastolic — hypertensive urgency",
    action: "BP recheck at triage · doctor review today",
    regex: /b\.?\s?p\.?\s*(\d{3})\s*[\/o]\s*(\d{2,3})/i },
  { id: "DS-VIT-02", name: "Low oxygen saturation", priority: "emergency",
    reason: "SpO₂ reported below 92% — hypoxia needs immediate attention",
    action: "Oxygen at triage · doctor NOW",
    regex: /spo2?\s*(?:is\s*)?(\d{2})\s*%?/i },
  { id: "DS-VIT-03", name: "Very high blood sugar", priority: "urgent",
    reason: "Blood sugar reported above 400 mg/dL — risk of diabetic crisis",
    action: "Urgent glucose check · hydration · doctor review today",
    regex: /(?:sugar|glucose)\s*(?:is\s*)?(\d{3})/i },
  { id: "DS-VIT-04", name: "Very high fever", priority: "urgent",
    reason: "Fever reported at/above 104°F — high fever with unknown cause",
    action: "Temperature check at triage · screen for dengue/malaria",
    regex: /(?:temp(?:erature)?|fever)\s*(?:is\s*)?(?:of\s*)?10[4-9](?:\.\d)?/i },
  { id: "DS-VIT-05", name: "Very fast heart rate", priority: "urgent",
    reason: "Pulse reported above 130/min — tachycardia needs review",
    action: "Pulse check at triage · ECG if sustained",
    regex: /(?:pulse|heart rate)\s*(?:is\s*)?(?:of\s*)?(1[3-9]\d)/i },
];

function checkVitals(transcript: string): FiredRule[] {
  const fired: FiredRule[] = [];
  for (const r of VITALS_RULES) {
    const m = transcript.toLowerCase().match(r.regex);
    if (!m) continue;
    let hit = true;
    if (r.id === "DS-VIT-01") hit = Number(m[1]) >= 180 || Number(m[2]) >= 110;
    if (r.id === "DS-VIT-02") hit = Number(m[1]) < 92 && Number(m[1]) >= 50;
    if (r.id === "DS-VIT-03") hit = Number(m[1]) > 400;
    if (hit) {
      fired.push(rule(r.id, r.name, r.priority, r.reason, r.action, [
        `patient said: "${m[0].trim()}"`,
      ]));
    }
  }
  return fired;
}

// ── public API ─────────────────────────────────────────────────────────────
function rule(
  id: string, name: string, priority: RulePriority, reason: string, action: string, evidence: string[],
): FiredRule {
  return { id, name, priority, reason, action, evidence };
}

export type DrugSafetyInput = {
  allergies: string;      // free text from the interview/record
  medications: string;    // current meds (told + extracted from documents)
  conditionsText: string; // past history / conditions transcript
  transcript?: string;    // everything the patient said (vitals mining)
};

export function checkDrugSafety(input: DrugSafetyInput): FiredRule[] {
  const meds = `${input.medications} ${input.medications}`;
  const transcript = `${input.transcript ?? ""} ${input.conditionsText}`;
  return [
    ...checkAllergy(input.allergies, meds),
    ...checkDrugDrug(meds),
    ...checkDrugCondition(meds, input.conditionsText),
    ...checkVitals(transcript),
  ];
}

/** Convenience: FiredRule[] → RedFlagResult-shaped object for merging. */
export function drugSafetyResult(rules: FiredRule[]): {
  triggered: boolean; priority: "routine" | "urgent" | "emergency"; reasons: string[]; fired: FiredRule[];
} {
  const priority = rules.some((r) => r.priority === "emergency")
    ? "emergency"
    : rules.length > 0
      ? "urgent"
      : "routine";
  return {
    triggered: rules.length > 0,
    priority,
    reasons: rules.map((r) => `${r.reason} (${r.name})`),
    fired: rules,
  };
}