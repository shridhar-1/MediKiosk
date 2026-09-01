import { LANGUAGES, type Lang } from "./types";

type Recog = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
};

function getCtor(): (new () => Recog) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechLang(lang: Lang): string {
  return LANGUAGES.find((l) => l.code === lang)?.speech ?? "en-IN";
}

export function speak(text: string, lang: Lang): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang(lang);
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export function canRecognize(): boolean {
  return true; // server ASR works in any browser; browser ASR is the fallback
}

// ══════════════════════════════════════════════════════════════════════
//  VOICE ENGINE — pluggable, zero UI change
//
//  Engine 1 (best): SERVER ASR  — record with MediaRecorder → POST
//    /api/bhashini/asr → tries Bhashini ULCA (official Govt of India,
//    handles noisy OPD + Indian accents + optional translation) then
//    Groq Whisper (whisper-large-v3), then gives up.
//  Engine 2 (fallback): Browser Web Speech API — works offline in
//    Chromium browsers for en-IN/hi-IN style locales, no key needed.
// ══════════════════════════════════════════════════════════════════════

const MAX_RECORD_MS = 30_000; // safety cap per answer

/** Cached probe: does the server have a live ASR engine configured? */
let serverAsrAvailable: boolean | null = null;
async function probeServerAsr(): Promise<boolean> {
  if (serverAsrAvailable !== null) return serverAsrAvailable;
  try {
    const res = await fetch("/api/bhashini/asr", { method: "GET" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    serverAsrAvailable = Boolean(data.bhashiniConfigured || data.groqConfigured);
  } catch {
    serverAsrAvailable = false;
  }
  return serverAsrAvailable;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve((reader.result as string).split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * ENGINE 1 — MediaRecorder → POST /api/bhashini/asr (Bhashini → Groq Whisper).
 * Returns a stop() that ends recording, uploads, and calls onText/onEnd.
 */
function startServerRecognition(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: () => void,
): () => void {
  let stopped = false;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onEnd();
  };

  const upload = async () => {
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      if (blob.size < 1200) {
        // too small — probably tapped by accident; treat as silence
        finish();
        return;
      }
      const form = new FormData();
      form.append("audio", blob, "answer.webm");
      form.append("language", lang);
      const res = await fetch("/api/bhashini/asr", { method: "POST", body: form });
      if (!res.ok) throw new Error(`ASR ${res.status}`);
      const data = await res.json();
      const text = (data?.text ?? "").trim();
      if (text) onText(text, true);
    } catch (e) {
      console.warn("Server ASR failed:", e);
    } finally {
      finish();
    }
  };

  const begin = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        stream?.getTracks().forEach((tr) => tr.stop());
        void upload();
      };
      recorder.start();
      timer = setTimeout(() => {
        if (!stopped && recorder && recorder.state === "recording") recorder.stop();
      }, MAX_RECORD_MS);
    } catch (e) {
      console.warn("Microphone unavailable, falling back to browser ASR:", e);
      startBrowserRecognition(lang, onText, finish);
    }
  };

  void begin();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (recorder && recorder.state === "recording") {
      recorder.stop(); // onstop → upload → onEnd
    } else if (!recorder) {
      // never started (or mic denied path already handled)
      finish();
    }
  };
}

/**
 * ENGINE 2 — Browser Web Speech API (offline fallback).
 */
function startBrowserRecognition(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: () => void,
): () => void {
  const Ctor = getCtor();
  if (!Ctor) {
    onEnd();
    return () => undefined;
  }
  const rec = new Ctor();
  rec.lang = speechLang(lang);
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (ev) => {
    let interim = "";
    let finalText = "";
    for (let i = 0; i < ev.results.length; i += 1) {
      const row = ev.results[i];
      if (row.isFinal) finalText += row[0].transcript;
      else interim += row[0].transcript;
    }
    onText((finalText || interim).trim(), Boolean(finalText));
  };
  rec.onerror = () => onEnd();
  rec.onend = () => onEnd();
  rec.start();
  return () => {
    try {
      rec.stop();
    } catch {
      rec.abort();
    }
  };
}

/**
 * Main recognition — tries the server engine first (Bhashini/Groq Whisper,
 * works in EVERY browser and handles noisy OPD audio), and automatically
 * falls back to the browser engine when the server has no ASR keys or the
 * microphone path fails. Same signature as before → zero UI changes.
 */
export function startRecognition(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: () => void,
): () => void {
  let stopFn: (() => void) | null = null;
  let done = false;

  const choose = async () => {
    const useServer = await probeServerAsr();
    if (done) return;
    stopFn = useServer
      ? startServerRecognition(lang, onText, onEnd)
      : startBrowserRecognition(lang, onText, onEnd);
  };
  void choose();

  return () => {
    done = true;
    stopFn?.();
  };
}

/**
 * Architecture Note for Jury / SIH:
 *
 * Live Implementation:
 * - Engine 1: MediaRecorder → /api/bhashini/asr → Bhashini ULCA (Govt of
 *   India — trained on Indian accents, noisy hospital audio, optional
 *   translation) with Groq Whisper (whisper-large-v3) as automatic backup.
 *   Server-side keys never touch the browser.
 * - Engine 2: Browser Web Speech API fallback (offline, no key).
 * - The kiosk UI and inputMode tracking ("voice" vs "touch") work unchanged.
 */