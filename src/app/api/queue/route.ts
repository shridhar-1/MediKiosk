import { db } from "@/db";
import { sessions } from "@/db/schema";
import { currentStaff } from "@/lib/auth";
import { nowServing, queueOrder } from "@/lib/queue";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET  /api/queue → { nowServing, queue }        (kiosk ticket + board)
// POST /api/queue → staff only, { sessionId? }   (call next / call specific)

function publicRow(r: typeof sessions.$inferSelect) {
  return {
    id: r.id,
    tokenNumber: r.tokenNumber,
    department: r.department,
    priority: r.priority,
    status: r.status,
    calledAt: r.calledAt,
    submittedAt: r.submittedAt,
  };
}

export async function GET() {
  try {
    const rows = await db.select().from(sessions);
    const serving = nowServing(rows);
    const queue = queueOrder(rows);
    return Response.json({
      nowServing: serving ? publicRow(serving) : null,
      queue: queue.map(publicRow),
    });
  } catch (error: any) {
    console.error("GET /api/queue error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const member = await currentStaff();
    if (!member) {
      return Response.json({ error: "Staff login required" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };

    const rows = await db.select().from(sessions);
    let target: typeof sessions.$inferSelect | null = null;

    if (body.sessionId) {
      target = rows.find((r) => r.id === body.sessionId && (r.status === "submitted" || r.status === "summary")) ?? null;
    } else {
      target = queueOrder(rows)[0] ?? null; // CALL NEXT — deterministic
    }

    if (!target) {
      return Response.json({ error: "No patient waiting in the queue" }, { status: 404 });
    }

    const [updated] = await db
      .update(sessions)
      .set({ calledAt: new Date() })
      .where(eq(sessions.id, target.id))
      .returning();

    return Response.json({ called: publicRow(updated), by: member.fullName });
  } catch (error: any) {
    console.error("POST /api/queue error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}