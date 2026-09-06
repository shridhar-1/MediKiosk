// ── Ask-the-Record: grounded AI Q&A over ONE patient's own data ───────────
// The doctor types a natural question ("any allergies?", "past visits?").
// The AI may answer ONLY from the structured record passed to it, must cite
// the fields it used, and must say "not in the record" otherwise. If no LLM
// key is configured (or the call fails), a deterministic record-search
// answers instead — labelled honestly, never pretending to be AI.

import { engineOrder } from "@/lib/ai-router";

export type AskSource = { label: string; value: string };

export type RecordContext = {
  patientLine: string; // "M, 45, male, ABHA xx, prefers Kannada"
  currentVisit: AskSource[]; // this visit's summary fields
  pastVisits: string[]; // "12 Aug 2026 — chest pain (general_medicine, urgent)"
  documents: string[]; // extracted doc lines (labs/meds/diagnoses)
};

export type AskResult = {
  answer: string;
  sources: string[];
  engine: string; // "groq" | "gemini" | "record-search"
  aiUsed: boolean;
};

const STOP = new Set([
  "what", "when", "where", "does", "did", "has", "have", "had", "this", "that",
  "patient", "record", "any", "the", "was", "were", "his", "her", "their",
  "with", "from", "about", "tell", "show", "list", "give", "please", "there",
]);

/** Deterministic fallback: keyword scan over the labelled record fields. */
export function recordSearch(question: string, ctx: RecordContext): AskResult {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

  const fields: AskSource[] = [
    { label: "Patient", value: ctx.patientLine },
    ...ctx.currentVisit,
    ...ctx.pastVisits.map((v, i) => ({ label: `Past visit ${i + 1}`, value: v })),
    ...ctx.documents.map((d, i) => ({ label: `Document ${i + 1}`, value: d })),
  ];

  const scored = fields
    .map((f) => {
      const hay = `${f.label} ${f.value}`.toLowerCase();
      const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { f, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return {
      answer: "That is not in this patient's record.",
      sources: [],
      engine: "record-search",
      aiUsed: false,
    };
  }
  return {
    answer: `From the record:\n${scored.map((s) => `• ${s.f.label}: ${s.f.value}`).join("\n")}`,
    sources: scored.map((s) => s.f.label),
    engine: "record-search",
    aiUsed: false,
  };
}

function prompt(question: string, ctx: RecordContext): string {
  const record = [
    `PATIENT: ${ctx.patientLine}`,
    "",
    "THIS VISIT:",
    ...ctx.currentVisit.map((f) => `- ${f.label}: ${f.value}`),
    "",
    "PAST VISITS:",
    ...(ctx.pastVisits.length ? ctx.pastVisits.map((v) => `- ${v}`) : ["- none on file"]),
    "",
    "UPLOADED DOCUMENTS (extracted):",
    ...(ctx.documents.length ? ctx.documents.map((v) => `- ${v}`) : ["- none"]),
  ].join("\n");

  return `RECORD (the ONLY source of truth):
${record}

DOCTOR'S QUESTION: ${question}

Rules:
1. Answer ONLY using the RECORD above. If the answer is not there, reply exactly: "That is not in this patient's record."
2. Maximum 120 words. Plain English for a busy doctor.
3. End with a final line: SOURCES: <field labels you used, separated by | >`;
}

async function askGroq(question: string, ctx: RecordContext): Promise<AskResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const models = [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 400,
          messages: [
            {
              role: "system",
              content:
                "You are a clinical records assistant for an Indian government hospital OPD. You answer strictly from the record provided. You never invent, extrapolate, or use outside medical knowledge to fill gaps.",
            },
            { role: "user", content: prompt(question, ctx) },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return splitSources(text, `AI · ${model.split("/").pop()}`);
    } catch {
      /* try next model */
    }
  }
  return null;
}

async function askGemini(question: string, ctx: RecordContext): Promise<AskResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(question, ctx) }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return splitSources(text, "AI · gemini-2.0-flash");
  } catch {
    /* fall through */
  }
  return null;
}

function splitSources(text: string, engine: string): AskResult {
  const m = text.match(/\n?\s*SOURCES?\s*:\s*(.+)\s*$/i);
  const answer = (m ? text.slice(0, m.index) : text).trim();
  const sources = (m?.[1] ?? "")
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  return { answer, sources, engine, aiUsed: true };
}

async function askOllama(question: string, ctx: RecordContext): Promise<AskResult | null> {
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
        options: { temperature: 0.1 },
        messages: [
          {
            role: "system",
            content:
              "You are a clinical records assistant for an Indian government hospital OPD. You answer strictly from the record provided. You never invent, extrapolate, or use outside medical knowledge to fill gaps.",
          },
          { role: "user", content: prompt(question, ctx) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    if (text) return splitSources(text, `local · ${model}`);
  } catch {
    /* Ollama not running — fall through */
  }
  return null;
}

/** AI first, honest deterministic fallback — never a dead end.
 *  Engine lane comes from the AI router (see src/lib/ai-router.ts): on the
 *  cloud Q&A runs Gemini-first so it never competes with summaries + voice
 *  for Groq's rate limit; on the laptop local Ollama always goes first. */
export async function askRecord(question: string, ctx: RecordContext): Promise<AskResult> {
  for (const engine of engineOrder("ask")) {
    const result =
      engine === "ollama"
        ? await askOllama(question, ctx)
        : engine === "groq"
          ? await askGroq(question, ctx)
          : await askGemini(question, ctx);
    if (result) return result;
  }
  return recordSearch(question, ctx);
}