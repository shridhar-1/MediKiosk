import { db } from "@/db";
import { historyResponses, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { extractIntake, type ChatTurn } from "@/lib/chat-extract";
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

// POST /api/sessions/[id]/chat-extract  { text, history? }
// "Fast chat" intake — a real conversation, not one shot:
//   · greeting/chit-chat → conversational reply, NOTHING written
//   · medical message   → AI extracts structured answers from the WHOLE
//     conversation → written into the SAME question keys as the guided
//     interview → flags (symptoms + speech + drug-safety) recomputed every
//     turn → returns one follow-up question while essentials are missing.

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { text?: string; history?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return Response.json({ error: "text required" }, { status: 400 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) return Response.json({ error: "Not found" }, { status: 404 });

    // sanitize conversation history (bounded — kiosk memory is small)
    const history: ChatTurn[] = (Array.isArray(body.history) ? body.history : [])
      .map((h) => h as { who?: unknown; text?: unknown })
      .filter((h) => (h.who === "patient" || h.who === "assistant") && typeof h.text === "string" && h.text.trim().length > 0)
      .slice(-12)
      .map((h) => ({ who: h.who as "patient" | "assistant", text: (h.text as string).slice(0, 2000) }));

    // 1) Greeting guard / AI / naive — extraction from the whole conversation
    const { isMedical, reply, extracted, followUp, engine, aiUsed } = await extractIntake(text, history);
    if (!isMedical) {
      // greetings & chit-chat: answer warmly, write nothing, no fake file
      return Response.json({ chat: true, reply, engine, aiUsed });
    }

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

    // 4) Flags: structured + speech + drug-safety, cancellation respected.
    //    Re-run every turn — emergencies surface mid-conversation.
    const all = await db.select().from(historyResponses).where(eq(historyResponses.sessionId, id));
    const map = answersMap(all);
    const saidEverything = `${text} ${all
      .map((r) => {
        const json = r.answerJson as { values?: string[]; text?: string } | null;
        return [r.answerText, json?.text ?? "", (json?.values ?? []).join(" ")].join(" ");
      })
      .join(" ")}`;
    const drugFired = checkDrugSafety({
      allergies: extracted.allergies.join(", "),
      medications: extracted.medications.join(", "),
      conditionsText: saidEverything,
      transcript: saidEverything,
    });
    const flags = withPatientCancellation(
      session.emergencyCancelledAt,
      mergeRedFlagResults(
        evaluateRedFlags(map),
        evaluateRedFlagsFromText(saidEverything),
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

    return Response.json({ extracted, engine, aiUsed, flags, followUp });
  } catch (error: any) {
    console.error("POST chat-extract error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}