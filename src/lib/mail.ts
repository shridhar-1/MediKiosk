// ── Reusable SMTP mailer ─────────────────────────────────────────────────
// Single wrapper around nodemailer used for BOTH staff/OTP mail and patient
// receipts. Everything reads SMTP_* env (same vars as the existing OTP +
// hospital-alert mail), so only one place configures the transporter.
// Never throws on an empty address — returns { sent: false } and lets the
// caller decide. Real sending happens only when SMTP_HOST is configured.

export type MailResult = { sent: boolean; to?: string; error?: string; mode: "sent" | "mock" | "failed" };

type MailOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
};

async function transporter() {
  // Lazily imported so the dependency stays optional for builds without SMTP.
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/** Send one email. Returns a result object — never throws. */
export async function sendMail({ to, subject, text, html, fromName }: MailOpts): Promise<MailResult> {
  const addr = (to ?? "").trim();
  if (!addr) return { sent: false, mode: "mock", error: "no recipient address" };
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return { sent: false, mode: "mock", error: "SMTP_HOST / SMTP_USER not set — email logged instead" };
  }
  try {
    const t = await transporter();
    await t.sendMail({
      from: `"${fromName ?? "MediKiosk"}" <${process.env.SMTP_USER}>`,
      to: addr,
      subject,
      text,
      html,
    });
    return { sent: true, to: addr, mode: "sent" };
  } catch (e) {
    console.error("sendMail failed:", (e as Error).message);
    return { sent: false, to: addr, mode: "failed", error: (e as Error).message };
  }
}

/**
 * Patient token / live-status receipt — delivered when a session is
 * submitted (in-hospital token OR a home-booking slot). HTML + plain text,
 * brand-styled to match the rest of MediKiosk.
 */
export async function sendPatientTokenEmail(opts: {
  to: string;
  fullName: string;
  token: string | null | undefined;
  departmentLabel: string;
  mode: "allopathic" | "ayush" | string;
  trackUrl: string;
  arrivalLine: string; // e.g. "Be at the hospital by 10:45 am" or your slot
  scheduled?: boolean;
}): Promise<MailResult> {
  const token = opts.token ?? "OPD";
  const dept = opts.departmentLabel ?? "OPD";
  const system = opts.mode === "ayush" ? "AYUSH" : "Allopathy";
  const track = opts.trackUrl || "";

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f6f0e4;padding:24px;">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3d9c7;">
        <div style="background:#08363a;padding:18px 22px;color:#f6f0e4;">
          <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#e8d5a3;">MediKiosk · OPD</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:bold;">${opts.fullName}${opts.scheduled ? " — appointment confirmed" : " — your token is ready"}</p>
        </div>
        <div style="padding:22px;">
          <p style="font-size:13px;color:#4a4338;">${system} · ${dept}</p>
          <div style="text-align:center;margin:18px 0;padding:18px;border:2px dashed #c9842a;border-radius:12px;">
            <p style="margin:0;font-size:12px;letter-spacing:2px;color:#4a4338;text-transform:uppercase;">Token</p>
            <p style="margin:4px 0 0;font-size:44px;font-weight:900;color:#08363a;letter-spacing:1px;">${token}</p>
          </div>
          <p style="font-size:14px;color:#08363a;"><b>${opts.arrivalLine}</b></p>
          ${track ? `<p style="margin:14px 0 0;font-size:14px;">Track your live queue position here:<br/>
            <a href="${track}" style="display:inline-block;margin-top:8px;background:#0f5c61;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold;">View live queue →</a></p>` : ""}
        </div>
        <div style="padding:14px 22px;background:#f6f0e4;font-size:11px;color:#4a4338;">
          This is an automated OPD message from District Hospital. Please do not reply.
        </div>
      </div>
    </div>`;

  return sendMail({
    to: opts.to,
    subject: `MediKiosk: Your ${opts.scheduled ? "appointment" : "token"} ${token} · ${dept}`,
    text: [
      `MediKiosk · ${dept}`,
      `${opts.fullName},`,
      opts.scheduled ? `Your appointment is confirmed. Token ${token}.` : `Your token is ${token}.`,
      opts.arrivalLine,
      track ? `Live queue: ${track}` : "",
      "— District Hospital",
    ]
      .filter(Boolean)
      .join("\n"),
    html,
    fromName: "MediKiosk — District Hospital",
  });
}