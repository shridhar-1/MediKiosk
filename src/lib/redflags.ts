export type RedFlagResult = {
  triggered: boolean;
  priority: "routine" | "urgent" | "emergency";
  reasons: string[];
};

const EMERGENCY_OPTIONS = new Set([
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

export function evaluateRedFlags(
  answers: Record<string, { values: string[]; text: string }>,
): RedFlagResult {
  const reasons: string[] = [];
  const allValues = new Set<string>();
  for (const a of Object.values(answers)) {
    for (const v of a.values) allValues.add(v);
  }

  const chief = answers.chief_complaint?.values[0] ?? "";
  const associated = new Set(answers.associated?.values ?? []);
  const onset = answers.onset?.values[0] ?? "";
  const duration = answers.duration?.values[0] ?? "";
  const site = answers.pain_site?.values[0] ?? "";
  const character = answers.pain_character?.values[0] ?? "";
  const radiation = new Set(answers.pain_radiation?.values ?? []);
  const severity = Number(answers.severity?.values[0] ?? 0);

  const acsLike =
    chief === "chest_pain" ||
    site === "center_chest" ||
    site === "left_chest" ||
    character === "squeezing";

  if (
    acsLike &&
    (associated.has("dyspnoea") ||
      associated.has("sweating") ||
      associated.has("syncope") ||
      radiation.has("left_arm") ||
      radiation.has("jaw_neck") ||
      chief === "breathless")
  ) {
    reasons.push(
      "Possible acute coronary syndrome — chest pain with dyspnoea, diaphoresis, syncope or radiation to arm/jaw",
    );
  }

  if (chief === "chest_pain" && onset === "sudden" && duration === "hours") {
    reasons.push("Sudden-onset chest pain of a few hours — needs same-hour triage");
  }

  if (chief === "breathless" && (onset === "sudden" || associated.has("syncope"))) {
    reasons.push("Acute breathlessness — rule out PE, ACS, severe asthma");
  }

  if (associated.has("speech") || associated.has("weak_side") || associated.has("vision")) {
    reasons.push("Possible stroke / TIA — FAST-positive symptoms");
  }

  if (
    (chief === "headache" || associated.has("neck_stiff") || associated.has("confusion")) &&
    (associated.has("neck_stiff") || associated.has("confusion") || associated.has("rash"))
  ) {
    reasons.push("Headache with meningism, rash or altered sensorium");
  }

  if (associated.has("blood_vomit") || associated.has("blood_stool")) {
    reasons.push("Gastrointestinal bleed");
  }

  if (associated.has("blood_cough")) {
    reasons.push("Haemoptysis");
  }

  if (associated.has("syncope") && (acsLike || chief === "breathless")) {
    reasons.push("Syncope with cardiorespiratory symptoms");
  }

  if (severity >= 8 && (chief === "chest_pain" || chief === "abdomen" || chief === "headache")) {
    reasons.push(`Severe pain score ${severity}/10`);
  }

  const feverHigh =
    answers.fever_pattern?.values.includes("high_continuous") || chief === "fever";
  if (feverHigh && (associated.has("rash") || associated.has("neck_stiff") || associated.has("confusion"))) {
    reasons.push("Fever with rash, neck stiffness or confusion");
  }

  for (const v of allValues) {
    if (EMERGENCY_OPTIONS.has(v) && !reasons.length) {
      reasons.push("Red-flag symptom selected during interview");
      break;
    }
  }

  const unique = [...new Set(reasons)];
  const emergency = unique.some(
    (r) =>
      r.includes("coronary") ||
      r.includes("stroke") ||
      r.includes("meningism") ||
      r.includes("bleed") ||
      r.includes("Haemoptysis") ||
      r.includes("Syncope"),
  );

  return {
    triggered: unique.length > 0,
    priority: emergency ? "emergency" : unique.length > 0 ? "urgent" : "routine",
    reasons: unique,
  };
}
