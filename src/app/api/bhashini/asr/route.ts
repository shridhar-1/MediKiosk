import { bhashiniAsr, isBhashiniConfigured } from "@/lib/bhashini";
import { NextRequest } from "next/server";

/**
 * POST /api/bhashini/asr — Speech → Text (merged engine)
 * Accepts BOTH:
 *   1. form-data: audio=<blob>, language=hi|kn|ta…, translateTo=<optional>
 *   2. JSON: { audioBase64, source?, target? }
 *
 * Engine order: Bhashini ULCA (official, translates) → Groq Whisper (existing
 * GROQ_API_KEY, 7 langs) → mock fallback (browser Web Speech API).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  let buffer: Buffer | null = null;
  let language = "hi";
  let translateTo: string | undefined;

  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        audioBase64?: string;
        source?: string;
        target?: string;
      };
      if (!body.audioBase64) {
        return Response.json({ error: "audioBase64 required" }, { status: 400 });
      }
      buffer = Buffer.from(body.audioBase64, "base64");
      language = body.source ?? "hi";
      translateTo = body.target;
    } else {
      const form = await req.formData();
      const audio = form.get("audio") as Blob | null;
      language = ((form.get("language") as string) || "hi").slice(0, 5);
      translateTo = (form.get("translateTo") as string) || undefined;
      if (!audio) return Response.json({ error: "No audio" }, { status: 400 });
      buffer = Buffer.from(await audio.arrayBuffer());
    }

    // ── ENGINE 1: Bhashini ULCA (official, supports translation) ──────────
    if (isBhashiniConfigured() && buffer.length) {
      try {
        const text = await bhashiniAsr(
          buffer.toString("base64"),
          language,
          translateTo,
        );
        if (text) {
          return Response.json({
            text,
            confidence: 0.95,
            mode: "LIVE_BHASHINI",
            language,
            translatedTo: translateTo ?? null,
            note: "Official Bhashini ULCA (Govt of India)",
          });
        }
      } catch (e: any) {
        console.warn("Bhashini ASR failed, falling back to Groq:", e?.message);
      }
    }

    // ── ENGINE 2: Groq Whisper (works with the existing GROQ_API_KEY) ─────
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && buffer.length) {
      try {
        const groqForm = new FormData();
        groqForm.append(
          "file",
          new Blob([new Uint8Array(buffer)], { type: "audio/webm" }),
          "audio.webm",
        );
        groqForm.append("model", "whisper-large-v3");
        groqForm.append("language", language);
        groqForm.append("response_format", "json");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: groqForm,
        });
        const data = await res.json();
        if (data.text) {
          return Response.json({
            text: data.text,
            confidence: 0.9,
            mode: "LIVE_GROQ_WHISPER",
            language,
            note: "Groq Whisper — 7 Indian langs, no Bhashini key needed",
          });
        }
      } catch (e: any) {
        console.warn("Groq Whisper failed, falling back to WebSpeech:", e?.message);
      }
    }

    // ── ENGINE 3: Mock fallback → browser Web Speech API ──────────────────
    return Response.json({
      text: "",
      confidence: 0,
      mode: "MOCK_WEB_SPEECH",
      error:
        "No live ASR available. Add BHASHINI_USER_ID + BHASHINI_ULCA_API_KEY (official, translates) or GROQ_API_KEY (Whisper).",
      fallback: "webspeech",
    });
  } catch (error: any) {
    console.error("POST /api/bhashini/asr error:", error);
    return Response.json({ error: error?.message || "ASR failed" }, { status: 500 });
  }
}

// GET — quick status check (nice for demos)
export async function GET() {
  const hasBhashini = isBhashiniConfigured();
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  return Response.json({
    bhashiniConfigured: hasBhashini,
    groqConfigured: hasGroq,
    mode: hasBhashini
      ? "LIVE Bhashini ULCA (official — speech + translation)"
      : hasGroq
        ? "LIVE Groq Whisper (7 langs, no Bhashini key needed)"
        : "MOCK — Web Speech API only",
    supportedLangs: ["en", "hi", "bn", "ta", "te", "mr", "kn", "+ more via Bhashini"],
  });
}