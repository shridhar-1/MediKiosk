import { db } from "@/db";
import { smsOutbox } from "@/db/schema";
import { markSmsStatus } from "@/lib/sms-outbox";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// ── ANDROID SMS-GATEWAY ENDPOINT ───────────────────────────────────────────
// The hospital keeps one Android phone (personal SIM with free daily SMS,
// e.g. Jio 100/day) running a small Termux script. The script polls:
//
//   GET  /api/sms/outbox        → pending patient SMS to send
//   POST /api/sms/outbox        → { id, ok } to mark one sent/failed
//
// Optional protection: set SMS_GATEWAY_SECRET in Vercel env and add
// ?key=<same value> to both calls. If the env var is not set, access is
// open (fine for a demo — messages only contain token/review notices).

function authorized(request: Request): boolean {
  const secret = process.env.SMS_GATEWAY_SECRET;
  if (!secret) return true; // no secret configured → open (demo mode)
  const { searchParams } = new URL(request.url);
  return searchParams.get("key") === secret;
}

// GET — the phone asks "any SMS to send?"
export async function GET(request: Request) {
  try {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const pending = await db
      .select()
      .from(smsOutbox)
      .where(eq(smsOutbox.status, "pending"))
      .orderBy(asc(smsOutbox.createdAt))
      .limit(10);
    return Response.json({
      messages: pending.map((m) => ({ id: m.id, phone: m.phone, text: m.message })),
    });
  } catch (error: any) {
    console.error("GET /api/sms/outbox error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

// POST — the phone reports back { id, ok }
export async function POST(request: Request) {
  try {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as { id?: string; ok?: boolean };
    if (!body.id) {
      return Response.json({ error: "id required" }, { status: 400 });
    }
    await markSmsStatus(body.id, body.ok !== false);
    return Response.json({ success: true });
  } catch (error: any) {
    console.error("POST /api/sms/outbox error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}