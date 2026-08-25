import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const patients = pgTable("patients", {
  id: uuid("id").primaryKey(),
  abhaId: text("abha_id"),
  aadhaarLast4: text("aadhaar_last4"),
  fullName: text("full_name").notNull(),
  age: integer("age").notNull(),
  gender: text("gender").notNull(),
  phone: text("phone"),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  pinHash: text("pin_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull().default("physician"),
  designation: text("designation"),
  department: text("department"),
  hospital: text("hospital").notNull().default("District Hospital"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey(),
  token: text("token").notNull().unique(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  department: text("department").notNull().default("general_medicine"),
  mode: text("mode").notNull().default("allopathic"),
  language: text("language").notNull().default("en"),
  status: text("status").notNull().default("identify"),
  tokenNumber: text("token_number"),
  priority: text("priority").notNull().default("routine"),
  redFlagTriggered: boolean("red_flag_triggered").notNull().default(false),
  redFlagReasons: jsonb("red_flag_reasons").$type<string[]>(),
  physicianNotes: text("physician_notes"),
  startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  reviewedBy: text("reviewed_by"),
});

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  consentType: text("consent_type").notNull(),
  granted: boolean("granted").notNull().default(false),
  audioExplained: boolean("audio_explained").notNull().default(false),
  grantedAt: timestamp("granted_at", { mode: "date" }).defaultNow().notNull(),
});

export const historyResponses = pgTable("history_responses", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  section: text("section").notNull(),
  questionKey: text("question_key").notNull(),
  questionText: text("question_text").notNull(),
  answerText: text("answer_text"),
  answerJson: jsonb("answer_json").$type<unknown>(),
  inputMode: text("input_mode").notNull().default("touch"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  docType: text("doc_type").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  sourceText: text("source_text"),
  extractedJson: jsonb("extracted_json").$type<ExtractedDocument>(),
  documentDate: text("document_date"),
  facilityName: text("facility_name"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const clinicalSummaries = pgTable("clinical_summaries", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  patientId: uuid("patient_id")
    .notNull()
    .references(() => patients.id),
  chiefComplaint: text("chief_complaint"),
  hpi: text("hpi"),
  pastMedical: text("past_medical"),
  pastSurgical: text("past_surgical"),
  drugs: text("drugs"),
  allergies: text("allergies"),
  familyHistory: text("family_history"),
  personalHistory: text("personal_history"),
  reviewOfSystems: text("review_of_systems"),
  ayushAssessment: jsonb("ayush_assessment").$type<AyushAssessment | null>(),
  investigationsSummary: text("investigations_summary"),
  medicationsExtracted: text("medications_extracted"),
  physicianEdits: jsonb("physician_edits").$type<Record<string, string> | null>(),
  status: text("status").notNull().default("draft"),
  engine: text("engine"),
  aiUsed: boolean("ai_used").notNull().default(false),
  generatedAt: timestamp("generated_at", { mode: "date" }).defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at", { mode: "date" }),
});

export const hisEvents = pgTable("his_events", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type ExtractedLab = {
  name: string;
  value: string;
  unit: string;
  reference: string;
  abnormal: boolean;
  flag?: "high" | "low";
};

export type ExtractedMedication = {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
};

export type ExtractedDocument = {
  diagnoses: string[];
  medications: ExtractedMedication[];
  labs: ExtractedLab[];
  procedures: string[];
  notes: string;
  confidence: number;
};

export type AyushAssessment = {
  prakriti: string;
  vikriti: string;
  sara: string;
  samhanana: string;
  pramana: string;
  satmya: string;
  sattva: string;
  aharaShakti: string;
  vyayamaShakti: string;
  vaya: string;
  agni: string;
  koshtha: string;
  ahara: string;
  vihara: string;
  nidana: string;
};

export type Patient = typeof patients.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type HistoryResponse = typeof historyResponses.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type ClinicalSummary = typeof clinicalSummaries.$inferSelect;
export type HisEvent = typeof hisEvents.$inferSelect;