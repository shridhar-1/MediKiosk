// ── ID card scan helper (offline OCR parsing: Aadhaar + ABHA cards) ────────
// Privacy (DPDP-friendly):
//   • Aadhaar: we keep ONLY the last 4 digits (existing `aadhaarLast4`).
//   • ABHA: we keep the ABHA id itself (it is a health handle, not a
//     government secret, and the app already stores it).
//   • The card photo is used in-memory for a moment and then discarded —
//     nothing extra is stored or sent anywhere.
//   • No UIDAI/online verification happens here — that requires a
//     government KYC licence. This is document digitization, exactly what
//     the problem statement asks for ("enters/scans ABHA ID or Aadhaar").

// ══════════════════════════════════════════════════════════════════════
//  Verhoeff checksum (used by UIDAI for Aadhaar numbers)
// ══════════════════════════════════════════════════════════════════════
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** True when the 12 digits satisfy the Aadhaar (Verhoeff) checksum. */
export function isValidAadhaar(digits12: string): boolean {
  if (!/^\d{12}$/.test(digits12)) return false;
  let c = 0;
  const reversed = digits12.split("").reverse().join("");
  for (let i = 0; i < 12; i += 1) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }
  return c === 0;
}

export function maskAadhaar(digits12: string): string {
  return `XXXX XXXX ${digits12.slice(-4)}`;
}

const GOV_WORDS =
  /(government|भारत\s*सरकार|aadhaar|aadhar|uidai|unique identification|india|इंडिया|पहचान|enrolment|vid\s*:|address|resident|DOB|male|female|born|abha|health account|ayushman)/i;

// ══════════════════════════════════════════════════════════════════════
//  Shared person extraction (name / age / gender) from card text
// ══════════════════════════════════════════════════════════════════════
type Person = {
  fullName: string | null;
  age: string | null;
  gender: "male" | "female" | "other" | null;
};

function parsePerson(rawText: string): Person {
  const compact = rawText.replace(/\s+/g, " ");

  // date of birth (or year of birth) → age
  let age: string | null = null;
  const dobMatch = compact.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
  const yobMatch = compact.match(/(?:year of birth|yob)[:\s]*(\d{4})/i);
  let birthYear: number | null = null;
  if (dobMatch) birthYear = Number(dobMatch[3]);
  else if (yobMatch) birthYear = Number(yobMatch[1]);
  if (birthYear && birthYear > 1900 && birthYear <= new Date().getFullYear()) {
    age = String(new Date().getFullYear() - birthYear);
  }

  // gender
  let gender: Person["gender"] = null;
  if (/\bfemale\b/i.test(compact)) gender = "female";
  else if (/\bmale\b/i.test(compact)) gender = "male";

  // name: first plausible line that is not a government word
  let fullName: string | null = null;
  const lines = rawText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const latinWords = line.match(/[A-Za-z]{3,}/g) ?? [];
    const isNameLike =
      latinWords.length >= 2 &&
      latinWords.join(" ").length >= 6 &&
      !GOV_WORDS.test(line) &&
      !/\d/.test(line);
    if (isNameLike) {
      fullName = line.replace(/[^A-Za-z\s.']/g, "").replace(/\s+/g, " ").trim();
      break;
    }
  }
  return { fullName, age, gender };
}

// ══════════════════════════════════════════════════════════════════════
//  Aadhaar card (12-digit, Verhoeff-checked)
// ══════════════════════════════════════════════════════════════════════
export type AadhaarScanResult = {
  ok: boolean;
  /** last 4 digits, e.g. "4821" (only this is saved) */
  last4: string | null;
  /** masked preview for the screen, e.g. "XXXX XXXX 4821" */
  masked: string | null;
  fullName: string | null;
  age: string | null;
  gender: "male" | "female" | "other" | null;
  /** why it failed, in one simple line */
  error?: string;
};

/** Parse raw OCR text from an Aadhaar card photo into structured fields. */
export function parseAadhaarText(rawText: string): AadhaarScanResult {
  const person = parsePerson(rawText);
  const empty: AadhaarScanResult = { ok: false, last4: null, masked: null, ...person };
  if (!rawText || rawText.trim().length < 10) {
    return { ...empty, error: "Card not readable — hold the card flat and try again" };
  }

  const compact = rawText.replace(/\s+/g, " ");
  const bare = compact.replace(/\s/g, "");
  const candidates: string[] = [];
  const groupRe = /\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = groupRe.exec(compact)) !== null) {
    candidates.push(m[1] + m[2] + m[3]);
  }
  const bareRe = /(?<!\d)\d{12}(?!\d)/g;
  while ((m = bareRe.exec(bare)) !== null) {
    candidates.push(m[0]);
  }
  // 16-digit numbers are VID (virtual ID), not Aadhaar — skipped by the regex

  let number: string | null = null;
  let checksumNote = "";
  const valid = candidates.find(isValidAadhaar);
  if (valid) {
    number = valid;
  } else if (candidates.length > 0) {
    checksumNote = " (number looked misread — please retake the photo)";
  }

  if (!number) {
    return {
      ...empty,
      error: `Could not read the Aadhaar number clearly${checksumNote}. Take the photo closer, without glare`,
    };
  }

  return { ok: true, last4: number.slice(-4), masked: maskAadhaar(number), ...person };
}

// ══════════════════════════════════════════════════════════════════════
//  ABHA card (14-digit health id, printed as XX-XXXX-XXXX-XXXX)
// ══════════════════════════════════════════════════════════════════════
export type AbhaScanResult = {
  ok: boolean;
  /** formatted ABHA id, e.g. "12-3456-7890-1234" */
  abhaId: string | null;
  fullName: string | null;
  age: string | null;
  gender: "male" | "female" | "other" | null;
  error?: string;
};

/** Parse raw OCR text from an ABHA card photo. */
export function parseAbhaCardText(rawText: string): AbhaScanResult {
  const person = parsePerson(rawText);
  const empty: AbhaScanResult = { ok: false, abhaId: null, ...person };
  if (!rawText || rawText.trim().length < 10) {
    return { ...empty, error: "Card not readable — hold the card flat and try again" };
  }
  const compact = rawText.replace(/\s+/g, " ");
  const bare = compact.replace(/\s/g, "");

  let id: string | null = null;
  const groupRe = /\b(\d{2})[ -]?(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b/.exec(compact);
  if (groupRe) {
    id = `${groupRe[1]}-${groupRe[2]}-${groupRe[3]}-${groupRe[4]}`;
  } else {
    const bareRe = /(?<!\d)(\d{2})(\d{4})(\d{4})(\d{4})(?!\d)/.exec(bare);
    if (bareRe) {
      id = `${bareRe[1]}-${bareRe[2]}-${bareRe[3]}-${bareRe[4]}`;
    }
  }
  if (!id) {
    return {
      ...empty,
      error: "Could not read the ABHA number clearly. Take the photo closer, without glare",
    };
  }
  return { ok: true, abhaId: id, ...person };
}