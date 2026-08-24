import { db } from "@/db";
import { clinicalSummaries, consents, patients, sessions } from "@/db/schema";
import { nid, tokenFor } from "@/lib/ids";
import { seedIfEmpty } from "@/lib/seed";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/sessions -> Fetch all sessions with patient info & AI summary
export async function GET() {
  try {
    await seedIfEmpty();

    const rows = await db
      .select({
        session: sessions,
        patient: patients,
        summary: clinicalSummaries,
      })
      .from(sessions)
      .innerJoin(patients, eq(sessions.patientId, patients.id))
      .leftJoin(clinicalSummaries, eq(clinicalSummaries.sessionId, sessions.id))
      .orderBy(desc(sessions.startedAt));

    return Response.json({
      sessions: rows.map((r) => ({
        ...r.session,
        patient: r.patient,
        summary: r.summary,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/sessions error:", error);
    return Response.json(
      { error: error?.message || "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// POST /api/sessions -> Create a new intake session
export async function POST(request: Request) {
  try {
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
    const tokenNumber = tokenFor(
      body.department ?? "general_medicine",
      existing.length + 41
    );

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
        }))
      );
    }

    return Response.json({ session });
  } catch (error: any) {
    console.error("POST /api/sessions error:", error);
    return Response.json(
      { error: error?.message || "Failed to create session" },
      { status: 500 }
    );
  }
}

// DELETE /api/sessions -> Clear/Reset all sessions (Optional Queue Reset)
export async function DELETE() {
  try {
    await db.delete(clinicalSummaries);
    await db.delete(consents);
    await db.delete(sessions);

    return Response.json({
      success: true,
      message: "All sessions cleared successfully",
    });
  } catch (error: any) {
    console.error("DELETE /api/sessions error:", error);
    return Response.json(
      { error: error?.message || "Failed to clear sessions" },
      { status: 500 }
    );
  }
}