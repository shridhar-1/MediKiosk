import { db } from "@/db";
import { sessions } from "@/db/schema";
import { currentPatient, currentStaff } from "@/lib/auth";
import { deleteSession } from "@/lib/records";
import { loadSessionBundle } from "@/lib/session-data";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = await loadSessionBundle(id);
  if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(bundle);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const member = await currentStaff();
    const patient = await currentPatient();

    if (!member && !patient) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    if (!member && patient && session.patientId !== patient.id) {
      return Response.json({ error: "You can only delete your own submissions" }, { status: 403 });
    }

    await deleteSession(id);

    return Response.json({
      success: true,
      message: "Submission permanently deleted",
      deletedSessionId: id,
      deletedBy: member ? `staff:${member.id}` : `patient:${patient!.id}`,
    });
  } catch (error: any) {
    console.error("DELETE /api/sessions/:id error:", error);
    return Response.json(
      { error: error?.message || "Failed to delete session" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: string;
    department?: string;
    mode?: string;
    language?: string;
    physicianNotes?: string;
    priority?: string;
  };

  const [updated] = await db
    .update(sessions)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.department ? { department: body.department } : {}),
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.language ? { language: body.language } : {}),
      ...(body.physicianNotes !== undefined ? { physicianNotes: body.physicianNotes } : {}),
      ...(body.priority ? { priority: body.priority } : {}),
    })
    .where(eq(sessions.id, id))
    .returning();

  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ session: updated });
}