import { db } from "@/db";
import { historyResponses, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { extractIntake } from "@/lib/chat-extract";
import { checkDrugSafety, drugSafetyResult } from "@/lib/drug-safety";
import {
  evaluateRedFlags,
  evaluateRedFlagsFromText,
  mergeRedFlagResults,
  withPatientCancellation,
} from "@/lib/redflags";
import { answersMap } from "@/lib/session-data";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/sessions/[id]/chat-extract  { text }
// "Fast chat" intake: one free paragraph → AI extracts the structured answers
// → written into the SAME question keys as the guided interview → flags
// (symptoms + speech + drug-safety) recomputed exactly like the answers route.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { text } = (await request.json()) as { text?: string };
    if (!text || !text.trim()) {
      return Response.json({ error: "text required" }, { status: 400 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) return Response.json({ error: "Not found" }, { status: 404 });

    // 1) AI (or honest naive parser) extracts the structure
    const { extracted, engine, aiUsed } = await extractIntake(text);

    // 2) Map to the guided interview's question keys (same shapes)
    const rows: {
      section: string;
      questionKey: string;
      questionText: string;
      values: string[];
      text: string;
    }[] = [
      { section: "present_illness", questionKey: "chief_complaint", questionText: "Chief complaint (from fast chat)", values: [], text: extracted.chiefComplaint },
      { section: "present_illness", questionKey: "duration", questionText: "Duration (from fast chat)", values: [], text: extracted.durationText },
      { section: "present_illness", questionKey: "severity", questionText: "Severity 1-10 (from fast chat)", values: [], text: extracted.severity },
      { section: "medications", questionKey: "medications", questionText: "Current medications (from fast chat)", values: extracted.medications.length > 0 ? ["yes"] : ["no"], text: "" },
      { section: "medications", questionKey: "medications_detail", questionText: "Which medicines (from fast chat)", values: [], text: extracted.medications.join(", ") },
      { section: "allergies", questionKey: "allergies", questionText: "Allergies (from fast chat)", values: extracted.allergies.length > 0 ? ["yes"] : ["no"], text: "" },
      { section: "allergies", questionKey: "allergies_detail", questionText: "What allergies (from fast chat)", values: [], text: extracted.allergies.join(", ") },
      { section: "past_history", questionKey: "pmh", questionText: "Past medical history (from fast chat)", values: [], text: extracted.pastMedical },
      { section: "past_history", questionKey: "family", questionText: "Family history (from fast chat)", values: [], text: extracted.familyHistory },
      { section: "personal", questionKey: "tobacco", questionText: "Tobacco use (from fast chat)", values: extracted.tobacco ? [extracted.tobacco] : [], text: "" },
    ].filter((r) => r.text.trim() !== "" || r.values.length > 0);

    // 3) Upsert each into historyResponses (same as the answers route)
    for (const r of rows) {
      const existing = await db
        .select()
        .from(historyResponses)
        .where(and(eq(historyResponses.sessionId, id), eq(historyResponses.questionKey, r.questionKey)))
        .limit(1);
      const payload = { values: r.values, text: r.text };
      if (existing[0]) {
        await db
          .update(historyResponses)
          .set({
            section: r.section,
            questionText: r.questionText,
            answerText: r.text || r.values.join(", "),
            answerJson: payload,
            inputMode: "chat",
          })
          .where(eq(historyResponses.id, existing[0].id));
      } else {
        await db.insert(historyResponses).values({
          id: nid(),
          sessionId: id,
          section: r.section,
          questionKey: r.questionKey,
          questionText: r.questionText,
          answerText: r.text || r.values.join(", "),
          answerJson: payload,
          inputMode: "chat",
        });
      }
    }

    // 4) Flags: structured + speech + drug-safety, cancellation respected
    const all = await db.select().from(historyResponses).where(eq(historyResponses.sessionId, id));
    const map = answersMap(all);
    const saidEverything = all
      .map((r) => {
        const json = r.answerJson as { values?: string[]; text?: string } | null;
        return [r.answerText, json?.text ?? "", (json?.values ?? []).join(" ")].join(" ");
      })
      .join(" ");
    const drugFired = checkDrugSafety({
      allergies: extracted.allergies.join(", "),
      medications: extracted.medications.join(", "),
      conditionsText: saidEverything,
      transcript: `${text} ${saidEverything}`,
    });
    const flags = withPatientCancellation(
      session.emergencyCancelledAt,
      mergeRedFlagResults(
        evaluateRedFlags(map),
        evaluateRedFlagsFromText(`${text} ${saidEverything}`),
        drugSafetyResult(drugFired),
      ),
    );

    await db
      .update(sessions)
      .set({
        redFlagTriggered: flags.triggered,
        redFlagReasons: flags.reasons,
        priority: flags.priority,
      })
      .where(eq(sessions.id, id));

    return Response.json({ extracted, engine, aiUsed, flags });
  } catch (error: any) {
    console.error("POST chat-extract error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}