// ── textbee.dev SMS sender (open-source Android SMS gateway) ───────────────
// If TEXTBEE_API_KEY is set (Vercel env), queued patient SMS are sent
// immediately through textbee's REST API — the hospital's Android phone
// running the textbee app does the actual sending via its SIM.
// Docs: https://github.com/textbee/textbee  •  Free tier: 300 msgs/month.

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY ?? "";
const TEXTBEE_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

export function isTextbeeConfigured(): boolean {
  return Boolean(TEXTBEE_API_KEY);
}

/**
 * Try to send one SMS via textbee. Returns true when accepted.
 * Never throws — failures just return false so the message stays queued.
 */
export async function sendViaTextbee(phone10: string, message: string): Promise<boolean> {
  try {
    if (!TEXTBEE_API_KEY) return false;
    const digits = phone10.replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) return false;

    const res = await fetch(TEXTBEE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": TEXTBEE_API_KEY,
      },
      body: JSON.stringify({
        recipients: [`+91${digits}`], // India country code
        message,
      }),
    });
    if (!res.ok) {
      console.error(`textbee send failed (${res.status}):`, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("sendViaTextbee error (ignored):", error);
    return false;
  }
}