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
//  VOICE ENGINE v2 — fast + accurate, zero UI change
//
//  Speed fixes:
//   • SILENCE AUTO-STOP — the moment the patient stops speaking (~1.6s of
//     silence), recording ends and uploads ITSELF. No second tap needed.
//   • LIVE PREVIEW — the browser engine shows words on screen WHILE the
//     patient speaks; the server's accurate text replaces them at the end.
//   • SMALL AUDIO — mono 16 kbps recording = 3-4x faster upload.
//
//  Accuracy fixes:
//   • Server engine (Bhashini → Groq Whisper) is the final authority —
//     much better than browser voice for Kannada/noisy OPD.
//   • Whisper call uses temperature 0 + medical vocabulary hint
//     (in the API route).
// ══════════════════════════════════════════════════════════════════════

const MAX_RECORD_MS = 25_000; // hard cap
const SILENCE_STOP_MS = 1_600; // auto-submit after this much silence
const MIN_SPEECH_MS = 12_000; // if no speech heard by now, cancel quietly

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

/**
 * ENGINE 1 — MediaRecorder → POST /api/bhashini/asr (Bhashini → Groq Whisper)
 * with silence auto-stop, must-have-spoken gate and low-bitrate upload.
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
  let audioCtx: AudioContext | null = null;
  let silenceTimer: ReturnType<typeof setInterval> | null = null;
  let capTimer: ReturnType<typeof setTimeout> | null = null;
  let finished = false;
  let hasSpoken = false;
  let lastSpokeAt = Date.now();
  let startedAt = Date.now();

  const cleanupMics = () => {
    if (silenceTimer) clearInterval(silenceTimer);
    if (capTimer) clearTimeout(capTimer);
    stream?.getTracks().forEach((tr) => tr.stop());
    void audioCtx?.close().catch(() => undefined);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cleanupMics();
    onEnd();
  };

  const stopRecording = () => {
    if (recorder && recorder.state === "recording") {
      recorder.stop(); // → onstop → upload
    } else {
      cleanupMics();
      finish();
    }
  };

  const upload = async () => {
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      if (blob.size < 1200 || !hasSpoken) {
        finish(); // tapped by accident / never spoke — no wasted API call
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
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      // ── silence detection → auto-stop ─────────────────────────────────
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
      const srcNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      srcNode.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      silenceTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const loud = rms > 0.015;
        if (loud) {
          hasSpoken = true;
          lastSpokeAt = Date.now();
        } else if (hasSpoken && Date.now() - lastSpokeAt > SILENCE_STOP_MS) {
          stopRecording(); // patient finished speaking → submit automatically
        } else if (!hasSpoken && Date.now() - startedAt > MIN_SPEECH_MS) {
          stopped = true; // nobody spoke — cancel quietly
          stopRecording();
        }
      }, 150);

      recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 16_000, // small file → fast upload
      });
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        cleanupMics();
        void upload();
      };
      recorder.start(500); // flush chunks continuously
      capTimer = setTimeout(stopRecording, MAX_RECORD_MS);
    } catch (e) {
      console.warn("Microphone unavailable, falling back to browser ASR:", e);
      startBrowserRecognition(lang, onText, finish);
    }
  };

  void begin();

  return () => {
    stopped = true;
    stopRecording();
  };
}

/**
 * ENGINE 2 — Browser Web Speech API.
 * Used (a) as live-preview while the server engine records, and
 * (b) as the main engine when the server has no ASR keys.
 */
function startBrowserRecognition(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: (() => void) | null,
): () => void {
  const Ctor = getCtor();
  if (!Ctor) {
    onEnd?.();
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
  rec.onerror = () => onEnd?.();
  rec.onend = () => onEnd?.();
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
 * Main recognition — server engine for the accurate final text, browser
 * engine in parallel for instant on-screen preview. Same signature as
 * before → zero UI changes in the kiosk.
 */
export function startRecognition(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: () => void,
): () => void {
  let stopFn: (() => void) | null = null;
  let previewStop: (() => void) | null = null;
  let done = false;

  const choose = async () => {
    const useServer = await probeServerAsr();
    if (done) return;
    if (useServer) {
      // live preview first (its end/error is ignored — server decides)
      previewStop = startBrowserRecognition(lang, onText, null);
      stopFn = startServerRecognition(lang, onText, onEnd);
    } else {
      stopFn = startBrowserRecognition(lang, onText, onEnd);
    }
  };
  void choose();

  return () => {
    done = true;
    previewStop?.();
    stopFn?.();
  };
}