import { db } from "@/db";
import { clinicalSummaries, consents, patients, sessions } from "@/db/schema";
import { nid, tokenFor } from "@/lib/ids";
import { seedIfEmpty } from "@/lib/seed";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/sessions?phone=... OR ?abhaId=... OR ?patientId=...
export async function GET(request: Request) {
  try {
    await seedIfEmpty();

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    const phone = searchParams.get("phone");
    const abhaId = searchParams.get("abhaId");

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

    // Filter by query parameters if present
    // NOTE: phones are normalized to the LAST 10 DIGITS so that
    // "+919876543210", "919876543210" and "9876543210" all match each other.
    const last10 = (p?: string | null) => (p ?? "").replace(/\D/g, "").slice(-10);
    let filteredRows = rows;
    if (patientId) {
      filteredRows = rows.filter((r) => r.patient.id === patientId);
    } else if (phone) {
      const wanted = last10(phone);
      filteredRows =
        wanted.length === 10 ? rows.filter((r) => last10(r.patient.phone) === wanted) : [];
    } else if (abhaId) {
      const digits = abhaId.replace(/\D/g, "");
      filteredRows = rows.filter((r) => (r.patient.abhaId ?? "").replace(/\D/g, "") === digits);
    }

    return Response.json({
      sessions: filteredRows.map((r) => ({
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

// DELETE /api/sessions -> Clear all sessions
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