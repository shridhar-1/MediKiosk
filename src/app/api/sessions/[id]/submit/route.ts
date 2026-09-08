import { db } from "@/db";
import { hisEvents, patients, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { notifyHospitalSubmission } from "@/lib/notify";
import { enqueuePatientSms } from "@/lib/sms-outbox";
import { aheadCount, arriveByTime, formatClockTime, scheduleSlot } from "@/lib/queue";
import { loadSessionBundle } from "@/lib/session-data";
import { sendPatientTokenEmail, type MailResult } from "@/lib/mail";
import { DEPARTMENTS } from "@/lib/types";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Public base URL used to build the patient's live-queue tracking link.
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://medi-kiosk-tau.vercel.app";

const deptLabel = (id: string) =>
  DEPARTMENTS.find((d) => d.id === id)?.label ?? id.replace(/_/g, " ");

// Send the patient's token / appointment by EMAIL (in addition to SMS which
// is enqueued separately). Best-effort — never blocks the submission.
async function emailPatientReceipt(opts: {
  email?: string | null;
  fullName: string;
  token?: string | null;
  department: string;
  mode: string;
  arrivalLine: string;
  scheduled?: boolean;
}): Promise<MailResult | null> {
  if (!opts.email?.trim()) return null;
  return sendPatientTokenEmail({
    to: opts.email,
    fullName: opts.fullName,
    token: opts.token,
    departmentLabel: deptLabel(opts.department),
    mode: opts.mode,
    arrivalLine: opts.arrivalLine,
    scheduled: opts.scheduled,
    trackUrl: PUBLIC_BASE,
  });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = await loadSessionBundle(id);
  if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });

  const isHome = bundle.session.location === "home" && bundle.session.priority !== "emergency";

  await db
    .update(sessions)
    .set({ status: isHome ? "scheduled" : "submitted", submittedAt: new Date() })
    .where(eq(sessions.id, id));

  const [patient] = await db.select().from(patients).where(eq(patients.id, bundle.session.patientId));
  const patientEmail = (patient?.email ?? bundle.patient.email) || null;

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
          identifier: patient?.abhaId ? [{ system: "https://healthid.ndhm.gov.in", value: patient.abhaId }] : [],
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

  const allSessions = await db.select().from(sessions);
  const ahead = aheadCount(allSessions, id);

  if (isHome) {
    // ── HOME BOOKING: scheduled appointment ─────────────────────────────
    const SCHEDULE_GRACE_MINUTES = 30;
    const slot = scheduleSlot(ahead);
    const slotLabel = formatClockTime(slot);
    await db
      .update(sessions)
      .set({ scheduledAt: slot, expiresAt: new Date(slot.getTime() + SCHEDULE_GRACE_MINUTES * 60_000) })
      .where(eq(sessions.id, id));
    await enqueuePatientSms(
      patient?.phone,
      `MediKiosk: Appointment confirmed. Token ${session?.tokenNumber ?? "-"} - your slot is ${slotLabel}. Please arrive 10 minutes early. - District Hospital`,
      "token",
    );
    const emailResult = await emailPatientReceipt({
      email: patientEmail,
      fullName: bundle.patient.fullName,
      token: session?.tokenNumber,
      department: session?.department ?? "general_medicine",
      mode: session?.mode ?? "allopathic",
      scheduled: true,
      arrivalLine: `Your appointment is for ${slotLabel}. Please arrive 10 minutes early.`,
    });
    return Response.json({ session, event, notifications, scheduled: true, scheduledAt: slot, patientDelivery: { email: emailResult } });
  }

  // ── IN HOSPITAL: live queue position + arrive-by time ─────────────────
  const arriveBy = formatClockTime(arriveByTime(ahead));
  const TOKEN_GRACE_MINUTES = 10;
  const priority = (latestFlags[0]?.priority as string) ?? "routine";
  const expiresAt = priority === "emergency" ? null : new Date(arriveByTime(ahead).getTime() + TOKEN_GRACE_MINUTES * 60_000);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  const validUntil = formatClockTime(new Date(arriveByTime(ahead).getTime() + TOKEN_GRACE_MINUTES * 60_000));
  await enqueuePatientSms(
    patient?.phone,
    ahead === 0
      ? `MediKiosk: Your token is ${session?.tokenNumber ?? "-"}. It is your turn - go to the OPD now (valid until ${validUntil}). - District Hospital`
      : `MediKiosk: Your token is ${session?.tokenNumber ?? "-"}. ${ahead} ahead of you - be at the hospital by ${arriveBy} (token valid until ${validUntil}). - District Hospital`,
    "token",
  );
  const emailResult = await emailPatientReceipt({
    email: patientEmail,
    fullName: bundle.patient.fullName,
    token: session?.tokenNumber,
    department: session?.department ?? "general_medicine",
    mode: session?.mode ?? "allopathic",
    scheduled: false,
    arrivalLine:
      ahead === 0
        ? `It is your turn now — please go to the OPD (valid until ${validUntil}).`
        : `${ahead} ${ahead === 1 ? "patient" : "patients"} ahead of you — be at the hospital by ${arriveBy} (valid until ${validUntil}).`,
  });

  return Response.json({ session, event, notifications, patientDelivery: { email: emailResult } });
}