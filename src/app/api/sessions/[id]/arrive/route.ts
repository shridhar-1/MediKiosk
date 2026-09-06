import { db } from "@/db";
import { sessions } from "@/db/schema";
import { aheadCount, arriveByTime, formatClockTime } from "@/lib/queue";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/sessions/[id]/arrive
// A patient who pre-registered from HOME presses "I have arrived" in the
// portal. Their booking flips from "scheduled" into the LIVE hospital queue
// (status submitted) with a fresh arrive-by time — the doctor's Call-next
// and the token board pick them up automatically.

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const [current] = await db.select().from(sessions).where(eq(sessions.id, id));
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });

    if (current.status !== "scheduled") {
      return Response.json(
        { error: "This token is not a home booking (or it already expired)" },
        { status: 400 },
      );
    }

    const all = await db.select().from(sessions);
    const ahead = aheadCount(all, id);

    const [updated] = await db
      .update(sessions)
      .set({
        location: "hospital",
        status: "submitted",
        calledAt: null,
        // fresh live-queue expiry: arrive-by + 10 min grace
        expiresAt: new Date(arriveByTime(ahead).getTime() + 10 * 60_000),
      })
      .where(eq(sessions.id, id))
      .returning();

    return Response.json({
      session: updated,
      ahead,
      arriveBy: formatClockTime(arriveByTime(ahead)),
    });
  } catch (error: any) {
    console.error("POST arrive error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}