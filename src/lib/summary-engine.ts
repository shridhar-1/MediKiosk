import { db } from "@/db";
import {
  clinicalSummaries,
  documents,
  historyResponses,
  patients,
  sessions,
} from "@/db/schema";
import type { AyushAssessment } from "@/db/schema";
import { nid } from "@/lib/ids";
import { summarizeDocuments } from "@/lib/ocr";
import { evaluateRedFlags } from "@/lib/redflags";
import { answersMap } from "@/lib/session-data";
import { generateSummaryFields } from "@/lib/summary";
import { eq } from "drizzle-orm";

export type SummaryFields = {
  chiefComplaint: string;
  hpi: string;
  pastMedical: string;
  pastSurgical: string;
  drugs: string;
  allergies: string;
  familyHistory: string;
  personalHistory: string;
  reviewOfSystems: string;
  investigationsSummary: string;
  medicationsExtracted: string;
  ayushAssessment?: AyushAssessment | null;
};

export type AIInput = {
  patientName: string;
  age: number;
  gender: string;
  mode: string;
  answersText: string;
  docsText: string;
  localFields: SummaryFields;
};

/* ------------------------------------------------------------------ */
/* Prompt                                                             */
/* ------------------------------------------------------------------ */

function buildPrompt(input: AIInput): string {
  return `
You are a senior clinical documentation doctor for Indian hospital OPDs (MediKiosk Platform).
Summarize the raw patient interview and documents into a structured, professional medical summary in English.

PATIENT DEMOGRAPHICS:
- Name: ${input.patientName}
- Age: ${input.age}
- Gender: ${input.gender}
- Mode: ${input.mode}

RAW PATIENT ANSWERS:
${input.answersText || "None provided"}

UPLOADED MEDICAL DOCUMENTS:
${input.docsText || "None provided"}

OUTPUT INSTRUCTIONS:
Return a JSON object with EXACTLY these keys:
{
  "chiefComplaint": "Short statement of main complaint with duration",
  "hpi": "Detailed chronological History of Present Illness written in clinical prose (onset, course, severity, associated symptoms)",
  "pastMedical": "Known conditions (e.g., Diabetes, Hypertension) or 'No prior medical history reported'",
  "pastSurgical": "Past surgeries or 'No prior surgeries reported'",
  "drugs": "Regular medications or 'Not currently taking regular medicines'",
  "allergies": "Known drug/food allergies or 'No known allergies'",
  "familyHistory": "Family history or 'No significant family history'",
  "personalHistory": "Habits, lifestyle, sleep, occupation",
  "reviewOfSystems": "Systemic review findings",
  "investigationsSummary": "Summary of lab results, out-of-range values, and prior reports"
}
Do NOT include markdown formatting or explanations outside JSON.
`;
}

/* ------------------------------------------------------------------ */
/* JSON extraction                                                    */
/* ------------------------------------------------------------------ */

function extractJsonFromText(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      }
    } catch (e) {
      console.error("Failed to parse AI JSON:", e);
    }
  }
  return null;
}

function mergeToFields(parsed: Partial<SummaryFields>, input: AIInput): SummaryFields {
  return {
    chiefComplaint: parsed.chiefComplaint || input.localFields.chiefComplaint,
    hpi: parsed.hpi || input.localFields.hpi,
    pastMedical: parsed.pastMedical || input.localFields.pastMedical,
    pastSurgical: parsed.pastSurgical || input.localFields.pastSurgical,
    drugs: parsed.drugs || input.localFields.drugs,
    allergies: parsed.allergies || input.localFields.allergies,
    familyHistory: parsed.familyHistory || input.localFields.familyHistory,
    personalHistory: parsed.personalHistory || input.localFields.personalHistory,
    reviewOfSystems: parsed.reviewOfSystems || input.localFields.reviewOfSystems,
    investigationsSummary: parsed.investigationsSummary || input.localFields.investigationsSummary,
    medicationsExtracted: input.localFields.medicationsExtracted || "None",
    ayushAssessment: input.localFields.ayushAssessment ?? null,
  };
}

function parseFields(text: string, input: AIInput): SummaryFields | null {
  if (!text.trim()) return null;
  const parsed = extractJsonFromText(text);
  if (parsed && parsed.chiefComplaint) return mergeToFields(parsed, input);
  return null;
}

/* ------------------------------------------------------------------ */
/* Ollama (local) engine                                              */
/* ------------------------------------------------------------------ */

async function generateWithOllama(
  input: AIInput,
): Promise<{ fields: SummaryFields | null; error?: string; engine: string }> {
  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1";

  let response: Response;
  try {
    response = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        prompt: buildPrompt(input),
        format: "json",
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
  } catch (e: any) {
    return {
      fields: null,
      engine: "ollama",
      error: `Could not reach Ollama at ${base} (${e?.message || e}). Start it with: ollama serve`,
    };
  }

  if (!response.ok) {
    return {
      fields: null,
      engine: "ollama",
      error: `Ollama (${model}) HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    };
  }

  const data = await response.json();
  const text = data?.response || "";
  return { fields: parseFields(text, input), engine: "ollama" };
}

/* ------------------------------------------------------------------ */
/* Gemini engine                                                      */
/* ------------------------------------------------------------------ */

async function generateWithGeminiAI(
  input: AIInput,
): Promise<{ fields: SummaryFields | null; error?: string; engine: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { fields: null, error: "GEMINI_API_KEY is missing in environment variables", engine: "gemini" };
  }

  const prompt = buildPrompt(input);
  const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
  let lastError = "";

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!response.ok) {
        lastError = `Model ${model} HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
        console.error(lastError);
        continue;
      }

      const responseData = await response.json();
      const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = `Model ${model} returned empty response`;
        continue;
      }
      const parsed = extractJsonFromText(rawText);
      if (parsed && parsed.chiefComplaint) {
        return { fields: mergeToFields(parsed, input), engine: "gemini" };
      }
      lastError = `Failed to parse valid JSON fields from ${model}`;
    } catch (e: any) {
      lastError = `Exception with ${model}: ${e.message}`;
      console.error(lastError);
    }
  }

  return { fields: null, error: lastError, engine: "gemini" };
}

/* ------------------------------------------------------------------ */
/* Groq (cloud, free tier) engine                                     */
/* ------------------------------------------------------------------ */

const GROQ_VALID_MODELS = [
  "openai/gpt-oss-120b", // official replacement per Groq docs
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct"
];

async function generateWithGroq(
  input: AIInput,
): Promise<{ fields: SummaryFields | null; error?: string; engine: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { fields: null, error: "GROQ_API_KEY is missing in environment variables", engine: "groq" };
  }

  const configuredModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  // Ensure the configured model is tried first, then loop through the rest uniquely
  const modelsToTry = Array.from(new Set([configuredModel, ...GROQ_VALID_MODELS]));

  const messages = [
    {
      role: "system",
      content:
        "You are a senior clinical documentation doctor for Indian hospital OPDs. Return ONLY valid JSON, no markdown or commentary.",
    },
    { role: "user", content: buildPrompt(input) },
  ];

  let lastError = "";

  for (const model of modelsToTry) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        lastError = `Groq (${model}) HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
        console.error(lastError);
        // Continue to the next model in the array on 404 or other errors
        continue;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || "";
      const parsedFields = parseFields(text, input);

      if (parsedFields) {
        return { fields: parsedFields, engine: "groq" };
      }
      
      lastError = `Groq (${model}) failed to parse valid JSON fields`;
    } catch (e: any) {
      lastError = `Groq request failed for ${model}: ${e?.message || e}`;
      console.error(lastError);
      // Continue loop if there's a fetch or parsing exception
    }
  }

  // If the loop finishes without returning, all Groq models failed.
  // Returning null fields here tells the parent function (generateWithAI) 
  // to fall back to the next engine in the queue (Gemini).
  return {
    fields: null,
    engine: "groq",
    error: lastError || "All Groq models failed",
  };
}

/* ------------------------------------------------------------------ */
/* Engine selection                                                   */
/* ------------------------------------------------------------------ */

// AI_ENGINE: "auto" (default) | "ollama" | "groq" | "gemini"
function resolveEngine(): { order: ("ollama" | "groq" | "gemini")[] } {
  const choice = (process.env.AI_ENGINE || "auto").toLowerCase();
  if (choice === "ollama") return { order: ["ollama"] };
  if (choice === "groq") return { order: ["groq"] };
  if (choice === "gemini") return { order: ["gemini"] };
  // auto (serverless): if a Groq key exists, prefer Groq on the first try.
  // Ollama only works locally — skip it on a real server to avoid a wasted,
  // failing localhost call before falling through to a working cloud engine.
  return process.env.GROQ_API_KEY
    ? { order: ["groq", "gemini"] }
    : process.env.GEMINI_API_KEY
      ? { order: ["gemini"] }
      : { order: ["groq", "gemini"] };
}

async function generateWithAI(input: AIInput): Promise<{
  fields: SummaryFields | null;
  error?: string;
  engine: string | null;
}> {
  const { order } = resolveEngine();
  let lastError = "";
  for (const engine of order) {
    const result =
      engine === "ollama"
        ? await generateWithOllama(input)
        : engine === "groq"
          ? await generateWithGroq(input)
          : await generateWithGeminiAI(input);
    if (result?.fields) {
      return { fields: result.fields, engine };
    }
    lastError = result?.error || lastError;
  }
  return { fields: null, error: lastError || "No AI engine produced a summary", engine: null };
}

/* ------------------------------------------------------------------ */
/* High-level: generate (or regenerate) a summary for a session       */
/* ------------------------------------------------------------------ */

export async function generateSummaryForSession(sessionId: string): Promise<{
  summary: typeof clinicalSummaries.$inferSelect;
  flags: { triggered: boolean; reasons: string[]; priority: string };
  aiUsed: boolean;
  engine: string | null;
  aiError: string | null;
  hasGroq: boolean;
  hasGeminiKey: boolean;
  hasOllama: boolean;
}> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) throw new Error("Session not found");

  const [patient] = await db.select().from(patients).where(eq(patients.id, session.patientId)).limit(1);
  if (!patient) throw new Error("Patient missing");

  const answerRows = await db.select().from(historyResponses).where(eq(historyResponses.sessionId, sessionId));
  const docs = await db.select().from(documents).where(eq(documents.sessionId, sessionId));

  const map = answersMap(answerRows);
  const flags = evaluateRedFlags(map);
  const { investigationsSummary, medicationsExtracted } = summarizeDocuments(docs);

  const localFields = generateSummaryFields(
    patient,
    map,
    session.mode === "ayush" ? "ayush" : "allopathic",
    investigationsSummary,
    medicationsExtracted,
  ) as SummaryFields;

  const answersText = Object.entries(map)
    .map(([key, ans]) => {
      const value = (ans.text ?? "").trim() || (ans.values ?? []).join(", ");
      return `Question (${key}): ${value || "N/A"}`;
    })
    .join("\n");

  const docsText = docs
    .map((d: any) => `Document (${d.docType}): ${d.sourceText || JSON.stringify(d.extractedJson || {})}`)
    .join("\n");

  const input: AIInput = {
    patientName: patient.fullName,
    age: patient.age,
    gender: patient.gender,
    mode: session.mode,
    answersText,
    docsText,
    localFields,
  };

  const { fields: aiFields, error: aiError, engine } = await generateWithAI(input);

  const finalFields = aiFields || localFields;

  await db
    .update(sessions)
    .set({
      status: "summary",
      redFlagTriggered: flags.triggered,
      redFlagReasons: flags.reasons,
      priority: flags.priority,
    })
    .where(eq(sessions.id, sessionId));

  const [existing] = await db
    .select()
    .from(clinicalSummaries)
    .where(eq(clinicalSummaries.sessionId, sessionId))
    .limit(1);

  const values = {
    chiefComplaint: finalFields.chiefComplaint,
    hpi: finalFields.hpi,
    pastMedical: finalFields.pastMedical,
    pastSurgical: finalFields.pastSurgical,
    drugs: finalFields.drugs,
    allergies: finalFields.allergies,
    familyHistory: finalFields.familyHistory,
    personalHistory: finalFields.personalHistory,
    reviewOfSystems: finalFields.reviewOfSystems,
    investigationsSummary: finalFields.investigationsSummary,
    medicationsExtracted: finalFields.medicationsExtracted,
    ayushAssessment: finalFields.ayushAssessment ?? null,
    // Always start as a draft on auto-generate. It only becomes "confirmed"
    // when a staff member explicitly confirms via PATCH (Confirm to HIS).
    status: "draft",
    engine: aiFields ? engine : "template",
    aiUsed: Boolean(aiFields),
    generatedAt: new Date(),
  };

  const [summary] = existing
    ? await db.update(clinicalSummaries).set(values).where(eq(clinicalSummaries.id, existing.id)).returning()
    : await db
        .insert(clinicalSummaries)
        .values({ id: nid(), sessionId, patientId: patient.id, ...values })
        .returning();

  return {
    summary,
    flags,
    aiUsed: Boolean(aiFields),
    engine: aiFields ? engine : null,
    aiError: aiError || null,
    hasGroq: Boolean(process.env.GROQ_API_KEY),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOllama: Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL),
  };
}