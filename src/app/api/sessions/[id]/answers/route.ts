import { db } from "@/db";
import { historyResponses, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { evaluateRedFlags } from "@/lib/redflags";
import { answersMap } from "@/lib/session-data";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    section: string;
    questionKey: string;
    questionText: string;
    text?: string;
    values?: string[];
    inputMode?: string;
  };

  if (!body.questionKey) {
    return Response.json({ error: "questionKey required" }, { status: 400 });
  }

  const payload = {
    values: body.values ?? [],
    text: body.text ?? "",
  };

  const existing = await db
    .select()
    .from(historyResponses)
    .where(and(eq(historyResponses.sessionId, id), eq(historyResponses.questionKey, body.questionKey)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(historyResponses)
      .set({
        section: body.section,
        questionText: body.questionText,
        answerText: payload.text || payload.values.join(", "),
        answerJson: payload,
        inputMode: body.inputMode ?? "touch",
      })
      .where(eq(historyResponses.id, existing[0].id));
  } else {
    await db.insert(historyResponses).values({
      id: nid(),
      sessionId: id,
      section: body.section,
      questionKey: body.questionKey,
      questionText: body.questionText,
      answerText: payload.text || payload.values.join(", "),
      answerJson: payload,
      inputMode: body.inputMode ?? "touch",
    });
  }

  const all = await db.select().from(historyResponses).where(eq(historyResponses.sessionId, id));
  const flags = evaluateRedFlags(answersMap(all));
  await db
    .update(sessions)
    .set({
      redFlagTriggered: flags.triggered,
      redFlagReasons: flags.reasons,
      priority: flags.priority,
    })
    .where(eq(sessions.id, id));

  return Response.json({ ok: true, flags });
}
