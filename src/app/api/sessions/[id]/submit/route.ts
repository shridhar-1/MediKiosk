import { db } from "@/db";
import { hisEvents, patients, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { notifyHospitalSubmission } from "@/lib/notify";
import { loadSessionBundle } from "@/lib/session-data";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  
  // Parse the new optional fields from the request body
  let body: { 
    reviewedBy?: string; 
    physicianNotes?: string; 
    patientAdvice?: string;
    status?: string; 
  } = {};
  
  try {
    body = await request.json();
  } catch (e) {
    // Gracefully handle empty or invalid JSON bodies
  }
  const { reviewedBy, physicianNotes, patientAdvice, status } = body;

  const bundle = await loadSessionBundle(id);
  if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });

  // 1. Build the update payload dynamically based on the requested logic
  const setPayload: Record<string, any> = {
    status: "submitted", // Default fallback status
    submittedAt: new Date(),
  };

  if (body.status === "confirmed" || body.status === "draft") {
    setPayload.status = body.status;
    if (body.status === "confirmed") {
      setPayload.confirmedAt = new Date();
    }
  }

  // Doctor's advice for the patient — visible in the patient portal
  if (body.patientAdvice !== undefined) {
    setPayload.patientAdvice = body.patientAdvice;
  }

  // 2. Physician notes and review status overrides
  if (body.physicianNotes !== undefined || body.status === "confirmed") {
    if (body.physicianNotes !== undefined) {
      setPayload.physicianNotes = body.physicianNotes;
    }
    
    if (body.status === "confirmed") {
      setPayload.status = "reviewed"; // Overwrites "confirmed" status per the new logic
      setPayload.reviewedAt = new Date();
      if (body.reviewedBy) {
        setPayload.reviewedBy = body.reviewedBy; 
      }
    }
  }

  // Update session with the dynamically built payload
  await db
    .update(sessions)
    .set(setPayload)
    .where(eq(sessions.id, id));

  const [patient] = await db.select().from(patients).where(eq(patients.id, bundle.session.patientId));

  const fhirBundle = {
    resourceType: "Bundle",
    type: "document",
    timestamp: new Date().toISOString(),
    identifier: { system: "https://abdm.gov.in/phr", value: patient?.abhaId ?? bundle.session.id },
    entry: [
      {
        resource: {
          resourceType: "Patient",
          id: bundle.patient.id,
          name: [{ text: bundle.patient.fullName }],
          gender: bundle.patient.gender,
          identifier: patient?.abhaId
            ? [{ system: "https://healthid.ndhm.gov.in", value: patient.abhaId }]
            : [],
        },
      },
      {
        resource: {
          resourceType: "Composition",
          title: "MediKiosk Clinical History Summary",
          status: "preliminary",
          type: { text: "History and physical note" },
          date: new Date().toISOString(),
          section: [
            { title: "Chief complaint", text: { div: bundle.summary?.chiefComplaint ?? "" } },
            { title: "HPI", text: { div: bundle.summary?.hpi ?? "" } },
            // Add notes and advice to the FHIR document if they are provided
            ...(physicianNotes ? [{ title: "Physician Notes", text: { div: physicianNotes } }] : []),
            ...(patientAdvice ? [{ title: "Patient Advice", text: { div: patientAdvice } }] : []),
          ],
        },
      },
    ],
  };

  const [event] = await db
    .insert(hisEvents)
    .values({
      id: nid(),
      sessionId: id,
      eventType: "fhir_bundle_pushed",
      payload: {
        destination: "Hospital HIS + ABDM PHR",
        consent: bundle.consents.filter((c) => c.granted).map((c) => c.consentType),
        bundle: fhirBundle,
      },
    })
    .returning();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));

  // ── AUTOMATED HOSPITAL NOTIFICATION ─────────────────────────────────────
  // Fires the moment the form is submitted: console alert event + email +
  // WhatsApp + SMS (channels without env config degrade to "mock", never throw).
  const latestFlags = await db
    .select({ priority: sessions.priority, reasons: sessions.redFlagReasons, department: sessions.department, token: sessions.tokenNumber })
    .from(sessions)
    .where(eq(sessions.id, id))
    .orderBy(desc(sessions.startedAt))
    .limit(1);

  const notifications = await notifyHospitalSubmission({
    sessionId: id,
    tokenNumber: session?.tokenNumber ?? null,
    priority: (latestFlags[0]?.priority as "routine" | "urgent" | "emergency") ?? "routine",
    redFlagReasons: latestFlags[0]?.reasons ?? [],
    department: latestFlags[0]?.department ?? "general_medicine",
    patient: {
      fullName: patient?.fullName ?? bundle.patient.fullName,
      age: patient?.age ?? null,
      gender: patient?.gender ?? null,
      phone: patient?.phone ?? null,
      abhaId: patient?.abhaId ?? null,
    },
  });

  return Response.json({ session, event, notifications });
}