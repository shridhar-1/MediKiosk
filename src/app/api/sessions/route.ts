import { db } from "@/db";
import { consents, patients, sessions } from "@/db/schema";
import { nid, tokenFor } from "@/lib/ids";
import { seedIfEmpty } from "@/lib/seed";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedIfEmpty();
  const rows = await db
    .select({
      session: sessions,
      patient: patients,
    })
    .from(sessions)
    .innerJoin(patients, eq(sessions.patientId, patients.id))
    .orderBy(desc(sessions.startedAt));
  return Response.json({
    sessions: rows.map((r) => ({ ...r.session, patient: r.patient })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    patientId: string;
    department?: string;
    mode?: string;
    language?: string;
    consents?: { type: string; granted: boolean; audioExplained?: boolean }[];
  };

  if (!body.patientId) {
    return Response.json({ error: "patientId required" }, { status: 400 });
  }

  const existing = await db.select().from(sessions);
  const tokenNumber = tokenFor(body.department ?? "general_medicine", existing.length + 41);

  const [session] = await db
    .insert(sessions)
    .values({
      id: nid(),
      patientId: body.patientId,
      department: body.department ?? "general_medicine",
      mode: body.mode ?? "allopathic",
      language: body.language ?? "en",
      status: "interview",
      tokenNumber,
      priority: "routine",
    })
    .returning();

  if (body.consents?.length) {
    await db.insert(consents).values(
      body.consents.map((c) => ({
        id: nid(),
        sessionId: session.id,
        consentType: c.type,
        granted: c.granted,
        audioExplained: Boolean(c.audioExplained),
      })),
    );
  }

  return Response.json({ session });
}
