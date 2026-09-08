// ── Document structuring pass: messy OCR text → clean structured record ───
// Feature 5's last mile. The regex extractor (ocr.ts) stays the FLOOR — it
// is deterministic and offline-safe. This pass lets an LLM read the same
// photographed paper (old prescriptions, discharge summaries, lab reports)
// and surface anything the regex missed. Result is MERGED (add-never-
// replace): regex findings always survive; AI can only ADD unseen items.
// Same ExtractedDocument shape → summary, drug-safety, doctor view and
// Ask-the-Record all work unchanged.

import { engineOrder } from "@/lib/ai-router";
import type { ExtractedDocument, ExtractedLab, ExtractedMedication } from "@/db/schema";

export type StructuredDocument = ExtractedDocument & { structuredBy: string };

const SYSTEM =
  "You read OCR text from a photographed medical document at an Indian hospital — " +
  "it may be a lab report, prescription, discharge summary, or old case notes, and " +
  "the OCR may be messy with broken words. Extract the medical facts. " +
  "Use ONLY what appears in the text — never invent, never guess. " +
  "Return ONLY valid JSON, no markdown, in exactly this shape: " +
  '{"medications":[{"name":"","dose":"","frequency":"","duration":""}],' +
  '"labs":[{"name":"","value":"","unit":"","reference":"","abnormal":false,"flag":null}],' +
  '"diagnoses":[""],"procedures":[""],"notes":"one short line: what this document is"} ' +
  "Rules: values exactly as written (keep them as strings); frequency as written " +
  "(OD/BD/TDS/HS…); mark a lab abnormal only if it is outside the reference range " +
  "printed on the report (flag high/low); use empty arrays when nothing is found.";

function userPrompt(sourceText: string, docType: string): string {
  return `DOCUMENT TYPE: ${docType}
OCR TEXT (may be messy):
"""
${sourceText.slice(0, 6000)}
"""
Extract the medications, lab values, diagnoses, procedures and a one-line note.`;
}

type RawDoc = {
  medications?: unknown;
  labs?: unknown;
  diagnoses?: unknown;
  procedures?: unknown;
  notes?: unknown;
};

function coerceAi(raw: RawDoc): ExtractedDocument {
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const medications: ExtractedMedication[] = arr(raw.medications)
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null && str((m as any).name, 60).length > 0)
    .slice(0, 20)
    .map((m) => ({
      name: str(m.name, 60),
      dose: str(m.dose, 30),
      frequency: str(m.frequency, 30),
      duration: str(m.duration, 30),
    }));

  const labs: ExtractedLab[] = arr(raw.labs)
    .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null && str((l as any).name, 60).length > 0 && str((l as any).value, 20).length > 0)
    .slice(0, 30)
    .map((l) => ({
      name: str(l.name, 60),
      value: str(l.value, 20),
      unit: str(l.unit, 20),
      reference: str(l.reference, 30),
      abnormal: l.abnormal === true,
      flag: l.flag === "high" || l.flag === "low" ? (l.flag as "high" | "low") : undefined,
    }));

  const diagnoses = arr(raw.diagnoses)
    .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    .slice(0, 10)
    .map((d) => d.trim().slice(0, 100));

  const procedures = arr(raw.procedures)
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .slice(0, 10)
    .map((p) => p.trim().slice(0, 100));

  return {
    diagnoses,
    medications,
    labs,
    procedures,
    notes: str(raw.notes, 300),
    confidence: 0.5,
  };
}

/** Merge: regex findings are the floor; AI can only ADD unseen items. */
function merge(local: ExtractedDocument, ai: ExtractedDocument): ExtractedDocument {
  const medications = [...local.medications];
  const seenMed = new Set(medications.map((m) => m.name.toLowerCase()));
  for (const m of ai.medications) {
    if (!seenMed.has(m.name.toLowerCase())) {
      medications.push(m);
      seenMed.add(m.name.toLowerCase());
    }
  }

  const labs = [...local.labs];
  const seenLab = new Set(labs.map((l) => l.name.toLowerCase()));
  for (const l of ai.labs) {
    if (!seenLab.has(l.name.toLowerCase())) {
      labs.push(l);
      seenLab.add(l.name.toLowerCase());
    }
  }

  const diagnoses = [...local.diagnoses];
  const seenDx = new Set(diagnoses.map((d) => d.toLowerCase()));
  for (const d of ai.diagnoses) {
    if (!seenDx.has(d.toLowerCase())) {
      diagnoses.push(d);
      seenDx.add(d.toLowerCase());
    }
  }

  const procedures = [...local.procedures];
  const seenPr = new Set(procedures.map((p) => p.toLowerCase()));
  for (const p of ai.procedures) {
    if (!seenPr.has(p.toLowerCase())) {
      procedures.push(p);
      seenPr.add(p.toLowerCase());
    }
  }

  return {
    diagnoses,
    medications,
    labs,
    procedures,
    notes: ai.notes || local.notes,
    confidence: Math.min(0.95, Math.max(local.confidence, 0.35 + labs.length * 0.06 + medications.length * 0.06 + diagnoses.length * 0.06)),
  };
}

async function viaGroq(sourceText: string, docType: string): Promise<ExtractedDocument | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  for (const model of [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "llama-3.3-70b-versatile"]) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 900,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userPrompt(sourceText, docType) },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) continue;
      return coerceAi(JSON.parse(raw) as RawDoc);
    } catch {
      /* next model */
    }
  }
  return null;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function viaGemini(sourceText: string, docType: string): Promise<ExtractedDocument | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${SYSTEM}\n\n${userPrompt(sourceText, docType)}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
          }),
        },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!raw) continue;
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      return coerceAi(JSON.parse(json) as RawDoc);
    } catch {
      /* next model */
    }
  }
  return null;
}

async function viaOllama(sourceText: string, docType: string): Promise<ExtractedDocument | null> {
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
          { role: "user", content: userPrompt(sourceText, docType) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data.message?.content?.trim();
    if (!raw) return null;
    return coerceAi(JSON.parse(raw) as RawDoc);
  } catch {
    return null;
  }
}

// ── Vision lane: handwriting Tesseract cannot read ─────────────────────────
const SYSTEM_VISION =
  "You are reading a photograph of a handwritten medical document from an " +
  "Indian hospital — a prescription, lab report, or case notes. Read the " +
  "handwriting carefully. Use ONLY what is actually written — never invent, " +
  "never guess a medicine or a value. Return ONLY valid JSON, no markdown: " +
  '{"transcript":"faithful plain text of everything written, as best you can read it",' +
  '"medications":[{"name":"","dose":"","frequency":"","duration":""}],' +
  '"labs":[{"name":"","value":"","unit":"","reference":"","abnormal":false,"flag":null}],' +
  '"diagnoses":[""],"procedures":[""],"notes":"one short line: what this document is"} ' +
  "Rules: medicine names exactly as written; values as strings; mark a lab " +
  "abnormal only if outside the printed reference range; empty arrays when " +
  "you cannot read a section.";

type RawVision = RawDoc & { transcript?: unknown };

type VisionResult = { doc: ExtractedDocument; transcript: string; label: string };

async function viaGeminiVision(b64: string, docType: string): Promise<VisionResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${SYSTEM_VISION}\n\nDOCUMENT TYPE: ${docType}` },
                  { inline_data: { mime_type: "image/jpeg", data: b64 } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1400 },
          }),
        },
      );
      if (!res.ok) continue; // model retired/unavailable → try the next one
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!raw) continue;
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json) as RawVision;
      return {
        doc: coerceAi(parsed),
        transcript: typeof parsed.transcript === "string" ? parsed.transcript.slice(0, 6000) : "",
        label: `AI · ${model} 👁`,
      };
    } catch {
      /* next model */
    }
  }
  return null;
}

/**
 * Handwriting pass: send the PHOTO itself to a vision model. Returns the
 * structured record plus a faithful transcript (stored as the document's
 * text so Ask-the-Record and summaries can cite it). Null when no vision
 * engine answers — the regex floor then holds, honestly.
 */
export async function readDocumentByVision(
  imageBase64: string,
  docType: string,
): Promise<VisionResult | null> {
  const b64 = imageBase64.replace(/^data:[^,]+,/, "");
  if (b64.length < 500 || b64.length > 6_000_000) return null;
  // Groq retired its vision models (2026) — Gemini Flash is the vision lane.
  // Requires GEMINI_API_KEY; without it this returns null and the honest
  // regex floor holds.
  return await viaGeminiVision(b64, docType);
}

/** Public merge with an explicit engine label (used by the vision path). */
export function mergeWithLabel(local: ExtractedDocument, ai: ExtractedDocument, label: string): StructuredDocument {
  return { ...merge(local, ai), structuredBy: label };
}

/**
 * Regex floor + AI pass. Never blocks: if no AI answers, the local regex
 * extraction is returned unchanged, labelled "rules".
 */
export async function structureDocument(
  sourceText: string,
  docType: string,
  local: ExtractedDocument,
): Promise<StructuredDocument> {
  const text = sourceText.trim();
  if (text.length < 40) return { ...local, structuredBy: "rules" };

  for (const engine of engineOrder("extract")) {
    const ai =
      engine === "ollama" ? await viaOllama(text, docType)
      : engine === "groq" ? await viaGroq(text, docType)
      : await viaGemini(text, docType);
    if (ai) {
      const label =
        engine === "ollama"
          ? `local · ${process.env.OLLAMA_MODEL || "llama3.1"}`
          : engine === "groq"
            ? `AI · ${(process.env.GROQ_MODEL || "openai/gpt-oss-120b").split("/").pop()}`
            : "AI · gemini-flash";
      return { ...merge(local, ai), structuredBy: label };
    }
  }
  return { ...local, structuredBy: "rules" };
}