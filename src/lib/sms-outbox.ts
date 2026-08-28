import { db } from "@/db";
import { smsOutbox } from "@/db/schema";
import { nid } from "@/lib/ids";
import { and, eq, gte, sql } from "drizzle-orm";

// How many patient SMS we allow per day (default Jio pack = 100/day).
const DAILY_SMS_CAP = Number(process.env.SMS_DAILY_CAP ?? 90);

/**
 * Queue an SMS to a patient. The message is stored in the `sms_outbox`
 * table and is actually sent by the hospital's Android SMS-gateway phone
 * (personal SIM with free daily SMS) which polls /api/sms/outbox.
 *
 * Never throws — SMS is a bonus channel and must not break the main flow.
 * Silently skips when: no phone, message empty, or daily cap reached.
 */
export async function enqueuePatientSms(
  phone: string | null | undefined,
  message: string,
  source: "token" | "review" = "token",
): Promise<void> {
  try {
    const to = (phone ?? "").replace(/\D/g, "").slice(-10);
    if (to.length !== 10 || !message.trim()) return;

    // Respect the SIM's free daily pack — stop queueing near the cap.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(smsOutbox)
      .where(
        and(
          gte(smsOutbox.createdAt, startOfDay),
          sql`${smsOutbox.status} <> 'skipped'`,
        ),
      );
    if (count >= DAILY_SMS_CAP) return;

    await db.insert(smsOutbox).values({
      id: nid(),
      phone: to,
      message: message.trim().slice(0, 300),
      status: "pending",
      source,
    });
  } catch (error) {
    console.error("enqueuePatientSms failed (ignored):", error);
  }
}

/** Mark a queued SMS as sent/failed by the gateway phone. */
export async function markSmsStatus(id: string, ok: boolean) {
  await db
    .update(smsOutbox)
    .set({ status: ok ? "sent" : "failed", sentAt: new Date() })
    .where(eq(smsOutbox.id, id));
}