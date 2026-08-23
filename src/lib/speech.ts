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
  return Boolean(getCtor());
}

export function startRecognition(
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
