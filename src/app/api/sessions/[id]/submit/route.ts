import { db } from "@/db";
import { hisEvents, patients, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { loadSessionBundle } from "@/lib/session-data";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = await loadSessionBundle(id);
  if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });

  await db
    .update(sessions)
    .set({
      status: "submitted",
      submittedAt: new Date(),
    })
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
  return Response.json({ session, event });
}
