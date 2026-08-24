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

function asAyushAssessment(value: unknown): AyushAssessment | null {
  if (!value || typeof value !== "object") return null;
  // Keep only if it already looks like your schema object.
  // (Your local generateSummaryFields already returns correct shape.)
  return value as AyushAssessment;
}

async function generateWithGeminiAI(input: {
  patientName: string;
  age: number;
  gender: string;
  mode: string;
  answersText: string;
  docsText: string;
  localFields: SummaryFields;
}): Promise<SummaryFields | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `
You are a clinical documentation AI for Indian hospital OPDs (MediKiosk).
Create a physician-ready structured history summary in clear medical English.

Patient:
- Name: ${input.patientName}
- Age: ${input.age}
- Gender: ${input.gender}
- Mode: ${input.mode}

RAW INTERVIEW ANSWERS:
${input.answersText || "No answers"}

DIGITIZED DOCUMENTS:
${input.docsText || "No documents"}

LOCAL DRAFT (for reference):
${JSON.stringify(input.localFields, null, 2)}

Return ONLY valid JSON with exactly these keys:
{
  "chiefComplaint": "string",
  "hpi": "string",
  "pastMedical": "string",
  "pastSurgical": "string",
  "drugs": "string",
  "allergies": "string",
  "familyHistory": "string",
  "personalHistory": "string",
  "reviewOfSystems": "string",
  "investigationsSummary": "string",
  "medicationsExtracted": "string"
}

Rules:
- Keep concise and clinically useful.
- Do not invent diagnoses.
- If missing, use "Not reported".
- Do not include markdown.
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      console.error("Gemini API error:", await res.text());
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<SummaryFields>;

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
      investigationsSummary:
        parsed.investigationsSummary || input.localFields.investigationsSummary,
      medicationsExtracted:
        parsed.medicationsExtracted || input.localFields.medicationsExtracted,
      // Keep local AYUSH object (correct schema type)
      ayushAssessment: input.localFields.ayushAssessment ?? null,
    };
  } catch (err) {
    console.error("Gemini summarization failed:", err);
    return null;
  }
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
      return Response.json({ error: "Not found" }, { status: 404 });
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

    const localRaw = generateSummaryFields(
      patient,
      map,
      session.mode === "ayush" ? "ayush" : "allopathic",
      investigationsSummary,
      medicationsExtracted
    ) as SummaryFields;

    const localFields: SummaryFields = {
      ...localRaw,
      ayushAssessment: asAyushAssessment(localRaw.ayushAssessment),
    };

    const answersText = answerRows
      .map((a) => {
        const valuesText = Array.isArray((a as any).values)
          ? ((a as any).values as string[]).join(", ")
          : "";
        return `Q: ${(a as any).questionKey || (a as any).questionText || "unknown"}
A: ${(a as any).text || valuesText || "N/A"}`;
      })
      .join("\n\n");

    const docsText = docs
      .map((d) => {
        const extracted = (d as any).extractedJson
          ? JSON.stringify((d as any).extractedJson)
          : "";
        return `Type: ${(d as any).docType}
File: ${(d as any).fileName}
Text: ${(d as any).sourceText || extracted || "N/A"}`;
      })
      .join("\n\n");

    const aiFields = await generateWithGeminiAI({
      patientName: patient.fullName,
      age: patient.age,
      gender: patient.gender,
      mode: session.mode,
      answersText,
      docsText,
      localFields,
    });

    const fields = aiFields || localFields;

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
      chiefComplaint: fields.chiefComplaint,
      hpi: fields.hpi,
      pastMedical: fields.pastMedical,
      pastSurgical: fields.pastSurgical,
      drugs: fields.drugs,
      allergies: fields.allergies,
      familyHistory: fields.familyHistory,
      personalHistory: fields.personalHistory,
      reviewOfSystems: fields.reviewOfSystems,
      investigationsSummary: fields.investigationsSummary,
      medicationsExtracted: fields.medicationsExtracted,
      ayushAssessment: fields.ayushAssessment ?? null,
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
    });
  } catch (error: any) {
    console.error("POST /summary failed:", error);
    return Response.json(
      { error: error?.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      fields?: Record<string, string>;
      status?: string;
      reviewedBy?: string;
      physicianNotes?: string;
    };

    const [existing] = await db
      .select()
      .from(clinicalSummaries)
      .where(eq(clinicalSummaries.sessionId, id))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "No summary" }, { status: 404 });
    }

    const allowed = [
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

    const patch: Record<string, unknown> = {};
    const edits = { ...(existing.physicianEdits ?? {}) };

    if (body.fields) {
      for (const key of allowed) {
        if (body.fields[key] !== undefined) {
          patch[key] = body.fields[key];
          edits[key] = body.fields[key];
        }
      }
      patch.physicianEdits = edits;
    }

    if (body.status) {
      patch.status = body.status;
      if (body.status === "confirmed") patch.confirmedAt = new Date();
    }

    const [summary] = await db
      .update(clinicalSummaries)
      .set(patch)
      .where(eq(clinicalSummaries.id, existing.id))
      .returning();

    if (body.status === "confirmed") {
      await db
        .update(sessions)
        .set({
          status: "reviewed",
          reviewedAt: new Date(),
          reviewedBy: body.reviewedBy ?? "Duty physician",
          physicianNotes: body.physicianNotes ?? undefined,
        })
        .where(eq(sessions.id, id));
    } else if (body.physicianNotes !== undefined) {
      await db
        .update(sessions)
        .set({ physicianNotes: body.physicianNotes })
        .where(eq(sessions.id, id));
    }

    return Response.json({ summary });
  } catch (error: any) {
    console.error("PATCH /summary failed:", error);
    return Response.json(
      { error: error?.message || "Failed to update summary" },
      { status: 500 }
    );
  }
}