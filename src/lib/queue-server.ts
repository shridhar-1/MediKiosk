// ── Server-only queue maintenance ──────────────────────────────────────────
// A token has an arrive-by time (+10 min grace). If the patient never shows
// and is never called, the token flips to "expired" and frees its queue slot.
// There is no cron on serverless — the board (10s) and portal (30s) polls
// call this function, so the polls themselves act as the scheduler.

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, inArray, isNull, lt } from "drizzle-orm";

/** Flip overdue tokens to "expired" — covers live-queue patients (submitted/
 *  summary, 10-min grace after arrive-by) AND home bookings (scheduled,
 *  30-min grace after the appointment time). Safe to call on every request:
 *  matches only rows whose expiresAt has passed and were never called.
 *  Emergency tokens have expiresAt = NULL → never expire. */
export async function expireOverdueTokens(): Promise<number> {
  try {
    const expired = await db
      .update(sessions)
      .set({ status: "expired" })
      .where(
        and(
          inArray(sessions.status, ["submitted", "summary", "scheduled"]),
          isNull(sessions.calledAt),
          lt(sessions.expiresAt, new Date()),
        ),
      )
      .returning({ id: sessions.id });
    return expired.length;
  } catch {
    return 0; // never break the calling route
  }
}