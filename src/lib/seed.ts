import { db } from "@/db";
import {
  clinicalSummaries,
  consents,
  documents,
  hisEvents,
  historyResponses,
  patients,
  sessions,
  staff,
  type ExtractedDocument,
} from "@/db/schema";
import { hashSecret } from "@/lib/auth";
import { extractFromText, SAMPLE_DOCUMENTS } from "@/lib/ocr";
import { nid } from "@/lib/ids";
import { count, eq, isNull } from "drizzle-orm";

type SeedAns = Record<string, { values: string[]; text: string }>;

function responses(sessionId: string, answers: SeedAns) {
  return Object.entries(answers).map(([key, a]) => ({
    id: nid(),
    sessionId,
    section: key.startsWith("prakriti") || ["agni", "koshtha", "ahara", "vihara", "vyayama", "sattva", "nidana", "satmya"].includes(key)
      ? "ayush"
      : key,
    questionKey: key,
    questionText: key,
    answerText: a.text || a.values.join(", "),
    answerJson: a,
    inputMode: "touch" as const,
  }));
}

async function seedStaff(): Promise<void> {
  const [{ value }] = await db.select({ value: count() }).from(staff);
  if (value > 0) return;
  await db.insert(staff).values([
    {
      id: nid(),
      email: "physician@medikiosk.in",
      passwordHash: hashSecret("kiosk@2026"),
      fullName: "Dr. Ananya Mehta",
      role: "physician",
      designation: "Senior Resident",
      department: "general_medicine",
      hospital: "District Hospital, Narela",
    },
    {
      id: nid(),
      email: "triage@medikiosk.in",
      passwordHash: hashSecret("triage@2026"),
      fullName: "Sr. Kavita Rao",
      role: "triage",
      designation: "Triage Nurse",
      department: "emergency",
      hospital: "District Hospital, Narela",
    },
    {
      id: nid(),
      email: "admin@medikiosk.in",
      passwordHash: hashSecret("admin@2026"),
      fullName: "Rajeev Sharma",
      role: "admin",
      designation: "Medical Superintendent",
      department: "administration",
      hospital: "District Hospital, Narela",
    },
    {
      id: nid(),
      email: "vaidya@medikiosk.in",
      passwordHash: hashSecret("ayush@2026"),
      fullName: "Dr. Meenakshi Iyer",
      role: "physician",
      designation: "Vaidya, Kayachikitsa",
      department: "ayush_kayachikitsa",
      hospital: "District Hospital, Narela",
    },
  ]);
}

async function backfillPins(): Promise<void> {
  const missing = await db.select().from(patients).where(isNull(patients.pinHash));
  for (const p of missing) {
    await db.update(patients).set({ pinHash: hashSecret("1234") }).where(eq(patients.id, p.id));
  }
}

export async function seedIfEmpty(): Promise<{ seeded: boolean; patients: number }> {
  await seedStaff();
  const [{ value }] = await db.select({ value: count() }).from(patients);
  if (value > 0) {
    await backfillPins();
    return { seeded: false, patients: value };
  }

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
  const DEMO_PIN = hashSecret("1234");

  const p1 = nid();
  const p2 = nid();
  const p3 = nid();
  const p4 = nid();
  const p5 = nid();
  const p6 = nid();
  const p7 = nid();

  await db.insert(patients).values([
    {
      id: p1,
      abhaId: "12-3456-7890-1234",
      aadhaarLast4: "8821",
      fullName: "Ramesh Kumar",
      age: 58,
      gender: "male",
      phone: "9810011122",
      preferredLanguage: "hi",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(6),
    },
    {
      id: p2,
      abhaId: "98-7654-3210-5566",
      aadhaarLast4: "4402",
      fullName: "Fatima Begum",
      age: 34,
      gender: "female",
      phone: "9001122334",
      preferredLanguage: "bn",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(4),
    },
    {
      id: p3,
      abhaId: "11-2233-4455-6677",
      fullName: "Lakshmi Venkatesh",
      age: 46,
      gender: "female",
      phone: "9845012345",
      preferredLanguage: "ta",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(3),
    },
    {
      id: p4,
      abhaId: "22-8899-0011-2233",
      fullName: "Suresh Patil",
      age: 62,
      gender: "male",
      phone: "9822099887",
      preferredLanguage: "mr",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(5),
    },
    {
      id: p5,
      fullName: "Asha Devi",
      age: 71,
      gender: "female",
      phone: "9415001122",
      preferredLanguage: "hi",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(2),
    },
    {
      id: p6,
      abhaId: "33-1100-2200-3300",
      fullName: "Mohammed Irfan",
      age: 29,
      gender: "male",
      phone: "9876543210",
      preferredLanguage: "hi",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(1),
    },
    {
      id: p7,
      abhaId: "44-5566-7788-9900",
      fullName: "Priya Nair",
      age: 24,
      gender: "female",
      phone: "9988776655",
      preferredLanguage: "en",
      pinHash: DEMO_PIN,
      createdAt: hoursAgo(8),
    },
  ]);

  const s1 = nid();
  const s2 = nid();
  const s3 = nid();
  const s4 = nid();
  const s5 = nid();
  const s6 = nid();
  const s7 = nid();

  await db.insert(sessions).values([
    {
      id: s1,
      patientId: p1,
      department: "cardiology",
      mode: "allopathic",
      language: "hi",
      status: "submitted",
      tokenNumber: "CAR-0041",
      priority: "emergency",
      redFlagTriggered: true,
      redFlagReasons: [
        "Possible acute coronary syndrome — chest pain with dyspnoea, diaphoresis, syncope or radiation to arm/jaw",
      ],
      startedAt: hoursAgo(1.2),
      submittedAt: hoursAgo(0.8),
    },
    {
      id: s2,
      patientId: p2,
      department: "general_medicine",
      mode: "allopathic",
      language: "bn",
      status: "submitted",
      tokenNumber: "MED-0188",
      priority: "urgent",
      redFlagTriggered: true,
      redFlagReasons: ["Fever with rash, neck stiffness or confusion"],
      startedAt: hoursAgo(2.1),
      submittedAt: hoursAgo(1.6),
    },
    {
      id: s3,
      patientId: p3,
      department: "ayush_kayachikitsa",
      mode: "ayush",
      language: "ta",
      status: "submitted",
      tokenNumber: "AYU-0009",
      priority: "routine",
      redFlagTriggered: false,
      redFlagReasons: [],
      startedAt: hoursAgo(3),
      submittedAt: hoursAgo(2.4),
    },
    {
      id: s4,
      patientId: p4,
      department: "general_medicine",
      mode: "allopathic",
      language: "mr",
      status: "reviewed",
      tokenNumber: "MED-0152",
      priority: "routine",
      redFlagTriggered: false,
      redFlagReasons: [],
      startedAt: hoursAgo(5),
      submittedAt: hoursAgo(4.4),
      reviewedAt: hoursAgo(3.8),
      reviewedBy: "Dr. Mehta",
      physicianNotes: "Uncontrolled T2DM + HTN. Intensify metformin, add SGLT2, repeat creatinine in 2 weeks. Cardiology OPD for known LAD lesion.",
    },
    {
      id: s5,
      patientId: p5,
      department: "general_medicine",
      mode: "allopathic",
      language: "hi",
      status: "submitted",
      tokenNumber: "MED-0194",
      priority: "urgent",
      redFlagTriggered: true,
      redFlagReasons: ["Headache with meningism, rash or altered sensorium"],
      startedAt: hoursAgo(0.7),
      submittedAt: hoursAgo(0.3),
    },
    {
      id: s6,
      patientId: p6,
      department: "surgery",
      mode: "allopathic",
      language: "hi",
      status: "submitted",
      tokenNumber: "SUR-0063",
      priority: "urgent",
      redFlagTriggered: true,
      redFlagReasons: ["Gastrointestinal bleed"],
      startedAt: hoursAgo(0.9),
      submittedAt: hoursAgo(0.5),
    },
    {
      id: s7,
      patientId: p7,
      department: "pulmonology",
      mode: "allopathic",
      language: "en",
      status: "reviewed",
      tokenNumber: "PUL-0021",
      priority: "routine",
      redFlagTriggered: false,
      redFlagReasons: [],
      startedAt: hoursAgo(8),
      submittedAt: hoursAgo(7.4),
      reviewedAt: hoursAgo(7),
      reviewedBy: "Dr. Iyer",
      physicianNotes: "Post-viral cough. No red flags. Supportive care, review if haemoptysis.",
    },
  ]);

  const a1: SeedAns = {
    chief_complaint: { values: ["chest_pain"], text: "" },
    duration: { values: ["hours"], text: "" },
    onset: { values: ["sudden"], text: "" },
    course: { values: ["worse"], text: "" },
    pain_site: { values: ["center_chest"], text: "" },
    pain_character: { values: ["squeezing"], text: "" },
    pain_radiation: { values: ["left_arm", "jaw_neck"], text: "" },
    severity: { values: ["8"], text: "" },
    aggravating: { values: ["walking"], text: "" },
    relieving: { values: ["rest_better"], text: "" },
    associated: { values: ["sweating", "dyspnoea", "nausea"], text: "" },
    pmh: { values: ["diabetes", "hypertension"], text: "" },
    surgery: { values: ["no"], text: "" },
    medications: { values: ["yes"], text: "" },
    medications_detail: { values: ["yes"], text: "Metformin, amlodipine" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_heart", "fam_diabetes"], text: "" },
    tobacco: { values: ["smoke"], text: "" },
    alcohol: { values: ["occasional"], text: "" },
    diet_sleep: { values: ["mixed_diet", "sedentary"], text: "" },
    occupation: { values: [], text: "Auto driver" },
    ros: { values: ["ros_chest", "ros_breath"], text: "" },
  };

  const a2: SeedAns = {
    chief_complaint: { values: ["fever"], text: "" },
    duration: { values: ["days_2_3"], text: "" },
    onset: { values: ["gradual"], text: "" },
    course: { values: ["worse"], text: "" },
    fever_pattern: { values: ["high_continuous"], text: "" },
    associated: { values: ["rash", "neck_stiff", "nausea"], text: "" },
    pmh: { values: ["none_pmh"], text: "" },
    surgery: { values: ["no"], text: "" },
    medications: { values: ["no"], text: "" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_none"], text: "" },
    tobacco: { values: ["never_tob"], text: "" },
    alcohol: { values: ["never_alc"], text: "" },
    diet_sleep: { values: ["mixed_diet", "sleep_poor"], text: "" },
    occupation: { values: [], text: "School teacher" },
    ros: { values: ["ros_fever"], text: "" },
  };

  const a3: SeedAns = {
    chief_complaint: { values: ["joint"], text: "" },
    duration: { values: ["years"], text: "" },
    onset: { values: ["gradual"], text: "" },
    course: { values: ["comes_goes"], text: "" },
    pain_site: { values: ["joints"], text: "" },
    pain_character: { values: ["dull"], text: "" },
    pain_radiation: { values: ["no_travel"], text: "" },
    severity: { values: ["5"], text: "" },
    aggravating: { values: ["walking"], text: "" },
    relieving: { values: ["rest_better", "medicine_better"], text: "" },
    associated: { values: ["none_assoc"], text: "" },
    pmh: { values: ["none_pmh"], text: "" },
    surgery: { values: ["no"], text: "" },
    medications: { values: ["yes"], text: "" },
    medications_detail: { values: ["yes"], text: "Yogaraja guggulu, occasional diclofenac" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_none"], text: "" },
    tobacco: { values: ["never_tob"], text: "" },
    alcohol: { values: ["never_alc"], text: "" },
    diet_sleep: { values: ["veg", "sleep_ok"], text: "" },
    occupation: { values: [], text: "Homemaker" },
    ros: { values: ["ros_none"], text: "" },
    prakriti_body: { values: ["vata_body"], text: "" },
    agni: { values: ["manda"], text: "" },
    koshtha: { values: ["krura"], text: "" },
    ahara: { values: [], text: "Rice, sambar, leftover dinner, three cups filter coffee, little warm water" },
    vihara: { values: [], text: "Sleep 12–5 am, long sitting for puja work, no regular walk" },
    vyayama: { values: ["avara_ex"], text: "" },
    sattva: { values: ["madhyama_sat"], text: "" },
    nidana: { values: [], text: "Cold season, day sleep, dry leftover food" },
    satmya: { values: [], text: "Filter coffee, spicy pickles" },
  };

  const a4: SeedAns = {
    chief_complaint: { values: ["diabetes_fu"], text: "" },
    duration: { values: ["years"], text: "" },
    onset: { values: ["gradual"], text: "" },
    course: { values: ["same"], text: "" },
    associated: { values: ["none_assoc"], text: "" },
    pmh: { values: ["diabetes", "hypertension", "heart"], text: "" },
    surgery: { values: ["yes"], text: "" },
    surgery_detail: { values: ["yes"], text: "Coronary angiography 2024, medical management" },
    medications: { values: ["yes"], text: "" },
    medications_detail: { values: ["yes"], text: "Metformin, glimepiride, amlodipine, atorvastatin, ecosprin" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_diabetes", "fam_heart"], text: "" },
    tobacco: { values: ["former_tob"], text: "" },
    alcohol: { values: ["stopped_alc"], text: "" },
    diet_sleep: { values: ["veg", "sedentary"], text: "" },
    occupation: { values: [], text: "Retired clerk" },
    ros: { values: ["ros_none"], text: "" },
  };

  const a5: SeedAns = {
    chief_complaint: { values: ["headache"], text: "" },
    duration: { values: ["today"], text: "" },
    onset: { values: ["sudden"], text: "" },
    course: { values: ["worse"], text: "" },
    pain_site: { values: ["head"], text: "" },
    pain_character: { values: ["throbbing"], text: "" },
    pain_radiation: { values: ["neck_stiff"], text: "" },
    severity: { values: ["9"], text: "" },
    associated: { values: ["nausea", "neck_stiff", "confusion"], text: "" },
    pmh: { values: ["hypertension"], text: "" },
    surgery: { values: ["no"], text: "" },
    medications: { values: ["yes"], text: "" },
    medications_detail: { values: ["yes"], text: "Amlodipine" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_bp"], text: "" },
    tobacco: { values: ["never_tob"], text: "" },
    alcohol: { values: ["never_alc"], text: "" },
    diet_sleep: { values: ["veg", "sleep_poor"], text: "" },
    occupation: { values: [], text: "Lives with son" },
    ros: { values: ["ros_none"], text: "" },
  };

  const a6: SeedAns = {
    chief_complaint: { values: ["abdomen"], text: "" },
    duration: { values: ["days_2_3"], text: "" },
    onset: { values: ["gradual"], text: "" },
    course: { values: ["worse"], text: "" },
    pain_site: { values: ["upper_belly"], text: "" },
    pain_character: { values: ["burning"], text: "" },
    pain_radiation: { values: ["back_rad"], text: "" },
    severity: { values: ["7"], text: "" },
    associated: { values: ["blood_vomit", "nausea"], text: "" },
    pmh: { values: ["none_pmh"], text: "" },
    surgery: { values: ["no"], text: "" },
    medications: { values: ["yes"], text: "" },
    medications_detail: { values: ["yes"], text: "Frequent over-the-counter painkillers" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_none"], text: "" },
    tobacco: { values: ["chew"], text: "" },
    alcohol: { values: ["weekly"], text: "" },
    diet_sleep: { values: ["mixed_diet", "poor_appetite"], text: "" },
    occupation: { values: [], text: "Warehouse loader" },
    ros: { values: ["ros_stool"], text: "" },
  };

  const a7: SeedAns = {
    chief_complaint: { values: ["cough"], text: "" },
    duration: { values: ["week"], text: "" },
    onset: { values: ["gradual"], text: "" },
    course: { values: ["better"], text: "" },
    associated: { values: ["cough_assoc", "sputum"], text: "" },
    pmh: { values: ["none_pmh"], text: "" },
    surgery: { values: ["no"], text: "" },
    medications: { values: ["yes"], text: "" },
    medications_detail: { values: ["yes"], text: "Cough syrup, paracetamol" },
    allergies: { values: ["no"], text: "" },
    family: { values: ["fam_none"], text: "" },
    tobacco: { values: ["never_tob"], text: "" },
    alcohol: { values: ["never_alc"], text: "" },
    diet_sleep: { values: ["mixed_diet", "sleep_ok"], text: "" },
    occupation: { values: [], text: "Software engineer" },
    ros: { values: ["ros_none"], text: "" },
  };

  await db.insert(historyResponses).values([
    ...responses(s1, a1),
    ...responses(s2, a2),
    ...responses(s3, a3),
    ...responses(s4, a4),
    ...responses(s5, a5),
    ...responses(s6, a6),
    ...responses(s7, a7),
  ]);

  const consentTypes = ["data_capture", "document_scan", "his_push", "abha_share"];
  await db.insert(consents).values(
    [s1, s2, s3, s4, s5, s6, s7].flatMap((sid) =>
      consentTypes.map((consentType) => ({
        id: nid(),
        sessionId: sid,
        consentType,
        granted: true,
        audioExplained: true,
        grantedAt: hoursAgo(2),
      })),
    ),
  );

  const lab = SAMPLE_DOCUMENTS[0];
  const rx = SAMPLE_DOCUMENTS[1];
  const dis = SAMPLE_DOCUMENTS[2];
  const ayu = SAMPLE_DOCUMENTS[3];

  const extractedLab = extractFromText(lab.sourceText, lab.docType);
  const extractedRx = extractFromText(rx.sourceText, rx.docType);
  const extractedDis = extractFromText(dis.sourceText, dis.docType);
  const extractedAyu: ExtractedDocument = {
    diagnoses: ["Sandhigata vata (osteoarthritis knees)", "Vata-Kapha vikriti", "Manda agni"],
    medications: [
      { name: "Yogaraja guggulu", dose: "2 tab", frequency: "BD", duration: "" },
      { name: "Maharasnadi kwatha", dose: "20 ml", frequency: "BD", duration: "" },
    ],
    labs: [],
    procedures: [],
    notes: ayu.sourceText.trim(),
    confidence: 0.82,
  };

  await db.insert(documents).values([
    {
      id: nid(),
      sessionId: s4,
      patientId: p4,
      docType: lab.docType,
      fileName: lab.fileName,
      mimeType: "application/pdf",
      sourceText: lab.sourceText,
      extractedJson: extractedLab,
      documentDate: lab.documentDate,
      facilityName: lab.facilityName,
    },
    {
      id: nid(),
      sessionId: s4,
      patientId: p4,
      docType: rx.docType,
      fileName: rx.fileName,
      mimeType: "image/jpeg",
      sourceText: rx.sourceText,
      extractedJson: extractedRx,
      documentDate: rx.documentDate,
      facilityName: rx.facilityName,
    },
    {
      id: nid(),
      sessionId: s4,
      patientId: p4,
      docType: dis.docType,
      fileName: dis.fileName,
      mimeType: "application/pdf",
      sourceText: dis.sourceText,
      extractedJson: extractedDis,
      documentDate: dis.documentDate,
      facilityName: dis.facilityName,
    },
    {
      id: nid(),
      sessionId: s1,
      patientId: p1,
      docType: rx.docType,
      fileName: "PHC_Narela_Rx.jpg",
      mimeType: "image/jpeg",
      sourceText: rx.sourceText,
      extractedJson: extractedRx,
      documentDate: "2026-01-11",
      facilityName: "PHC Narela",
    },
    {
      id: nid(),
      sessionId: s3,
      patientId: p3,
      docType: "prescription",
      fileName: ayu.fileName,
      mimeType: "application/pdf",
      sourceText: ayu.sourceText,
      extractedJson: extractedAyu,
      documentDate: ayu.documentDate,
      facilityName: ayu.facilityName,
    },
  ]);

  await db.insert(clinicalSummaries).values([
    {
      id: nid(),
      sessionId: s1,
      patientId: p1,
      chiefComplaint: "Chest pain for a few hours",
      hpi: "58-year-old man presenting with chest pain for a few hours. Onset was sudden. The course is worsening. Pain is localised to the centre of chest and is squeezing / tight in character. It radiates to the left arm, jaw or neck. Severity is 8/10 at present. Aggravated by walking / work. Relieved by rest. Associated symptoms: heavy sweating, short of breath, nausea / vomiting.",
      pastMedical: "Known history of Diabetes / sugar, High blood pressure.",
      pastSurgical: "No prior surgeries reported.",
      drugs: "Current medicines (patient report): Metformin, amlodipine.",
      allergies: "No known drug or food allergies.",
      familyHistory: "Family history of Heart attack / heart disease, Diabetes.",
      personalHistory: "current smoker; occasional alcohol; mixed / non-vegetarian, mostly sitting work; occupation: Auto driver.",
      reviewOfSystems: "Additional positives on ROS: Chest discomfort, Breathlessness.",
      ayushAssessment: null,
      investigationsSummary: "Prior diagnoses on papers: Type 2 Diabetes Mellitus, Hypertension. No new labs today.",
      medicationsExtracted: "Metformin 500 mg BD; Glimepiride 1 mg OD; Amlodipine 5 mg OD; Atorvastatin 10 mg HS; Ecosprin 75 mg OD",
      status: "draft",
      generatedAt: hoursAgo(0.8),
    },
    {
      id: nid(),
      sessionId: s2,
      patientId: p2,
      chiefComplaint: "Fever for 2–3 days",
      hpi: "34-year-old woman presenting with fever for 2–3 days. Onset was gradual. The course is worsening. Fever pattern: high and continuous. Associated symptoms: rash, stiff neck, nausea / vomiting.",
      pastMedical: "No previously diagnosed chronic illnesses reported.",
      pastSurgical: "No prior surgeries reported.",
      drugs: "Not currently taking regular medicines (patient report).",
      allergies: "No known drug or food allergies.",
      familyHistory: "No significant family history volunteered.",
      personalHistory: "never used tobacco; no alcohol; mixed / non-vegetarian, sleep is poor; occupation: School teacher.",
      reviewOfSystems: "Additional positives on ROS: Fever.",
      ayushAssessment: null,
      investigationsSummary: "No structured lab values extracted.",
      medicationsExtracted: "No medications extracted from documents.",
      status: "draft",
      generatedAt: hoursAgo(1.6),
    },
    {
      id: nid(),
      sessionId: s3,
      patientId: p3,
      chiefComplaint: "Joint / body pain for many months to years",
      hpi: "46-year-old woman presenting with joint / body pain for many months to years. Onset was gradual. Symptoms are intermittent. Pain is localised to the joints / limbs and is dull ache in character. Severity is 5/10 at present. Aggravated by walking / work. Relieved by rest, medicine already taken. No associated red-flag symptoms reported.",
      pastMedical: "No previously diagnosed chronic illnesses reported.",
      pastSurgical: "No prior surgeries reported.",
      drugs: "Current medicines (patient report): Yogaraja guggulu, occasional diclofenac.",
      allergies: "No known drug or food allergies.",
      familyHistory: "No significant family history volunteered.",
      personalHistory: "never used tobacco; no alcohol; vegetarian, sleep is fine; occupation: Homemaker.",
      reviewOfSystems: "Review of systems otherwise unremarkable on screening.",
      ayushAssessment: {
        prakriti: "Thin, dry skin, prominent veins (Vata)",
        vikriti: "Vata-Kapha, Manda agni — chronic sandhigata vata pattern",
        sara: "Not formally graded at kiosk — examine rasa/rakta/mamsa clinically.",
        samhanana: "Thin, dry skin, prominent veins (Vata)",
        pramana: "Anthropometry to be recorded at vitals desk.",
        satmya: "Filter coffee, spicy pickles",
        sattva: "Manage with support",
        aharaShakti: "Slow, heaviness after small meals (Manda)",
        vyayamaShakti: "Low — tire quickly",
        vaya: "Madhyama",
        agni: "Slow, heaviness after small meals (Manda)",
        koshtha: "Hard, constipated (Krura)",
        ahara: "Rice, sambar, leftover dinner, three cups filter coffee, little warm water",
        vihara: "Sleep 12–5 am, long sitting for puja work, no regular walk",
        nidana: "Cold season, day sleep, dry leftover food",
      },
      investigationsSummary: "Prior diagnoses on papers: Sandhigata vata (osteoarthritis knees).",
      medicationsExtracted: "Yogaraja guggulu 2 tab BD; Maharasnadi kwatha 20 ml BD",
      status: "draft",
      generatedAt: hoursAgo(2.4),
    },
    {
      id: nid(),
      sessionId: s4,
      patientId: p4,
      chiefComplaint: "Diabetes check for many months to years",
      hpi: "62-year-old man presenting with diabetes check for many months to years. Onset was gradual. The course is unchanged. No associated red-flag symptoms reported.",
      pastMedical: "Known history of Diabetes / sugar, High blood pressure, Heart disease.",
      pastSurgical: "Prior surgery: Coronary angiography 2024, medical management.",
      drugs: "Current medicines (patient report): Metformin, glimepiride, amlodipine, atorvastatin, ecosprin.",
      allergies: "No known drug or food allergies.",
      familyHistory: "Family history of Diabetes, Heart attack / heart disease.",
      personalHistory: "former tobacco user; former alcohol use; vegetarian, mostly sitting work; occupation: Retired clerk.",
      reviewOfSystems: "Review of systems otherwise unremarkable on screening.",
      ayushAssessment: null,
      investigationsSummary:
        "Prior diagnoses on papers: Type 2 Diabetes Mellitus; Hypertension; Unstable angina. Investigations: FBS 168 mg/dL↑ (2026-03-12); PPBS 246 mg/dL↑; HbA1c 8.4%↑; Creatinine 1.4 mg/dL↑; LDL 148 mg/dL↑; HDL 36 mg/dL↓; Triglycerides 210 mg/dL↑; Total cholesterol 224 mg/dL↑.",
      medicationsExtracted:
        "Metformin 500 mg BD; Glimepiride 1 mg OD; Amlodipine 5 mg OD; Atorvastatin 10 mg HS; Ecosprin 75 mg OD; Aspirin 75 mg OD; Clopidogrel 75 mg OD; Metoprolol 25 mg BD; Insulin; Pantoprazole 40 mg",
      physicianEdits: {
        hpi: "62-year-old man here for routine T2DM / HTN / IHD review. No chest pain, syncope or oedema today. Adherent to medicines. Walks 10 minutes only.",
      },
      status: "confirmed",
      generatedAt: hoursAgo(4.4),
      confirmedAt: hoursAgo(3.8),
    },
    {
      id: nid(),
      sessionId: s5,
      patientId: p5,
      chiefComplaint: "Headache since today",
      hpi: "71-year-old woman presenting with headache since today. Onset was sudden. The course is worsening. Pain is localised to the head and is throbbing in character. Severity is 9/10 at present. Associated symptoms: nausea / vomiting, stiff neck, confusion / drowsiness.",
      pastMedical: "Known history of High blood pressure.",
      pastSurgical: "No prior surgeries reported.",
      drugs: "Current medicines (patient report): Amlodipine.",
      allergies: "No known drug or food allergies.",
      familyHistory: "Family history of Blood pressure.",
      personalHistory: "never used tobacco; no alcohol; vegetarian, sleep is poor; occupation: Lives with son.",
      reviewOfSystems: "Review of systems otherwise unremarkable on screening.",
      ayushAssessment: null,
      investigationsSummary: "No structured lab values extracted.",
      medicationsExtracted: "No medications extracted from documents.",
      status: "draft",
      generatedAt: hoursAgo(0.3),
    },
    {
      id: nid(),
      sessionId: s6,
      patientId: p6,
      chiefComplaint: "Stomach pain for 2–3 days",
      hpi: "29-year-old man presenting with stomach pain for 2–3 days. Onset was gradual. The course is worsening. Pain is localised to the upper belly and is burning in character. It radiates to the back. Severity is 7/10 at present. Associated symptoms: blood in vomit, nausea / vomiting.",
      pastMedical: "No previously diagnosed chronic illnesses reported.",
      pastSurgical: "No prior surgeries reported.",
      drugs: "Current medicines (patient report): Frequent over-the-counter painkillers.",
      allergies: "No known drug or food allergies.",
      familyHistory: "No significant family history volunteered.",
      personalHistory: "chews tobacco / gutka; weekly alcohol; mixed / non-vegetarian, poor appetite; occupation: Warehouse loader.",
      reviewOfSystems: "Additional positives on ROS: Stool change.",
      ayushAssessment: null,
      investigationsSummary: "No structured lab values extracted.",
      medicationsExtracted: "No medications extracted from documents.",
      status: "draft",
      generatedAt: hoursAgo(0.5),
    },
    {
      id: nid(),
      sessionId: s7,
      patientId: p7,
      chiefComplaint: "Cough / cold for about a week",
      hpi: "24-year-old woman presenting with cough / cold for about a week. Onset was gradual. There has been slight improvement. Associated symptoms: cough, phlegm.",
      pastMedical: "No previously diagnosed chronic illnesses reported.",
      pastSurgical: "No prior surgeries reported.",
      drugs: "Current medicines (patient report): Cough syrup, paracetamol.",
      allergies: "No known drug or food allergies.",
      familyHistory: "No significant family history volunteered.",
      personalHistory: "never used tobacco; no alcohol; mixed / non-vegetarian, sleep is fine; occupation: Software engineer.",
      reviewOfSystems: "Review of systems otherwise unremarkable on screening.",
      ayushAssessment: null,
      investigationsSummary: "No structured lab values extracted.",
      medicationsExtracted: "No medications extracted from documents.",
      status: "confirmed",
      generatedAt: hoursAgo(7.4),
      confirmedAt: hoursAgo(7),
    },
  ]);

  await db.insert(hisEvents).values([
    {
      id: nid(),
      sessionId: s4,
      eventType: "fhir_bundle_pushed",
      payload: {
        resourceType: "Bundle",
        type: "document",
        abhaId: "22-8899-0011-2233",
        destination: "ABDM PHR + Hospital HIS",
      },
      createdAt: hoursAgo(3.8),
    },
    {
      id: nid(),
      sessionId: s7,
      eventType: "fhir_bundle_pushed",
      payload: {
        resourceType: "Bundle",
        type: "document",
        abhaId: "44-5566-7788-9900",
        destination: "ABDM PHR + Hospital HIS",
      },
      createdAt: hoursAgo(7),
    },
  ]);

  return { seeded: true, patients: 7 };
}
