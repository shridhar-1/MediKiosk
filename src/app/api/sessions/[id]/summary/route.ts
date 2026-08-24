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

async function generateWithGeminiAI(input: {
  patientName: string;
  age: number;
  gender: string;
  mode: string;
  answersText: string;
  docsText: string;
  localFields: SummaryFields;
}): Promise<{ fields: SummaryFields | null; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { fields: null, error: "GEMINI_API_KEY is missing in environment variables" };
  }

  const prompt = `
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

  const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
  let lastError = "";

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        lastError = `Model ${model} HTTP ${response.status}: ${errText}`;
        console.error(lastError);
        continue;
      }

      const responseData = await response.json();
      const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        lastError = `Model ${model} returned empty response`;
        continue;
      }

      const parsed = extractJsonFromText(rawText) as Partial<SummaryFields>;

      if (parsed && parsed.chiefComplaint) {
        return {
          fields: {
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
          },
        };
      } else {
        lastError = `Failed to parse valid JSON fields from ${model} response`;
      }
    } catch (e: any) {
      lastError = `Exception with ${model}: ${e.message}`;
      console.error(lastError);
    }
  }

  return { fields: null, error: lastError };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, session.patientId))
      .limit(1);

    if (!patient) {
      return Response.json({ error: "Patient missing" }, { status: 404 });
    }

    const answerRows = await db
      .select()
      .from(historyResponses)
      .where(eq(historyResponses.sessionId, id));

    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.sessionId, id));

    const map = answersMap(answerRows);
    const flags = evaluateRedFlags(map);
    const { investigationsSummary, medicationsExtracted } = summarizeDocuments(docs);

    const localFields = generateSummaryFields(
      patient,
      map,
      session.mode === "ayush" ? "ayush" : "allopathic",
      investigationsSummary,
      medicationsExtracted
    ) as SummaryFields;

    // FIX: build AI text from the RESOLVED answers map, not raw rows.
    const answersText = Object.entries(map)
      .map(([key, ans]) => {
        const value = (ans.text ?? "").trim() || (ans.values ?? []).join(", ");
        return `Question (${key}): ${value || "N/A"}`;
      })
      .join("\n");

    const docsText = docs
      .map((d: any) => `Document (${d.docType}): ${d.sourceText || JSON.stringify(d.extractedJson || {})}`)
      .join("\n");

    const { fields: aiFields, error: aiError } = await generateWithGeminiAI({
      patientName: patient.fullName,
      age: patient.age,
      gender: patient.gender,
      mode: session.mode,
      answersText,
      docsText,
      localFields,
    });

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

    const [existing] = await db
      .select()
      .from(clinicalSummaries)
      .where(eq(clinicalSummaries.sessionId, id))
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
      status: existing?.status === "confirmed" ? existing.status : "draft",
      generatedAt: new Date(),
    };

    const [summary] = existing
      ? await db
          .update(clinicalSummaries)
          .set(values)
          .where(eq(clinicalSummaries.id, existing.id))
          .returning()
      : await db
          .insert(clinicalSummaries)
          .values({
            id: nid(),
            sessionId: id,
            patientId: patient.id,
            ...values,
          })
          .returning();

    return Response.json({
      summary,
      flags,
      aiUsed: Boolean(aiFields),
      aiError: aiError || null,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (error: any) {
    console.error("POST /summary failed:", error);
    return Response.json(
      { error: error?.message || "Failed to generate summary" },
      { status: 500 }
    );
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

// NEW: staff-only PATCH so "Save amendments" / "Confirm to HIS" actually work.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

    const [existing] = await db
      .select()
      .from(clinicalSummaries)
      .where(eq(clinicalSummaries.sessionId, id))
      .limit(1);

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
          ...(body.status === "confirmed" ? { status: "reviewed", reviewedAt: new Date(), reviewedBy: body.reviewedBy ?? member.fullName } : {}),
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
    return Response.json(
      { error: error?.message || "Failed to update summary" },
      { status: 500 },
    );
  }
}