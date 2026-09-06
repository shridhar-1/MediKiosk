import { db } from "@/db";
import { clinicalSummaries, patients, sessions } from "@/db/schema";
import { currentStaff } from "@/lib/auth";
import { askRecord, type AskSource, type RecordContext } from "@/lib/ask-record";
import { loadSessionBundle } from "@/lib/session-data";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// POST /api/sessions/[id]/ask  { question }
// Staff-only. Grounded AI Q&A over THIS patient's own record (this visit +
// past visits + documents). The model may only cite the record; anything
// not in it gets "not in this patient's record".

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const member = await currentStaff();
    if (!member) return Response.json({ error: "Staff login required" }, { status: 401 });

    const { id } = await context.params;
    const { question } = (await request.json()) as { question?: string };
    if (!question || !question.trim()) {
      return Response.json({ error: "question required" }, { status: 400 });
    }

    const bundle = await loadSessionBundle(id);
    if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });

    const [patient] = await db.select().from(patients).where(eq(patients.id, bundle.session.patientId));

    // This visit's fields (only non-empty ones reach the model)
    const s = bundle.summary;
    const currentVisit: AskSource[] = [];
    if (s) {
      const fields: AskSource[] = [
        { label: "Chief complaint", value: s.chiefComplaint ?? "" },
        { label: "History of present illness", value: s.hpi ?? "" },
        { label: "Past medical history", value: s.pastMedical ?? "" },
        { label: "Past surgeries", value: s.pastSurgical ?? "" },
        { label: "Current medications", value: s.drugs ?? "" },
        { label: "Allergies", value: s.allergies ?? "" },
        { label: "Family history", value: s.familyHistory ?? "" },
        { label: "Personal history", value: s.personalHistory ?? "" },
        { label: "Investigations", value: s.investigationsSummary ?? "" },
        { label: "Medications from documents", value: s.medicationsExtracted ?? "" },
        { label: "Review of systems", value: s.reviewOfSystems ?? "" },
      ];
      for (const f of fields) if (f.value.trim()) currentVisit.push(f);
    }

    // Past visits of the SAME patient (exclude this one)
    const past = await db
      .select({ session: sessions, summary: clinicalSummaries })
      .from(sessions)
      .leftJoin(clinicalSummaries, eq(clinicalSummaries.sessionId, sessions.id))
      .where(eq(sessions.patientId, bundle.session.patientId))
      .orderBy(desc(sessions.startedAt))
      .limit(30);
    const pastVisits = past
      .filter((r) => r.session.id !== id && (r.summary?.chiefComplaint || r.session.status !== "interview"))
      .map(
        (r) =>
          `${new Date(r.session.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} — ${
            r.summary?.chiefComplaint ?? "no summary"
          } (${r.session.department}, ${r.session.priority})`,
      );

    const documents = bundle.documents.map((d) => {
      const ex = d.extractedJson;
      if (!ex) return d.fileName;
      const bits = [
        ex.diagnoses?.length ? `diagnoses: ${ex.diagnoses.join(", ")}` : "",
        ex.medications?.length
          ? `medications: ${ex.medications.map((m) => `${m.name} ${m.dose} ${m.frequency}`).join(", ")}`
          : "",
        ex.labs?.length ? `labs: ${ex.labs.map((l) => `${l.name} ${l.value}${l.unit} (${l.abnormal ? "abnormal" : "normal"})`).join("; ")}` : "",
      ].filter(Boolean);
      return `${d.docType} (${d.documentDate ?? "date unknown"}): ${bits.join(" · ") || "no findings extracted"}`;
    });

    const ctx: RecordContext = {
      patientLine: `${patient?.fullName ?? "Patient"}, ${patient?.age ?? "?"} / ${patient?.gender ?? "?"}${
        patient?.abhaId ? `, ABHA ${patient.abhaId}` : ""
      }, prefers ${(patient?.preferredLanguage ?? "en").toUpperCase()}`,
      currentVisit,
      pastVisits,
      documents,
    };

    const result = await askRecord(question.trim().slice(0, 300), ctx);
    return Response.json({ ...result, by: member.fullName });
  } catch (error: any) {
    console.error("POST /ask error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}