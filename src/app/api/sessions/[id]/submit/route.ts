import { db } from "@/db";
import { hisEvents, patients, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { notifyHospitalSubmission } from "@/lib/notify";
import { enqueuePatientSms } from "@/lib/sms-outbox";
import { aheadCount, arriveByTime, formatClockTime, scheduleSlot } from "@/lib/queue";
import { loadSessionBundle } from "@/lib/session-data";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = await loadSessionBundle(id);
  if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });

  // ── WHERE IS THE PATIENT? ─────────────────────────────────────────────
  // "home"  → pre-registration: status "scheduled", gets an appointment slot
  //           (NOT in the live queue — the doctor is not calling them yet).
  // "hospital" → live queue: status "submitted", Call-next + board as usual.
  // EMERGENCY overrides home: a red-flagged patient is always pushed into
  // the live queue with "reach the hospital now".
  const isHome = bundle.session.location === "home" && bundle.session.priority !== "emergency";

  await db
    .update(sessions)
    .set({
      status: isHome ? "scheduled" : "submitted",
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

  // ── PATIENT TOKEN SMS (via hospital's Android SMS-gateway phone) ────────
  // Queued in sms_outbox; the gateway phone polls /api/sms/outbox and sends
  // it from the hospital SIM's free daily SMS pack. Never throws.
  const allSessions = await db.select().from(sessions);
  const ahead = aheadCount(allSessions, id);

  if (isHome) {
    // ── HOME BOOKING: scheduled appointment, not the live queue ──────────
    // Slot = after everyone currently waiting (15-min minimum). The booking
    // expires 30 minutes after the slot if the patient never arrives.
    const SCHEDULE_GRACE_MINUTES = 30;
    const slot = scheduleSlot(ahead);
    const slotLabel = formatClockTime(slot);
    await db
      .update(sessions)
      .set({
        scheduledAt: slot,
        expiresAt: new Date(slot.getTime() + SCHEDULE_GRACE_MINUTES * 60_000),
      })
      .where(eq(sessions.id, id));
    await enqueuePatientSms(
      patient?.phone,
      `MediKiosk: Appointment confirmed. Token ${session?.tokenNumber ?? "-"} - your slot is ${slotLabel}. Please arrive 10 minutes early. - District Hospital`,
      "token",
    );
    return Response.json({ session, event, notifications, scheduled: true, scheduledAt: slot });
  }

  // ── IN HOSPITAL: live queue position + arrive-by time ──────────────────
  const arriveBy = formatClockTime(arriveByTime(ahead));
  // ── TOKEN EXPIRY ──────────────────────────────────────────────────────
  // Emergency tokens never expire. Others expire 10 minutes after the
  // arrive-by time if the patient never shows (no-show → queue slot freed).
  const TOKEN_GRACE_MINUTES = 10;
  const priority = (latestFlags[0]?.priority as string) ?? "routine";
  const expiresAt =
    priority === "emergency"
      ? null
      : new Date(arriveByTime(ahead).getTime() + TOKEN_GRACE_MINUTES * 60_000);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  const validUntil = formatClockTime(
    new Date(arriveByTime(ahead).getTime() + TOKEN_GRACE_MINUTES * 60_000),
  );
  await enqueuePatientSms(
    patient?.phone,
    ahead === 0
      ? `MediKiosk: Your token is ${session?.tokenNumber ?? "-"}. It is your turn - go to the OPD now (valid until ${validUntil}). - District Hospital`
      : `MediKiosk: Your token is ${session?.tokenNumber ?? "-"}. ${ahead} ahead of you - be at the hospital by ${arriveBy} (token valid until ${validUntil}). - District Hospital`,
    "token",
  );

  return Response.json({ session, event, notifications });
}