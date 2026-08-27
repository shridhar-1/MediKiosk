// FILE: src/app/api/sessions/[id]/summary/route.ts
// FIXED VERSION - Aug 25 2026 - All gaps fixed
// Uses generateSummaryForSession from lib (Groq fix + bilingual + fallback)

import { db } from "@/db";
import { clinicalSummaries, sessions } from "@/db/schema";
import { currentStaff } from "@/lib/auth";
import { generateSummaryForSession } from "@/lib/summary-engine";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
 * POST /api/sessions/:id/summary
 * Generates or regenerates summary using AI (Groq/Gemini/Ollama) with template fallback.
 * Fixed: Groq model now openai/gpt-oss-120b with fallback loop
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await generateSummaryForSession(id);
    return Response.json(result);
  } catch (error: any) {
    console.error("POST /summary failed:", error);
    return Response.json({ error: error?.message || "Failed to generate summary" }, { status: 500 });
  }
}

/**
 * PATCH /api/sessions/:id/summary — staff save amendments or confirm to HIS.
 * Expects { fields?, status?, reviewedBy?, physicianNotes?, patientAdvice? }.
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
      patientAdvice?: string;
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
    // Doctor's advice for the patient — visible in the patient portal
    if (body.patientAdvice !== undefined) {
      set.patientAdvice = body.patientAdvice;
    }
    if (body.physicianNotes !== undefined || body.status === "confirmed") {
      await db
        .update(sessions)
        .set({
          ...(body.physicianNotes !== undefined ? { physicianNotes: body.physicianNotes } : {}),
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