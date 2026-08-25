import { db } from "@/db";
import {
  clinicalSummaries,
  documents,
  historyResponses,
  patients,
  sessions,
} from "@/db/schema";
import type { AyushAssessment } from "@/db/schema";
import { currentStaff } from "@/lib/auth";
import { nid } from "@/lib/ids";
import { summarizeDocuments } from "@/lib/ocr";
import { evaluateRedFlags } from "@/lib/redflags";
import { answersMap } from "@/lib/session-data";
import { generateSummaryFields } from "@/lib/summary";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type SummaryFields = {
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

type AIInput = {
  patientName: string;
  age: number;
  gender: string;
  mode: string;
  answersText: string;
  docsText: string;
  localFields: SummaryFields;
};

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
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
/* JSON extraction                                                     */
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

/* ------------------------------------------------------------------ */
/* Ollama (local) engine                                               */
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
      // Ollama supports a short timeout; Node fetch may hang on a cold model.
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
/* Gemini engine                                                       */
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

function parseFields(text: string, input: AIInput): SummaryFields | null {
  if (!text.trim()) return null;
  const parsed = extractJsonFromText(text);
  if (parsed && parsed.chiefComplaint) return mergeToFields(parsed, input);
  return null;
}

/* ------------------------------------------------------------------ */
/* Groq (cloud, free tier) engine                                      */
/* ------------------------------------------------------------------ */

async function generateWithGroq(
  input: AIInput,
): Promise<{ fields: SummaryFields | null; error?: string; engine: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { fields: null, error: "GROQ_API_KEY is missing in environment variables", engine: "groq" };
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const messages = [
    {
      role: "system",
      content:
        "You are a senior clinical documentation doctor for Indian hospital OPDs. Return ONLY valid JSON, no markdown or commentary.",
    },
    { role: "user", content: buildPrompt(input) },
  ];

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
      return {
        fields: null,
        engine: "groq",
        error: `Groq (${model}) HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
      };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return { fields: parseFields(text, input), engine: "groq" };
  } catch (e: any) {
    return {
      fields: null,
      engine: "groq",
      error: `Groq request failed: ${e?.message || e}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Engine selection                                                    */
/* ------------------------------------------------------------------ */

// AI_ENGINE: "auto" (default) | "ollama" | "groq" | "gemini"
function resolveEngine(): { order: ("ollama" | "groq" | "gemini")[]; label: string } {
  const choice = (process.env.AI_ENGINE || "auto").toLowerCase();
  if (choice === "ollama") return { order: ["ollama"], label: "ollama" };
  if (choice === "groq") return { order: ["groq"], label: "groq" };
  if (choice === "gemini") return { order: ["gemini"], label: "gemini" };
  // auto: Ollama (local) first, then Groq, then Gemini.
  return { order: ["ollama", "groq", "gemini"], label: "auto" };
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
/* POST — generate summary                                             */
/* ------------------------------------------------------------------ */

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const [patient] = await db.select().from(patients).where(eq(patients.id, session.patientId)).limit(1);
    if (!patient) {
      return Response.json({ error: "Patient missing" }, { status: 404 });
    }

    const answerRows = await db.select().from(historyResponses).where(eq(historyResponses.sessionId, id));
    const docs = await db.select().from(documents).where(eq(documents.sessionId, id));

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

    // Build text for the AI from the resolved answers map (not raw rows).
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

    // Run Ollama and/or Gemini; fall back to local generator.
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
      .where(eq(sessions.id, id));

    const [existing] = await db.select().from(clinicalSummaries).where(eq(clinicalSummaries.sessionId, id)).limit(1);

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
      status: existing?.status === "confirmed" ? existing.status : "draft",
      generatedAt: new Date(),
    };

    const [summary] = existing
      ? await db.update(clinicalSummaries).set(values).where(eq(clinicalSummaries.id, existing.id)).returning()
      : await db
          .insert(clinicalSummaries)
          .values({ id: nid(), sessionId: id, patientId: patient.id, ...values })
          .returning();

    return Response.json({
      summary,
      flags,
      aiUsed: Boolean(aiFields),
      engine: aiFields ? engine : null,
      aiError: aiError || null,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasGroq: Boolean(process.env.GROQ_API_KEY),
      hasOllama: Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL),
    });
  } catch (error: any) {
    console.error("POST /summary failed:", error);
    return Response.json({ error: error?.message || "Failed to generate summary" }, { status: 500 });
  }
}

const EDITABLE_FIELDS = [
  "chiefComplaint",
  "hpi",
  "pastMedical",
  "pastSurgical",
  "drugs",
  "allergies",
  "familyHistory",
  "personalHistory",
  "reviewOfSystems",
  "investigationsSummary",
  "medicationsExtracted",
] as const;

/**
 * PATCH /api/sessions/:id/summary — staff save amendments or confirm to HIS.
 * Expects { fields?, status?, reviewedBy?, physicianNotes? }.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const member = await currentStaff();
    if (!member) {
      return Response.json({ error: "Staff authentication required" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      fields?: Record<string, string>;
      status?: "draft" | "confirmed";
      reviewedBy?: string;
      physicianNotes?: string;
    };

    const [existing] = await db.select().from(clinicalSummaries).where(eq(clinicalSummaries.sessionId, id)).limit(1);
    if (!existing) {
      return Response.json({ error: "No summary to edit for this session" }, { status: 404 });
    }

    const set: Record<string, unknown> = {};
    if (body.fields) {
      for (const key of EDITABLE_FIELDS) {
        if (key in body.fields) set[key] = body.fields[key];
      }
    }
    if (body.status === "confirmed" || body.status === "draft") {
      set.status = body.status;
      if (body.status === "confirmed") set.confirmedAt = new Date();
    }
    if (body.reviewedBy !== undefined) set.reviewedBy = body.reviewedBy;
    if (body.physicianNotes !== undefined) {
      await db
        .update(sessions)
        .set({
          physicianNotes: body.physicianNotes,
          ...(body.status === "confirmed"
            ? { status: "reviewed", reviewedAt: new Date(), reviewedBy: body.reviewedBy ?? member.fullName }
            : {}),
        })
        .where(eq(sessions.id, id));
    }

    const [updated] = await db
      .update(clinicalSummaries)
      .set(Object.keys(set).length ? set : { generatedAt: new Date() })
      .where(eq(clinicalSummaries.id, existing.id))
      .returning();

    return Response.json({ summary: updated });
  } catch (error: any) {
    console.error("PATCH /summary failed:", error);
    return Response.json({ error: error?.message || "Failed to update summary" }, { status: 500 });
  }
}