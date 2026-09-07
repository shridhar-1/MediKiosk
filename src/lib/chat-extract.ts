// ── Chat-Intake extraction: free speech → structured interview answers ────
// The patient types/pastes one free-flowing paragraph ("2-minute chat").
// The LLM extracts the SAME structured fields the guided interview collects
// — written back into the SAME question keys — so summary, drug-safety and
// red flags all work unchanged. If no AI is reachable, a naive keyword
// parser does an honest, clearly-labelled job instead.

import { engineOrder } from "@/lib/ai-router";

export type ExtractedIntake = {
  chiefComplaint: string;
  durationText: string;
  severity: string; // "1".."10" or ""
  medications: string[]; // [] = none reported
  allergies: string[]; // [] = none reported
  pastMedical: string;
  familyHistory: string;
  tobacco: string; // "" | "yes" | "no"
};

export type ExtractResult = {
  extracted: ExtractedIntake;
  engine: string; // "AI · model" | "naive-parser"
  aiUsed: boolean;
};

const SYSTEM =
  "You are a clinical intake assistant for an Indian government hospital OPD. " +
  "You convert a patient's free-spoken/typed description into structured fields. " +
  "Use ONLY what the patient said — never invent, never guess. " +
  "Return ONLY valid JSON, no markdown.";

function userPrompt(text: string): string {
  return `PATIENT SAID (may be messy English or transliterated Indian language):
"""
${text}
"""

Extract into this EXACT JSON shape (use "" or [] when the patient did not say it — never invent):
{
  "chiefComplaint": "main problem in <= 12 words",
  "durationText": "e.g. '2 days', 'since last week' (as said)",
  "severity": "pain/severity 1-10 if stated, else ''",
  "medications": ["current medicines with dose if said"],
  "allergies": ["allergies if stated"],
  "pastMedical": "past diseases (diabetes, BP, asthma, surgery…) as said",
  "familyHistory": "family history if said",
  "tobacco": "yes/no if smoking or tobacco mentioned, else ''"
}`;
}

type RawExtract = Partial<Record<keyof ExtractedIntake, unknown>>;

function coerce(raw: RawExtract): ExtractedIntake {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((s) => s.trim())
      : str(v)
        ? [str(v)]
        : [];
  const sev = str(raw.severity).match(/\d{1,2}/)?.[0] ?? "";
  const tobaccoRaw = str(raw.tobacco).toLowerCase();
  const tobacco = tobaccoRaw === "yes" || tobaccoRaw === "no" ? tobaccoRaw : "";
  return {
    chiefComplaint: str(raw.chiefComplaint).slice(0, 160),
    durationText: str(raw.durationText).slice(0, 80),
    severity: sev ? String(Math.min(10, Math.max(1, Number(sev)))) : "",
    medications: arr(raw.medications).slice(0, 12),
    allergies: arr(raw.allergies).slice(0, 8),
    pastMedical: str(raw.pastMedical).slice(0, 400),
    familyHistory: str(raw.familyHistory).slice(0, 300),
    tobacco,
  };
}

async function viaGroq(text: string): Promise<ExtractResult | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  for (const model of [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "llama-3.3-70b-versatile"]) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userPrompt(text) },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) continue;
      return { extracted: coerce(JSON.parse(raw) as RawExtract), engine: `AI · ${model.split("/").pop()}`, aiUsed: true };
    } catch {
      /* next model */
    }
  }
  return null;
}

async function viaGemini(text: string): Promise<ExtractResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM}\n\n${userPrompt(text)}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) return null;
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    return { extracted: coerce(JSON.parse(json) as RawExtract), engine: "AI · gemini-2.0-flash", aiUsed: true };
  } catch {
    return null;
  }
}

async function viaOllama(text: string): Promise<ExtractResult | null> {
  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1";
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(text) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data.message?.content?.trim();
    if (!raw) return null;
    return { extracted: coerce(JSON.parse(raw) as RawExtract), engine: `local · ${model}`, aiUsed: true };
  } catch {
    return null;
  }
}

// ── Naive parser (no AI): sentence buckets — honest, labelled, never dead ──
export function naiveExtract(text: string): ExtractResult {
  const sentences = text
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const has = (s: string, words: string[]) => words.some((w) => s.toLowerCase().includes(w));

  const med = sentences.filter((s) => has(s, ["tablet", "mg", "medicine", "medication", "dawa", "capsule", "syrup", "injection", "ecosprin", "metformin", "telmisartan", "amoxicillin", "propranolol", "paracetamol", "insulin"]));
  const alg = sentences.filter((s) => has(s, ["allerg", "allergy", "reaction to"]));
  const dur = sentences.find((s) => /\b(since|for)\b/i.test(s) && /\b(day|days|week|weeks|month|months|year|years|hota|raha|din|hafte|mahine|saal)\b/i.test(s)) ?? "";
  const pmh = sentences.filter((s) => has(s, ["diabet", "bp", "blood pressure", "asthma", "sugar", "thyroid", "surgery", "operat", "kidney", "heart", "stroke", "tb", "cancer"]));
  const fam = sentences.filter((s) => has(s, ["father", "mother", "brother", "sister", "family"]));
  const tob = sentences.filter((s) => has(s, ["smok", "cigarette", "tobacco", "beedi", "gutka"]));
  const sevMatch = text.match(/(?:severity|pain)\s*(?:is\s*)?(?:of\s*)?(\d{1,2})\s*(?:\/|out of)?\s*(?:10)?/i);
  const chief = sentences.find((s) => !med.includes(s) && !alg.includes(s)) ?? sentences[0] ?? "";

  return {
    extracted: {
      chiefComplaint: chief.slice(0, 160),
      durationText: dur.slice(0, 80),
      severity: sevMatch ? String(Math.min(10, Math.max(1, Number(sevMatch[1])))) : "",
      medications: med.map((s) => s.slice(0, 120)),
      allergies: alg.map((s) => s.slice(0, 120)),
      pastMedical: pmh.join(". ").slice(0, 400),
      familyHistory: fam.join(". ").slice(0, 300),
      tobacco: tob.length > 0 ? "yes" : "",
    },
    engine: "naive-parser",
    aiUsed: false,
  };
}

/** Chat → structured intake. AI lanes first, honest naive fallback. */
export async function extractIntake(text: string): Promise<ExtractResult> {
  const clean = text.trim().slice(0, 4000);
  if (!clean) return naiveExtract("");
  for (const engine of engineOrder("extract")) {
    const result =
      engine === "ollama" ? await viaOllama(clean)
      : engine === "groq" ? await viaGroq(clean)
      : await viaGemini(clean);
    if (result) return result;
  }
  return naiveExtract(clean);
}