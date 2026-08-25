import { db } from "@/db";
import { patients } from "@/db/schema";
import { currentStaff } from "@/lib/auth";
import { deletePatient } from "@/lib/records";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/patients/:id — permanently delete a patient and EVERY one of
 * their sessions / answers / documents / summaries.
 *
 * Hospital authority only: the caller must be signed in as staff with the
 * `admin` role (medical superintendent). Physicians and triage cannot wipe a
 * whole patient record — they should delete individual sessions instead.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const member = await currentStaff();
    if (!member) {
      return Response.json({ error: "Staff authentication required" }, { status: 401 });
    }
    if (member.role !== "admin") {
      return Response.json(
        { error: "Only hospital authority (admin) can delete a patient record" },
        { status: 403 },
      );
    }

    const [patient] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    const { sessionCount } = await deletePatient(id);

    return Response.json({
      success: true,
      message: "Patient record permanently deleted",
      deletedPatientId: id,
      patientName: patient.fullName,
      sessionCount,
    });
  } catch (error: any) {
    console.error("DELETE /api/patients/:id error:", error);
    return Response.json(
      { error: error?.message || "Failed to delete patient" },
      { status: 500 },
    );
  }
}