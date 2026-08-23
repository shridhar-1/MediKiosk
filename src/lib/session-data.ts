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
import { desc, eq } from "drizzle-orm";

export async function loadSessionBundle(sessionId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return null;
  const [patient] = await db.select().from(patients).where(eq(patients.id, session.patientId)).limit(1);
  if (!patient) return null;
  const answers = await db
    .select()
    .from(historyResponses)
    .where(eq(historyResponses.sessionId, sessionId));
  const docs = await db.select().from(documents).where(eq(documents.sessionId, sessionId));
  const [summary] = await db
    .select()
    .from(clinicalSummaries)
    .where(eq(clinicalSummaries.sessionId, sessionId))
    .limit(1);
  const consentRows = await db.select().from(consents).where(eq(consents.sessionId, sessionId));
  const events = await db
    .select()
    .from(hisEvents)
    .where(eq(hisEvents.sessionId, sessionId))
    .orderBy(desc(hisEvents.createdAt));
  return { session, patient, answers, documents: docs, summary: summary ?? null, consents: consentRows, events };
}

export function answersMap(
  rows: { questionKey: string; answerJson: unknown; answerText: string | null }[],
): Record<string, { values: string[]; text: string }> {
  const map: Record<string, { values: string[]; text: string }> = {};
  for (const row of rows) {
    const json = row.answerJson as { values?: string[]; text?: string } | null;
    map[row.questionKey] = {
      values: json?.values ?? [],
      text: json?.text ?? row.answerText ?? "",
    };
  }
  return map;
}
