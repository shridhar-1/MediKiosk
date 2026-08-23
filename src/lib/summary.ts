import type { AyushAssessment } from "@/db/schema";
import { optionLabel, questionById } from "./interview";
import type { CareMode } from "./types";

type Ans = { values: string[]; text: string };

function labels(questionId: string, values: string[]): string[] {
  const q = questionById(questionId);
  if (!q) return values;
  return values
    .filter((v) => v !== "yes" && v !== "no" && v !== "none_assoc" && v !== "none_pmh" && v !== "fam_none" && v !== "ros_none" && v !== "no_travel" && v !== "nothing_worse" && v !== "nothing_better")
    .map((v) => optionLabel(q, v, "en"));
}

function has(ans: Ans | undefined, id: string): boolean {
  return Boolean(ans?.values.includes(id));
}

function complaintPhrase(answers: Record<string, Ans>): string {
  const chief = answers.chief_complaint;
  if (!chief) return "unspecified complaint";
  if (chief.values[0] === "other" || chief.text) {
    return chief.text || labels("chief_complaint", chief.values).join(", ") || "unspecified complaint";
  }
  return labels("chief_complaint", chief.values).join(", ") || "unspecified complaint";
}

function durationPhrase(answers: Record<string, Ans>): string {
  const map: Record<string, string> = {
    hours: "for a few hours",
    today: "since today",
    days_2_3: "for 2–3 days",
    week: "for about a week",
    weeks: "for 2–4 weeks",
    months: "for more than a month",
    years: "for many months to years",
  };
  const id = answers.duration?.values[0];
  return id ? map[id] ?? id : "of unspecified duration";
}

export function buildHpi(patient: { age: number; gender: string }, answers: Record<string, Ans>): string {
  const genderWord =
    patient.gender === "female" ? "woman" : patient.gender === "male" ? "man" : "adult";
  const complaint = complaintPhrase(answers);
  const onsetMap: Record<string, string> = {
    sudden: "Onset was sudden",
    gradual: "Onset was gradual",
    after_food: "Symptoms began after food",
    after_exertion: "Symptoms began after exertion",
    after_injury: "Symptoms followed an injury or fall",
    unsure: "Onset is uncertain",
  };
  const courseMap: Record<string, string> = {
    worse: "The course is worsening",
    same: "The course is unchanged",
    better: "There has been slight improvement",
    comes_goes: "Symptoms are intermittent",
  };

  const parts: string[] = [
    `${patient.age}-year-old ${genderWord} presenting with ${complaint} ${durationPhrase(answers)}.`,
  ];

  const onset = answers.onset?.values[0];
  if (onset && onsetMap[onset]) parts.push(`${onsetMap[onset]}.`);
  const course = answers.course?.values[0];
  if (course && courseMap[course]) parts.push(`${courseMap[course]}.`);

  if (answers.pain_site || answers.pain_character) {
    const site = labels("pain_site", answers.pain_site?.values ?? []);
    const character = labels("pain_character", answers.pain_character?.values ?? []);
    const rad = labels("pain_radiation", answers.pain_radiation?.values ?? []);
    const sev = answers.severity?.values[0];
    let pain = "Pain";
    if (site.length) pain += ` is localised to the ${site.join(", ").toLowerCase()}`;
    if (character.length) pain += `${site.length ? " and" : ""} is ${character.join(", ").toLowerCase()} in character`;
    pain += ".";
    if (rad.length) pain += ` It radiates to the ${rad.join(", ").toLowerCase()}.`;
    if (sev) pain += ` Severity is ${sev}/10 at present.`;
    parts.push(pain);
  }

  const agg = labels("aggravating", answers.aggravating?.values ?? []);
  const rel = labels("relieving", answers.relieving?.values ?? []);
  if (agg.length) parts.push(`Aggravated by ${agg.join(", ").toLowerCase()}.`);
  if (rel.length) parts.push(`Relieved by ${rel.join(", ").toLowerCase()}.`);

  if (answers.fever_pattern?.values.length) {
    parts.push(`Fever pattern: ${labels("fever_pattern", answers.fever_pattern.values).join(", ").toLowerCase()}.`);
  }

  const assoc = labels("associated", answers.associated?.values ?? []);
  if (assoc.length) parts.push(`Associated symptoms: ${assoc.join(", ").toLowerCase()}.`);
  else if (has(answers.associated, "none_assoc")) parts.push("No associated red-flag symptoms reported.");

  return parts.join(" ");
}

export function buildPastMedical(answers: Record<string, Ans>): string {
  if (has(answers.pmh, "none_pmh") || !answers.pmh?.values.length) {
    return "No previously diagnosed chronic illnesses reported.";
  }
  return `Known history of ${labels("pmh", answers.pmh.values).join(", ")}.`;
}

export function buildPastSurgical(answers: Record<string, Ans>): string {
  if (!answers.surgery || has(answers.surgery, "no")) return "No prior surgeries reported.";
  const detail = answers.surgery_detail?.text?.trim();
  return detail ? `Prior surgery: ${detail}.` : "Prior surgery reported; details not recalled.";
}

export function buildDrugs(answers: Record<string, Ans>): string {
  if (!answers.medications || has(answers.medications, "no")) {
    return "Not currently taking regular medicines (patient report).";
  }
  const detail = answers.medications_detail?.text?.trim();
  return detail
    ? `Current medicines (patient report): ${detail}.`
    : "Takes regular medicines; names to be confirmed from documents / bottles.";
}

export function buildAllergies(answers: Record<string, Ans>): string {
  if (!answers.allergies || has(answers.allergies, "no")) return "No known drug or food allergies.";
  const detail = answers.allergies_detail?.text?.trim();
  return detail ? `Allergies: ${detail}.` : "Allergy reported; agent not specified.";
}

export function buildFamily(answers: Record<string, Ans>): string {
  if (has(answers.family, "fam_none") || !answers.family?.values.length) {
    return "No significant family history volunteered.";
  }
  return `Family history of ${labels("family", answers.family.values).join(", ")}.`;
}

export function buildPersonal(answers: Record<string, Ans>): string {
  const bits: string[] = [];
  const tobMap: Record<string, string> = {
    never_tob: "never used tobacco",
    former_tob: "former tobacco user",
    smoke: "current smoker",
    chew: "chews tobacco / gutka",
    both_tob: "smokes and chews tobacco",
  };
  const alcMap: Record<string, string> = {
    never_alc: "no alcohol",
    occasional: "occasional alcohol",
    weekly: "weekly alcohol",
    daily_alc: "almost daily alcohol",
    stopped_alc: "former alcohol use",
  };
  const t = answers.tobacco?.values[0];
  const a = answers.alcohol?.values[0];
  if (t && tobMap[t]) bits.push(tobMap[t]);
  if (a && alcMap[a]) bits.push(alcMap[a]);
  const diet = labels("diet_sleep", answers.diet_sleep?.values ?? []);
  if (diet.length) bits.push(diet.join(", ").toLowerCase());
  const occ = answers.occupation?.text?.trim();
  if (occ) bits.push(`occupation: ${occ}`);
  return bits.length ? `${bits.join("; ")}.` : "Personal history not elaborated.";
}

export function buildRos(answers: Record<string, Ans>): string {
  if (has(answers.ros, "ros_none") || !answers.ros?.values.length) {
    return "Review of systems otherwise unremarkable on screening.";
  }
  return `Additional positives on ROS: ${labels("ros", answers.ros.values).join(", ")}.`;
}

export function buildAyush(answers: Record<string, Ans>): AyushAssessment | null {
  const pick = (id: string) => {
    const q = answers[id];
    if (!q) return "";
    const named = labels(id, q.values);
    return [named.join(", "), q.text].filter(Boolean).join(" — ");
  };
  const prakriti = pick("prakriti_body");
  if (!prakriti && !pick("agni")) return null;
  const ageBand = "";
  return {
    prakriti,
    vikriti: "Inferred from presenting dosha-leaning symptoms; confirm on examination.",
    sara: "Not formally graded at kiosk — examine rasa/rakta/mamsa clinically.",
    samhanana: pick("prakriti_body"),
    pramana: "Anthropometry to be recorded at vitals desk.",
    satmya: pick("satmya"),
    sattva: pick("sattva"),
    aharaShakti: pick("agni"),
    vyayamaShakti: pick("vyayama"),
    vaya: ageBand,
    agni: pick("agni"),
    koshtha: pick("koshtha"),
    ahara: pick("ahara"),
    vihara: pick("vihara"),
    nidana: pick("nidana"),
  };
}

export function generateSummaryFields(
  patient: { age: number; gender: string },
  answers: Record<string, Ans>,
  mode: CareMode,
  investigationsSummary: string,
  medicationsExtracted: string,
): {
  chiefComplaint: string;
  hpi: string;
  pastMedical: string;
  pastSurgical: string;
  drugs: string;
  allergies: string;
  familyHistory: string;
  personalHistory: string;
  reviewOfSystems: string;
  ayushAssessment: AyushAssessment | null;
  investigationsSummary: string;
  medicationsExtracted: string;
} {
  return {
    chiefComplaint: `${complaintPhrase(answers)} ${durationPhrase(answers)}`,
    hpi: buildHpi(patient, answers),
    pastMedical: buildPastMedical(answers),
    pastSurgical: buildPastSurgical(answers),
    drugs: buildDrugs(answers),
    allergies: buildAllergies(answers),
    familyHistory: buildFamily(answers),
    personalHistory: buildPersonal(answers),
    reviewOfSystems: buildRos(answers),
    ayushAssessment: mode === "ayush" ? buildAyush(answers) : null,
    investigationsSummary,
    medicationsExtracted,
  };
}
