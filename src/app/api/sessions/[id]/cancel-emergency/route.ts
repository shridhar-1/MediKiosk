import { db } from "@/db";
import { sessions } from "@/db/schema";
import { PATIENT_CANCELLED_NOTE } from "@/lib/redflags";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/sessions/[id]/cancel-emergency
// The patient pressed "This is a mistake — I do not have these symptoms now"
// on the kiosk emergency lock screen (after a two-tap confirm). Records the
// cancellation, downgrades priority emergency → urgent, and KEEPS the flag
// plus a visible note so the doctor always sees what was cancelled.

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const [current] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });

    const reasons = current.redFlagReasons ?? [];
    const updatedReasons = reasons.includes(PATIENT_CANCELLED_NOTE)
      ? reasons
      : [PATIENT_CANCELLED_NOTE, ...reasons];

    const [updated] = await db
      .update(sessions)
      .set({
        emergencyCancelledAt: current.emergencyCancelledAt ?? new Date(),
        priority: current.priority === "emergency" ? "urgent" : current.priority,
        redFlagTriggered: true,
        redFlagReasons: updatedReasons,
      })
      .where(eq(sessions.id, id))
      .returning();

    return Response.json({
      ok: true,
      flags: {
        triggered: true,
        priority: updated.priority,
        reasons: updated.redFlagReasons ?? [],
      },
    });
  } catch (error: any) {
    console.error("POST cancel-emergency error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}