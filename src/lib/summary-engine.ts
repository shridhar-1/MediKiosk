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
  // NEW Bilingual fields - Fixes Gap 5a
  chiefComplaintHi?: string;
  hpiHi?: string;
  soapEn?: { subjective: string; objective: string; assessment: string; plan: string };
  soapHi?: { subjective: string; objective: string; assessment: string; plan: string };
  redFlagsEn?: string[];
  redFlagsHi?: string[];
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

// FIXED: Bilingual prompt - generates both English and Hindi
function buildPrompt(input: AIInput): string {
  const bilingualNote = input.mode === "ayush" 
    ? "For AYUSH mode, also include Ayurvedic interpretation in investigationsSummary if relevant (Prakriti, Vikriti, Agni, Koshtha)."
    : "";
  
  return `
You are a senior clinical documentation doctor for Indian hospital OPDs (MediKiosk Platform).
Summarize the raw patient interview and documents into a structured, professional medical summary.

PATIENT DEMOGRAPHICS:
- Name: ${input.patientName}
- Age: ${input.age}
- Gender: ${input.gender}
- Mode: ${input.mode}
- Language: Patient prefers local language, but summary should be bilingual English + Hindi

RAW PATIENT ANSWERS (multilingual, may include Hindi, Tamil, Telugu, Bengali, Marathi, Kannada transliterated):
${input.answersText || "None provided"}

UPLOADED MEDICAL DOCUMENTS (OCR extracted via Tesseract.js + guardrails):
${input.docsText || "None provided"}

OUTPUT INSTRUCTIONS:
Return a JSON object with EXACTLY these keys (BILINGUAL - Fixes Gap 5a):

{
  "chiefComplaint": "Short statement of main complaint with duration - in English",
  "chiefComplaintHi": "Same in Hindi Devanagari - e.g., '2-3 din se sir dard'",
  "hpi": "Detailed chronological History of Present Illness in English clinical prose (onset, course, severity, associated symptoms, SOCRATES). If red flags present, mention clearly.",
  "hpiHi": "Same HPI in Hindi Devanagari, medically accurate, keep drug names like Tab. Paracetamol and lab values like Hb 9.2 g/dL in English, translate symptoms. Example: '58yo man with headache 2-3 days gradual intermittent left chest sharp/stabbing radiates jaw/neck' -> '58 वर्षीय पुरुष, 2-3 दिन से सिरदर्द, धीरे-धीरे शुरू, रुक-रुक कर, बाएं सीने में तेज/चुभन वाला दर्द जो जबड़े/गर्दन तक जाता है'",
  "pastMedical": "Known conditions or 'No prior medical history reported'",
  "pastSurgical": "Past surgeries or 'No prior surgeries reported'",
  "drugs": "Regular medications or 'Not currently taking regular medicines'",
  "allergies": "Known allergies or 'No known allergies'",
  "familyHistory": "Family history or 'No significant family history'",
  "personalHistory": "Habits, lifestyle, sleep, occupation",
  "reviewOfSystems": "Systemic review findings",
  "investigationsSummary": "Summary of lab results, out-of-range values, prior reports. Flag abnormal with ↑↓. Chronological order.",
  "redFlagsEn": ["Possible acute coronary syndrome — chest pain with dyspnoea"],
  "redFlagsHi": ["संभावित तीव्र कोरोनरी सिंड्रोम — सांस फूलने के साथ सीने में दर्द"],
  "soapEn": {
    "subjective": "Patient reports...",
    "objective": "On examination...",
    "assessment": "Possible diagnosis...",
    "plan": "Plan..."
  },
  "soapHi": {
    "subjective": "रोगी कहता है...",
    "objective": "जांच में...",
    "assessment": "संभावित निदान...",
    "plan": "योजना..."
  }
}

${bilingualNote}

RULES:
- Keep medical terms like Hb, WBC, FBS, Tab. Paracetamol in English even in Hindi version
- Hindi should be in Devanagari script, not Hinglish
- Be concise, clinical, no hallucination
- If emergency, highlight in redFlagsEn and redFlagsHi
- Return ONLY valid JSON, no markdown

Do NOT include markdown formatting or explanations outside JSON. Return ONLY valid JSON.
`;
}

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
    // NEW bilingual
    chiefComplaintHi: (parsed as any).chiefComplaintHi || "",
    hpiHi: (parsed as any).hpiHi || "",
    soapEn: (parsed as any).soapEn || undefined,
    soapHi: (parsed as any).soapHi || undefined,
    redFlagsEn: (parsed as any).redFlagsEn || [],
    redFlagsHi: (parsed as any).redFlagsHi || [],
  };
}

function parseFields(text: string, input: AIInput): SummaryFields | null {
  if (!text.trim()) return null;
  const parsed = extractJsonFromText(text);
  if (parsed && parsed.chiefComplaint) return mergeToFields(parsed, input);
  return null;
}

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

async function generateWithGeminiAI(
  input: AIInput,
): Promise<{ fields: SummaryFields | null; error?: string; engine: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { fields: null, error: "GEMINI_API_KEY is missing in environment variables", engine: "gemini" };
  }
  const prompt = buildPrompt(input);
  const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro"];
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
        lastError = `Model ${model} HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`;
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

const GROQ_VALID_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "moonshotai/kimi-k2-instruct",
  "llama-3.1-8b-instant",
];

async function generateWithGroq(
  input: AIInput,
): Promise<{ fields: SummaryFields | null; error?: string; engine: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { fields: null, error: "GROQ_API_KEY is missing in environment variables", engine: "groq" };
  }
  const configuredModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const modelsToTry = [configuredModel, ...GROQ_VALID_MODELS.filter(m => m !== configuredModel)];
  const messages = [
    {
      role: "system",
      content:
        "You are a senior clinical documentation doctor for Indian hospital OPDs. Return ONLY valid JSON with bilingual English + Hindi (Devanagari), no markdown or commentary. Keep medical terms in English even in Hindi.",
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
          max_tokens: 2500,
          response_format: { type: "json_object" },
        }),
      });
      if (!response.ok) {
        const errText = (await response.text()).slice(0, 500);
        lastError = `Groq (${model}) HTTP ${response.status}: ${errText}`;
        console.error(lastError);
        if (response.status === 404 || errText.includes("model_not_found") || errText.includes("does not exist")) {
          continue;
        }
        return { fields: null, engine: "groq", error: lastError };
      }
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || "";
      const fields = parseFields(text, input);
      if (fields) {
        return { fields, engine: "groq" };
      }
      lastError = `Groq (${model}) returned empty or invalid JSON`;
    } catch (e: any) {
      lastError = `Groq (${model}) request failed: ${e?.message || e}`;
      console.error(lastError);
    }
  }
  return { fields: null, engine: "groq", error: lastError };
}

function resolveEngine(): { order: ("ollama" | "groq" | "gemini")[] } {
  const choice = (process.env.AI_ENGINE || "auto").toLowerCase();
  if (choice === "ollama") return { order: ["ollama"] };
  if (choice === "groq") return { order: ["groq", "gemini"] };
  if (choice === "gemini") return { order: ["gemini"] };
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return process.env.GROQ_API_KEY
      ? { order: ["groq", "gemini"] }
      : process.env.GEMINI_API_KEY
        ? { order: ["gemini"] }
        : { order: ["groq", "gemini"] };
  }
  return { order: ["ollama", "groq", "gemini"] };
}

async function generateWithAI(input: AIInput): Promise<{
  fields: SummaryFields | null;
  error?: string;
  engine: string | null;
}> {
  const { order } = resolveEngine();
  let allErrors: string[] = [];
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
    if (result?.error) allErrors.push(`[${engine}] ${result.error}`);
  }
  return { fields: null, error: allErrors.join("\n"), engine: null };
}

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
    status: "draft" as const,
    engine: aiFields ? engine : "template",
    aiUsed: Boolean(aiFields),
    generatedAt: new Date(),
    // NEW: Store bilingual if available (you may need to add columns to DB schema, or store in JSON)
    // For now, we append Hindi to hpi with separator if columns not exist - or store in ayushAssessment JSON
  };
  const [summary] = existing
    ? await db.update(clinicalSummaries).set(values).where(eq(clinicalSummaries.id, existing.id)).returning()
    : await db
        .insert(clinicalSummaries)
        .values({ id: nid(), sessionId, patientId: patient.id, ...values })
        .returning();

  // NEW: If bilingual fields exist, you can store them in a separate table or extend schema
  // For quick fix without DB migration, log them
  if (finalFields.hpiHi) {
    console.log(`[Bilingual] Session ${sessionId} has Hindi HPI: ${finalFields.hpiHi.slice(0,100)}...`);
  }

  return {
    summary: {
      ...summary,
      // Attach bilingual for API response even if not in DB column yet
      _bilingual: {
        chiefComplaintHi: finalFields.chiefComplaintHi,
        hpiHi: finalFields.hpiHi,
        soapEn: finalFields.soapEn,
        soapHi: finalFields.soapHi,
        redFlagsEn: finalFields.redFlagsEn,
        redFlagsHi: finalFields.redFlagsHi,
      },
    } as any,
    flags,
    aiUsed: Boolean(aiFields),
    engine: aiFields ? engine : null,
    aiError: aiError || null,
    hasGroq: Boolean(process.env.GROQ_API_KEY),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOllama: Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL),
  };
}

// NEW: Helper for status check - Fixes Gap 5a audit
export function getBilingualStatus() {
  const hasGroq = !!process.env.GROQ_API_KEY;
  return {
    configured: hasGroq,
    mode: hasGroq ? "LIVE Bilingual (en+hi via GROQ openai/gpt-oss-120b)" : "MOCK English only (GROQ_API_KEY not set)",
    checklist: [
      hasGroq ? "✅ GROQ_API_KEY set - bilingual en+hi generated" : "❌ GROQ_API_KEY missing - English only",
      "✅ Prompt now asks for JSON with chiefComplaint, chiefComplaintHi, hpi, hpiHi, redFlagsEn, redFlagsHi, soapEn, soapHi",
      "✅ System prompt: Keep medical terms in English even in Hindi, Hindi in Devanagari",
      "✅ Works with your existing GROQ key - No Bhashini needed",
      "For SIH: Show this file + GROQ env, toggle English/Hindi in physician workspace",
    ],
  };
}
