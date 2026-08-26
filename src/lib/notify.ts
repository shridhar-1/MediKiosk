/**
 * ============================================================================
 * MediKiosk — Hospital Notification Dispatcher
 * ============================================================================
 * Automated alerting the moment a patient submits their intake form.
 *
 * Flow:  POST /api/sessions/:id/submit  →  notifyHospitalSubmission(...)
 *            ├─ ① console  : audit row in his_events (eventType:
 *            │              "hospital_alert_sent") → powers the live alert
 *            │              bell on the physician console (/api/notifications)
 *            ├─ ② email    : nodemailer → HOSPITAL_ALERT_EMAIL (SMTP_* env)
 *            ├─ ③ whatsapp : Twilio → HOSPITAL_ALERT_WHATSAPP (TWILIO_* env)
 *            └─ ④ sms      : Twilio → HOSPITAL_ALERT_PHONE    (fallback)
 *
 * Design rules:
 *  - NEVER throws: a notification failure can never block a submission.
 *  - Every channel reports sent | mock | skipped | failed (mock = env not
 *    configured, so the app remains fully demoable offline).
 *  - Emergency submissions page the triage desk with reasons attached.
 * ============================================================================
 */
import { db } from "@/db";
import { hisEvents } from "@/db/schema";
import { nid } from "@/lib/ids";

export type NotifyChannel = "console" | "email" | "whatsapp" | "sms";

export type ChannelResult = {
  channel: NotifyChannel;
  status: "sent" | "mock" | "skipped" | "failed";
  detail?: string;
};

export type NotifyInput = {
  sessionId: string;
  tokenNumber?: string | null;
  priority: "routine" | "urgent" | "emergency";
  redFlagReasons?: string[] | null;
  department: string;
  patient: {
    fullName: string;
    age?: number | null;
    gender?: string | null;
    phone?: string | null;
    abhaId?: string | null;
  };
  hospital?: string | null;
};

const ESCALATION_EMOJI = { emergency: "🚨", urgent: "⚠️", routine: "🩺" } as const;

function buildMessage(input: NotifyInput): string {
  const head = `${ESCALATION_EMOJI[input.priority]} MediKiosk ${input.priority.toUpperCase()} — new intake submitted`;
  const who = `${input.patient.fullName} (${input.patient.age ?? "?"}/${input.patient.gender?.[0]?.toUpperCase() ?? "?"})`;
  const token = input.tokenNumber ? `Token ${input.tokenNumber}` : "no token yet";
  const reasons = input.redFlagReasons?.length
    ? `\n⚑ Red flags:\n${input.redFlagReasons.map((r) => `   • ${r}`).join("\n")}`
    : "";
  return [
    head,
    `${who} · ${token} · ${input.department.replace(/_/g, " ")}`,
    reasons,
    `\nStructured history is ready on the consultation console.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSubject(input: NotifyInput): string {
  const prefix =
    input.priority === "emergency" ? "[EMERGENCY]" : input.priority === "urgent" ? "[URGENT]" : "[New intake]";
  return `${prefix} ${input.patient.fullName} — ${input.tokenNumber ?? "token pending"} submitted at MediKiosk`;
}

/** ① Console channel — persist an alert event the physician console can poll. */
async function sendConsole(input: NotifyInput, results: ChannelResult[]): Promise<ChannelResult> {
  try {
    await db.insert(hisEvents).values({
      id: nid(),
      sessionId: input.sessionId,
      eventType: "hospital_alert_sent",
      payload: {
        alert: true,
        priority: input.priority,
        tokenNumber: input.tokenNumber,
        redFlagReasons: input.redFlagReasons ?? [],
        patient: input.patient,
        department: input.department,
        message: buildMessage(input),
        channels: results.map(({ channel, status }) => ({ channel, status })),
        notifiedAt: new Date().toISOString(),
      },
    });
    return { channel: "console", status: "sent", detail: "alert event persisted for console feed" };
  } catch (e) {
    return { channel: "console", status: "failed", detail: (e as Error).message };
  }
}

/** ② Email channel — nodemailer (same SMTP_* env as the OTP mailer). */
async function sendEmail(input: NotifyInput): Promise<ChannelResult> {
  const to = process.env.HOSPITAL_ALERT_EMAIL;
  if (!to) return { channel: "email", status: "mock", detail: "HOSPITAL_ALERT_EMAIL not set — logged instead" };
  if (!process.env.SMTP_HOST) return { channel: "email", status: "mock", detail: "SMTP_HOST not set — logged instead" };
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const urgent = input.priority === "emergency";
    await transporter.sendMail({
      from: `"MediKiosk Alerts" <${process.env.SMTP_USER}>`,
      to,
      subject: buildSubject(input),
      text: buildMessage(input),
      html: `
        <div style="font-family:sans-serif;padding:20px;color:#1b1712;${urgent ? "border-left:6px solid #b3261e;" : "border-left:6px solid #0f5c61;"}">
          <p style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#c9842a;">MediKiosk — Hospital Notification</p>
          <h2 style="color:${urgent ? "#b3261e" : "#08363a"};">${ESCALATION_EMOJI[input.priority]} ${input.priority.toUpperCase()} intake submitted</h2>
          <p><b>${input.patient.fullName}</b> · ${input.patient.age ?? "?"}/${input.patient.gender ?? "?"} · Token <b>${input.tokenNumber ?? "pending"}</b> · ${input.department.replace(/_/g, " ")}</p>
          ${input.redFlagReasons?.length ? `<p style="color:#b3261e;"><b>⚑ Red flags:</b><br>${input.redFlagReasons.map((r) => `• ${r}`).join("<br>")}</p>` : ""}
          <p style="font-size:13px;color:#4a4338;">The structured history is ready on the consultation console.</p>
        </div>`,
    });
    return { channel: "email", status: "sent", detail: `emailed ${to}` };
  } catch (e) {
    return { channel: "email", status: "failed", detail: (e as Error).message };
  }
}

/** ③④ WhatsApp + SMS — Twilio, lazily imported so the dep stays optional. */
async function sendTwilio(
  input: NotifyInput,
  channel: "whatsapp" | "sms",
): Promise<ChannelResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const to =
    channel === "whatsapp"
      ? process.env.HOSPITAL_ALERT_WHATSAPP
      : process.env.HOSPITAL_ALERT_PHONE;
  if (!sid || !token || !to) {
    return {
      channel,
      status: "mock",
      detail: `${channel === "whatsapp" ? "HOSPITAL_ALERT_WHATSAPP" : "HOSPITAL_ALERT_PHONE"} / TWILIO_* not set — logged instead`,
    };
  }
  try {
    const twilioModule = (await import("twilio")) as unknown as { default: new (sid: string, token: string) => { messages: { create: (m: Record<string, string>) => Promise<unknown> } } };
    const client = new twilioModule.default(sid, token);
    const from =
      channel === "whatsapp"
        ? `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`
        : (process.env.TWILIO_SMS_FROM ?? undefined);
    if (!from) return { channel, status: "skipped", detail: `TWILIO_${channel === "whatsapp" ? "WHATSAPP" : "SMS"}_FROM not set` };

    await client.messages.create({
      from,
      to: channel === "whatsapp" ? `whatsapp:${to}` : to,
      body: buildMessage(input),
    });
    return { channel, status: "sent", detail: `${channel} sent to ${to}` };
  } catch (e) {
    return { channel, status: "failed", detail: (e as Error).message };
  }
}

/**
 * Fire every channel for a submission. Never throws — returns per-channel
 * results so the submit API response (and the his_events audit row) records
 * exactly what the hospital was told, and how.
 */
export async function notifyHospitalSubmission(input: NotifyInput): Promise<ChannelResult[]> {
  // ②③④ outbound channels first (each independently guarded) …
  const outbound: ChannelResult[] = await Promise.all([
    sendEmail(input).catch((e): ChannelResult => ({ channel: "email", status: "failed", detail: String(e) })),
    sendTwilio(input, "whatsapp").catch((e): ChannelResult => ({ channel: "whatsapp", status: "failed", detail: String(e) })),
    sendTwilio(input, "sms").catch((e): ChannelResult => ({ channel: "sms", status: "failed", detail: String(e) })),
  ]);

  // ① … then the console/audit event, so it records what actually happened
  const consoleResult = await sendConsole(input, outbound);

  const results = [consoleResult, ...outbound];
  console.log(
    `[notify] hospital notified for session ${input.sessionId} (${input.priority}):`,
    results.map((r) => `${r.channel}=${r.status}`).join(" "),
  );
  return results;
}