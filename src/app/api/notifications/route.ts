import { db } from "@/db";
import { patients, sessions } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications
 * Live hospital alert feed: every intake submitted recently (default last
 * 60 minutes), newest first. Powers the bell / toast notifications on the
 * physician console. Emergency submissions are flagged for banner paging.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMin = Math.min(24 * 60, Math.max(5, Number(searchParams.get("window") ?? 60)));
    const since = new Date(Date.now() - windowMin * 60 * 1000);

    const rows = await db
      .select({
        sessionId: sessions.id,
        tokenNumber: sessions.tokenNumber,
        priority: sessions.priority,
        department: sessions.department,
        language: sessions.language,
        redFlagTriggered: sessions.redFlagTriggered,
        redFlagReasons: sessions.redFlagReasons,
        submittedAt: sessions.submittedAt,
        patientName: patients.fullName,
        patientAge: patients.age,
        patientGender: patients.gender,
        patientAbha: patients.abhaId,
      })
      .from(sessions)
      .innerJoin(patients, eq(sessions.patientId, patients.id))
      .where(inArray(sessions.status, ["submitted", "summary"]))
      .orderBy(desc(sessions.submittedAt))
      .limit(25);

    const alerts = rows
      .filter((r) => r.submittedAt && r.submittedAt.getTime() >= since.getTime())
      .map((r) => ({
        ...r,
        minutesAgo: r.submittedAt ? Math.max(0, Math.round((Date.now() - r.submittedAt.getTime()) / 60000)) : null,
      }));

    return Response.json({
      alerts,
      counts: {
        total: alerts.length,
        emergency: alerts.filter((a) => a.priority === "emergency").length,
        urgent: alerts.filter((a) => a.priority === "urgent").length,
      },
      windowMinutes: windowMin,
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return Response.json({ alerts: [], counts: { total: 0, emergency: 0, urgent: 0 }, error: "unavailable" }, { status: 200 });
  }
}