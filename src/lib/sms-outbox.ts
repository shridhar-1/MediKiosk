import { db } from "@/db";
import { smsOutbox } from "@/db/schema";
import { nid } from "@/lib/ids";
import { sendViaTextbee, isTextbeeConfigured } from "@/lib/sms-sender";
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

    const [row] = await db
      .insert(smsOutbox)
      .values({
        id: nid(),
        phone: to,
        message: message.trim().slice(0, 300),
        status: "pending",
        source,
      })
      .returning();

    // ── textbee.dev 即时发送 ──────────────────────────────────────────
    // 当配置了 TEXTBEE_API_KEY 时，尝试立即通过
    // textbee 网关（带有其应用程序的医院 Android 手机）进行发送。如果成功，
    // 邮件将被标记为 "sent"；如果不成功，它将保持 "pending" 状态，等待
    // 轮询手机的后备处理。即发即忘（Fire-and-forget）—— 绝不阻塞主流程。
    if (row && isTextbeeConfigured()) {
      void (async () => {
        try {
          const ok = await sendViaTextbee(row.phone, row.message);
          if (ok) {
            await db
              .update(smsOutbox)
              .set({ status: "sent", sentAt: new Date() })
              .where(eq(smsOutbox.id, row.id));
          }
        } catch {
          /* 保持 pending 状态 —— 后备手机将负责发送 */
        }
      })();
    }
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