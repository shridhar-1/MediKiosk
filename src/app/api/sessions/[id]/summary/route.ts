import { db } from "@/db";
import { clinicalSummaries, sessions } from "@/db/schema";
import { currentStaff } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { generateSummaryForSession } from "@/lib/summary-engine";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* POST — generate summary                                            */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* PATCH — update summary                                             */
/* ------------------------------------------------------------------ */
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