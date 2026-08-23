export const LANGUAGES = [
  { code: "en", label: "English", native: "English", speech: "en-IN" },
  { code: "hi", label: "Hindi", native: "हिन्दी", speech: "hi-IN" },
  { code: "ta", label: "Tamil", native: "தமிழ்", speech: "ta-IN" },
  { code: "te", label: "Telugu", native: "తెలుగు", speech: "te-IN" },
  { code: "bn", label: "Bengali", native: "বাংলা", speech: "bn-IN" },
  { code: "mr", label: "Marathi", native: "मराठी", speech: "mr-IN" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

export const DEPARTMENTS = [
  { id: "general_medicine", label: "General Medicine", token: "MED" },
  { id: "cardiology", label: "Cardiology", token: "CAR" },
  { id: "pulmonology", label: "Chest / Pulmonology", token: "PUL" },
  { id: "gastroenterology", label: "Gastroenterology", token: "GAS" },
  { id: "orthopedics", label: "Orthopedics", token: "ORT" },
  { id: "pediatrics", label: "Pediatrics", token: "PED" },
  { id: "obgyn", label: "Obstetrics & Gynaecology", token: "OBG" },
  { id: "surgery", label: "General Surgery", token: "SUR" },
  { id: "dermatology", label: "Dermatology", token: "DER" },
  { id: "ent", label: "ENT", token: "ENT" },
  { id: "ayush_kayachikitsa", label: "AYUSH — Kayachikitsa", token: "AYU" },
  { id: "ayush_panchakarma", label: "AYUSH — Panchakarma", token: "PAN" },
] as const;

export type DepartmentId = (typeof DEPARTMENTS)[number]["id"];
export type CareMode = "allopathic" | "ayush";
export type SessionStatus =
  | "identify"
  | "consent"
  | "interview"
  | "documents"
  | "summary"
  | "submitted"
  | "reviewed";
export type Priority = "routine" | "urgent" | "emergency";
export type InputMode = "voice" | "touch";

export type Localized = Record<Lang, string>;

export type QuestionOption = {
  id: string;
  label: Localized;
  icon?: string;
  redFlag?: boolean;
};

export type QuestionType =
  | "single"
  | "multi"
  | "text"
  | "scale"
  | "yesno"
  | "chips";

export type Question = {
  id: string;
  section: string;
  text: Localized;
  help?: Localized;
  type: QuestionType;
  options?: QuestionOption[];
  optional?: boolean;
  ayushOnly?: boolean;
  placeholder?: Localized;
};

export type AnswerValue = {
  questionKey: string;
  section: string;
  questionText: string;
  text: string;
  values: string[];
  inputMode: InputMode;
};

export type KioskStep =
  | "language"
  | "identify"
  | "consent"
  | "department"
  | "interview"
  | "documents"
  | "review"
  | "complete";
