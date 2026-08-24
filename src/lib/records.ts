import { db } from "@/db";
import {
  clinicalSummaries,
  consents,
  documents,
  hisEvents,
  historyResponses,
  patients,
  sessions,
} from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Permanently (hard) delete one intake session and everything that belongs
 * to it. Child rows are removed in FK-safe order so the database is never
 * left with orphaned answers, consents, documents, summaries or HIS events.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  // Children of `sessions`
  await db.delete(hisEvents).where(eq(hisEvents.sessionId, sessionId));
  await db.delete(historyResponses).where(eq(historyResponses.sessionId, sessionId));
  await db.delete(documents).where(eq(documents.sessionId, sessionId));
  await db.delete(clinicalSummaries).where(eq(clinicalSummaries.sessionId, sessionId));
  await db.delete(consents).where(eq(consents.sessionId, sessionId));
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Permanently (hard) delete an entire patient record and every one of their
 * sessions. Reserved for hospital authority (admin / superintendent).
 */
export async function deletePatient(patientId: string): Promise<{ sessionCount: number }> {
  const patientSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.patientId, patientId));

  for (const s of patientSessions) {
    await deleteSession(s.id);
  }
  await db.delete(patients).where(eq(patients.id, patientId));

  return { sessionCount: patientSessions.length };
}
