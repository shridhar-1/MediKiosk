import { db } from "@/db";
import { clinicalSummaries, documents, historyResponses, patients, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { summarizeDocuments } from "@/lib/ocr";
import { evaluateRedFlags } from "@/lib/redflags";
import { answersMap } from "@/lib/session-data";
import { generateSummaryFields } from "@/lib/summary";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  const [patient] = await db.select().from(patients).where(eq(patients.id, session.patientId)).limit(1);
  if (!patient) return Response.json({ error: "Patient missing" }, { status: 404 });

  const answerRows = await db.select().from(historyResponses).where(eq(historyResponses.sessionId, id));
  const docs = await db.select().from(documents).where(eq(documents.sessionId, id));
  const map = answersMap(answerRows);
  const flags = evaluateRedFlags(map);
  const { investigationsSummary, medicationsExtracted } = summarizeDocuments(docs);
  const fields = generateSummaryFields(
    patient,
    map,
    session.mode === "ayush" ? "ayush" : "allopathic",
    investigationsSummary,
    medicationsExtracted,
  );

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
    ...fields,
    status: existing?.status === "confirmed" ? existing.status : "draft",
    generatedAt: new Date(),
  };

  const [summary] = existing
    ? await db.update(clinicalSummaries).set(values).where(eq(clinicalSummaries.id, existing.id)).returning()
    : await db
        .insert(clinicalSummaries)
        .values({
          id: nid(),
          sessionId: id,
          patientId: patient.id,
          ...values,
        })
        .returning();

  return Response.json({ summary, flags });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
  if (!existing) return Response.json({ error: "No summary" }, { status: 404 });

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
    await db.update(sessions).set({ physicianNotes: body.physicianNotes }).where(eq(sessions.id, id));
  }

  return Response.json({ summary });
}
