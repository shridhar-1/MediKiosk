export function nid(): string {
  return crypto.randomUUID();
}

export function tokenFor(department: string, n: number): string {
  const map: Record<string, string> = {
    general_medicine: "MED",
    cardiology: "CAR",
    pulmonology: "PUL",
    gastroenterology: "GAS",
    orthopedics: "ORT",
    pediatrics: "PED",
    obgyn: "OBG",
    surgery: "SUR",
    dermatology: "DER",
    ent: "ENT",
    ayush_kayachikitsa: "AYU",
    ayush_panchakarma: "PAN",
  };
  const prefix = map[department] ?? "OPD";
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export function formatAbha(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean);
  return parts.join("-");
}
