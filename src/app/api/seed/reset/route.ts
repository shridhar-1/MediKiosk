import { db } from "@/db";
import {
  authSessions,
  clinicalSummaries,
  consents,
  documents,
  hisEvents,
  historyResponses,
  patients,
  sessions,
  smsOutbox,
  staff,
} from "@/db/schema";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * One-click demo reset for live presentations (SIH judging, mentors).
 *
 * Wipes ALL session data created during demos — intakes, answers, documents,
 * summaries, HIS/FHIR events, SMS, logins — then re-seeds the canonical demo
 * state (patients, staff, and the ready-made OPD queue with emergency cases).
 *
 * Available ONLY when DEMO_MODE==="true". Returns 403 in production.
 *
 * Usage:  curl -X POST https://<host>/api/seed/reset
 */
export async function POST() {
  if (process.env.DEMO_MODE !== "true") {
    return Response.json(
      { error: "Demo reset is disabled outside DEMO_MODE." },
      { status: 403 },
    );
  }

  // Children first, then parents.
  await db.delete(hisEvents);
  await db.delete(smsOutbox);
  await db.delete(clinicalSummaries);
  await db.delete(documents);
  await db.delete(historyResponses);
  await db.delete(consents);
  await db.delete(sessions);
  await db.delete(authSessions);
  await db.delete(patients);
  await db.delete(staff);

  const result = await seedIfEmpty();
  return Response.json({ reset: true, ...result });
}