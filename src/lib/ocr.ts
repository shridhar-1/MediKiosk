import type { ExtractedDocument, ExtractedLab, ExtractedMedication } from "@/db/schema";

type LabDef = {
  name: string;
  nameHi?: string;
  keys: RegExp;
  unit: string;
  low?: number;
  high?: number;
};

// Enhanced with Hindi synonyms for better multilingual OCR
const LAB_DEFS: LabDef[] = [
  { name: "Hemoglobin", nameHi: "हीमोग्लोबिन", keys: /\b(?:hb|h[ae]moglobin|हीमोग्लोबिन)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "g/dL", low: 12, high: 16 },
  { name: "WBC", keys: /\b(?:wbc|tlc|leucocyte|श्वेत रक्त कोशिका)\b[^0-9]{0,16}(\d{3,6}(?:\.\d+)?)/i, unit: "/µL", low: 4000, high: 11000 },
  { name: "Platelets", keys: /\b(?:platelet[s]?|plt|प्लेटलेट)\b[^0-9]{0,16}(\d{4,7})/i, unit: "/µL", low: 150000, high: 450000 },
  { name: "FBS", nameHi: "फास्टिंग शुगर", keys: /\b(?:fbs|fasting(?:\s+blood)?\s+sugar|fasting glucose|उपवास शर्करा)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 70, high: 100 },
  { name: "PPBS", keys: /\b(?:ppbs|post[\s-]?prandial|खाने के बाद)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 70, high: 140 },
  { name: "RBS", keys: /\b(?:rbs|random(?:\s+blood)?\s+sugar)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 70, high: 140 },
  { name: "HbA1c", keys: /\b(?:hba1c|a1c|glycated|एचबीए1सी)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "%", low: 4, high: 5.6 },
  { name: "Creatinine", nameHi: "क्रिएटिनिन", keys: /\b(?:creatinine|creat\.?|क्रिएटिनिन)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 0.6, high: 1.2 },
  { name: "Urea", keys: /\b(?:urea|bun|यूरिया)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 15, high: 40 },
  { name: "Sodium", keys: /\b(?:sodium|na\+?|सोडियम)\b[^0-9]{0,8}(\d{2,3}(?:\.\d+)?)/i, unit: "mmol/L", low: 135, high: 145 },
  { name: "Potassium", keys: /\b(?:potassium|k\+?|पोटेशियम)\b[^0-9]{0,8}(\d+(?:\.\d+)?)/i, unit: "mmol/L", low: 3.5, high: 5.1 },
  { name: "SGPT / ALT", keys: /\b(?:sgpt|alt|एसजीपीटी)\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i, unit: "U/L", low: 7, high: 56 },
  { name: "SGOT / AST", keys: /\b(?:sgot|ast|एसजीओटी)\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i, unit: "U/L", low: 10, high: 40 },
  { name: "Bilirubin (T)", keys: /\b(?:bilirubin|tbil|बिलीरुबिन)\b[^0-9]{0,16}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 0.2, high: 1.2 },
  { name: "TSH", keys: /\b(?:tsh|थायराइड)\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i, unit: "mIU/L", low: 0.4, high: 4.0 },
  { name: "LDL", keys: /\b(?:ldl|एलडीएल)\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 0, high: 100 },
  { name: "HDL", keys: /\b(?:hdl|एचडीएल)\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 40, high: 90 },
  { name: "Triglycerides", keys: /\b(?:triglyceride[s]?|tg|ट्राइग्लिसराइड)\b[^0-9]{0,10}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 0, high: 150 },
  { name: "Total cholesterol", keys: /\b(?:total cholesterol|cholesterol|कोलेस्ट्रॉल)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "mg/dL", low: 0, high: 200 },
  { name: "ESR", keys: /\b(?:esr|ईएसआर)\b[^0-9]{0,8}(\d+(?:\.\d+)?)/i, unit: "mm/hr", low: 0, high: 20 },
  { name: "CRP", keys: /\b(?:crp|सीआरपी)\b[^0-9]{0,8}(\d+(?:\.\d+)?)/i, unit: "mg/L", low: 0, high: 5 },
  { name: "Vitamin D", keys: /\b(?:vitamin d|vit d|25.?oh|cholecalciferol|विटामिन डी)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "ng/mL", low: 30, high: 100 },
  { name: "Vitamin B12", keys: /\b(?:vitamin b12|b12|cobalamin|विटामिन बी12)\b[^0-9]{0,12}(\d+(?:\.\d+)?)/i, unit: "pg/mL", low: 200, high: 900 },
];

const MED_LINE =
  /\b(metformin|glimepiride|gliclazide|insulin|amlodipine|telmisartan|losartan|enalapril|atenolol|metoprolol|atorvastatin|rosuvastatin|aspirin|clopidogrel|thyroxine|levothyroxine|pantoprazole|omeprazole|rabeprazole|paracetamol|aceclofenac|diclofenac|ibuprofen|amoxicillin|azithromycin|ciprofloxacin|metronidazole|ondansetron|domperidone|salbutamol|budesonide|montelukast|cetirizine|calcium|vitamin d|cholecalciferol|iron|folic|ecosprin|glycomet|janumet|vildagliptin|dapagliflozin|empagliflozin|isosorbide|nitroglycerin|spironolactone|furosemide|torsemide|warfarin|acenocoumarol|rivaroxaban|yogaraja guggulu|maharasnadi kwatha|kottamchukkadi|ashwagandha|triphala)\b([^.\n]{0,60})/gi;

const DIAG_LINE =
  /\b(type\s*2\s*diabetes|diabetes mellitus|t2dm|hypertension|ihd|cad|copd|asthma|hypothyroidism|ckd|nafld|anemia|anaemia|uti|enteric fever|typhoid|malaria|dengue|osteoarthritis|rheumatoid|gerd|piles|fissure|migraine|tb|tuberculosis|sandhigata vata|vata-kapha|manda agni)\b/gi;

export function extractFromText(raw: string, docType: string): ExtractedDocument {
  const text = raw.replace(/\s+/g, " ");
  const labs: ExtractedLab[] = [];
  for (const def of LAB_DEFS) {
    const m = raw.match(def.keys);
    if (!m) continue;
    const value = m[1];
    const num = Number(value);
    let abnormal = false;
    let flag: "high" | "low" | undefined;
    if (def.low !== undefined && num < def.low) {
      abnormal = true;
      flag = "low";
    }
    if (def.high !== undefined && num > def.high) {
      abnormal = true;
      flag = "high";
    }
    const ref =
      def.low !== undefined && def.high !== undefined ? `${def.low}–${def.high}` : "—";
    labs.push({ name: def.name, value, unit: def.unit, reference: ref, abnormal, flag });
  }

  const medications: ExtractedMedication[] = [];
  const seenMed = new Set<string>();
  let medMatch: RegExpExecArray | null;
  const medRe = new RegExp(MED_LINE.source, "gi");
  while ((medMatch = medRe.exec(raw)) !== null) {
    const name = medMatch[1].replace(/\b\w/g, (c) => c.toUpperCase());
    if (seenMed.has(name.toLowerCase())) continue;
    seenMed.add(name.toLowerCase());
    const rest = medMatch[2] ?? "";
    const dose = rest.match(/(\d+\s*(?:mg|mcg|g|iu|units|%|ml))/i)?.[1] ?? "";
    const frequency =
      rest.match(/\b(od|bd|tds|qid|hs|sos|once daily|twice daily|thrice|2 bd|bd)\b/i)?.[1] ?? "";
    medications.push({
      name,
      dose,
      frequency: frequency.toUpperCase(),
      duration: rest.match(/(\d+\s*(?:day|days|week|weeks|month|months))/i)?.[1] ?? "",
    });
  }

  const diagnoses: string[] = [];
  const diagRe = new RegExp(DIAG_LINE.source, "gi");
  let d: RegExpExecArray | null;
  while ((d = diagRe.exec(raw)) !== null) {
    const name = d[1].replace(/\s+/g, " ");
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    if (!diagnoses.some((x) => x.toLowerCase() === pretty.toLowerCase())) diagnoses.push(pretty);
  }

  const procedures: string[] = [];
  if (/cholecystectomy|gall\s*bladder/i.test(raw)) procedures.push("Cholecystectomy");
  if (/appendectomy|appendicectomy/i.test(raw)) procedures.push("Appendicectomy");
  if (/cabg|bypass/i.test(raw)) procedures.push("CABG");
  if (/stent|ptca|angioplasty/i.test(raw)) procedures.push("Coronary angioplasty / stent");
  if (/hysterectomy/i.test(raw)) procedures.push("Hysterectomy");
  if (/cataract/i.test(raw)) procedures.push("Cataract surgery");
  if (/kottamchukkadi|lepa/i.test(raw)) procedures.push("Ayurvedic Lepa / Panchakarma");
  if (/yogaraja guggulu|maharasnadi/i.test(raw)) procedures.push("Ayurvedic Shamana");

  const notes = text.slice(0, 500);
  const confidence = Math.min(
    0.95,
    0.35 + labs.length * 0.08 + medications.length * 0.07 + diagnoses.length * 0.08,
  );

  return {
    diagnoses,
    medications,
    labs,
    procedures,
    notes: notes || `${docType} uploaded — OCR extracted ${text.length} chars, confidence ${(confidence*100).toFixed(0)}%`,
    confidence,
  };
}

export const SAMPLE_DOCUMENTS: {
  id: string;
  fileName: string;
  docType: string;
  documentDate: string;
  facilityName: string;
  sourceText: string;
}[] = [
  {
    id: "lab-biochem",
    fileName: "AIIMS_Biochem_12Mar2026.pdf",
    docType: "lab",
    documentDate: "2026-03-12",
    facilityName: "AIIMS New Delhi — Clinical Biochemistry",
    sourceText: `
AIIMS New Delhi  Clinical Biochemistry
Date: 12 Mar 2026
Fasting Blood Sugar 168 mg/dL (70-100)
PPBS 246 mg/dL (70-140)
HbA1c 8.4 % (4-5.6)
Creatinine 1.4 mg/dL (0.6-1.2)
Urea 42 mg/dL
Sodium 138
Potassium 4.1
LDL 148 mg/dL
HDL 36 mg/dL
Triglycerides 210
Total cholesterol 224
Vitamin D 18 ng/mL (30-100) LOW
Impression: Uncontrolled T2DM, dyslipidaemia, borderline creatinine, Vit D deficiency.
    `,
  },
  {
    id: "rx-medicine",
    fileName: "Safdarjung_OPD_Rx.jpg",
    docType: "prescription",
    documentDate: "2026-02-02",
    facilityName: "Safdarjung Hospital — Medicine OPD",
    sourceText: `
Safdarjung Hospital Medicine OPD 02/02/2026
Dx: Type 2 Diabetes Mellitus, Hypertension
Tab Metformin 500 mg BD
Tab Glimepiride 1 mg OD
Tab Amlodipine 5 mg OD
Tab Atorvastatin 10 mg HS
Tab Ecosprin 75 mg OD
Review with FBS, HbA1c
    `,
  },
  {
    id: "discharge",
    fileName: "KEM_Discharge_2024.pdf",
    docType: "discharge",
    documentDate: "2024-11-18",
    facilityName: "KEM Hospital, Mumbai",
    sourceText: `
Discharge Summary — KEM Hospital
Admission: 14 Nov 2024  Discharge: 18 Nov 2024
Diagnosis: Unstable angina, Hypertension, Type 2 Diabetes Mellitus
Procedure: Coronary angiography — mid LAD 70% stenosis, medical management
Medications: Aspirin 75 mg OD, Clopidogrel 75 mg OD, Metoprolol 25 mg BD, Atorvastatin 40 mg HS, Insulin, Pantoprazole 40 mg
Advice: Urgent cardiology follow-up, avoid exertion
    `,
  },
  {
    id: "ayush-rx",
    fileName: "National_Ayurveda_Rx.pdf",
    docType: "prescription",
    documentDate: "2026-01-20",
    facilityName: "All India Institute of Ayurveda, New Delhi",
    sourceText: `
AIIA Kayachikitsa OPD
Vikriti: Vata-Kapha, Manda agni, Krura koshtha
Sandhigata vata (osteoarthritis knees)
Rx: Yogaraja guggulu 2 BD
Maharasnadi kwatha 20 ml BD
Local kottamchukkadi lepa
Advice: warm food, avoid day sleep, light walking
    `,
  },
];

export function summarizeDocuments(
  docs: { extractedJson: ExtractedDocument | null; documentDate: string | null; facilityName: string | null; docType: string }[],
): { investigationsSummary: string; medicationsExtracted: string } {
  const labs: string[] = [];
  const meds: string[] = [];
  const dx: string[] = [];
  const ordered = [...docs].sort((a, b) => (a.documentDate ?? "").localeCompare(b.documentDate ?? ""));
  for (const d of ordered) {
    const x = d.extractedJson;
    if (!x) continue;
    for (const lab of x.labs) {
      const mark = lab.abnormal ? (lab.flag === "low" ? "↓" : "↑") : "";
      labs.push(
        `${lab.name} ${lab.value} ${lab.unit}${mark}${d.documentDate ? ` (${d.documentDate})` : ""}`,
      );
    }
    for (const m of x.medications) {
      meds.push([m.name, m.dose, m.frequency].filter(Boolean).join(" "));
    }
    dx.push(...x.diagnoses);
  }
  const uniqueMeds = [...new Set(meds)];
  const uniqueDx = [...new Set(dx)];
  const investigationsSummary = [
    uniqueDx.length ? `Prior diagnoses on papers: ${uniqueDx.join("; ")}.` : "",
    labs.length ? `Investigations (chronological extract): ${labs.join("; ")}.` : "No structured lab values extracted. AI has scanned documents but no lab patterns matched - may need manual review.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    investigationsSummary,
    medicationsExtracted: uniqueMeds.length
      ? uniqueMeds.join("; ")
      : "No medications extracted from documents. Patient may need to confirm from physical papers.",
  };
}