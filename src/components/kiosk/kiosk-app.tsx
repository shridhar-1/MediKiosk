"use client";

import { BrandMark } from "@/components/brand";
import { consentItems, sectionTitles, t } from "@/lib/i18n";
import {
  formatAnswer,
  matchSpokenToOptions,
  nextQuestionId,
  previousQuestionId,
  questionById,
  questionProgress,
  YES_NO_OPTIONS,
} from "@/lib/interview";
import { SAMPLE_DOCUMENTS } from "@/lib/ocr";

// Real demo papers (images in /public/demo) that evaluators can view and run
// through the exact same pipeline as a patient photograph: Tesseract OCR →
// confidence check → vision AI for handwriting.
const DEMO_DOCS = [
  {
    file: "/demo/demo-rx-printed.jpg",
    name: "demo-rx-printed.jpg",
    label: "Printed prescription",
    hint: "clean OCR → structured record",
  },
  {
    file: "/demo/demo-rx-handwritten.jpg",
    name: "demo-rx-handwritten.jpg",
    label: "Handwritten prescription",
    hint: "weak OCR → vision AI verifies",
  },
  {
    file: "/demo/demo-lab-report.jpg",
    name: "demo-lab-report.jpg",
    label: "Lab report",
    hint: "abnormal values → flags",
  },
  {
    file: "/demo/demo-rx-bengali.jpg",
    name: "demo-rx-bengali.jpg",
    label: "Bengali handwriting",
    hint: "9 medicines, read by vision AI",
  },
];
import { performOCR, isValidDocumentFile, fileToDownscaledBase64 } from "@/lib/document-ocr";
import { canRecognize, speak, startRecognition, stopSpeaking } from "@/lib/speech";
import { classifyUtterance } from "@/lib/utterance-guard";
import type { ExtractedIntake } from "@/lib/chat-extract";
import { arriveByTime, formatClockTime, scheduleSlot } from "@/lib/queue";
import { roomFor } from "@/lib/facility";
import { parseAadhaarText, parseAbhaCardText } from "@/lib/aadhaar-scan";
import { DEPARTMENTS, LANGUAGES, type CareMode, type InputMode, type KioskStep, type Lang } from "@/lib/types";
import type { AyushAssessment, ExtractedDocument } from "@/db/schema";
import {
  Activity,
  ArrowLeft,
  Bandage,
  BatteryLow,
  Beaker,
  Bone,
  Brain,
  Check,
  CircleDot,
  Clock,
  Droplets,
  FileText,
  Flower2,
  Gauge,
  HeartPulse,
  Languages,
  Mic,
  MoreHorizontal,
  ScanLine,
  ShieldAlert,
  Thermometer,
  Volume2,
  Wind,
  X,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Ans = { values: string[]; text: string; inputMode: InputMode };
type Summary = {
    aiUsed?: boolean;
  engine?: string | null;
  chiefComplaint: string;
  hpi: string;
  pastMedical: string;
  pastSurgical: string;
  drugs: string;
  allergies: string;
  familyHistory: string;
  personalHistory: string;
  reviewOfSystems: string;
  ayushAssessment: AyushAssessment | null;
  investigationsSummary: string;
  medicationsExtracted: string;
};
type DocRow = {
  id: string;
  fileName: string;
  docType: string;
  documentDate: string | null;
  facilityName: string | null;
  extractedJson: (import("@/db/schema").ExtractedDocument & { structuredBy?: string }) | null;
};

const ICONS: Record<string, typeof HeartPulse> = {
  thermometer: Thermometer,
  wind: Wind,
  heart: HeartPulse,
  lungs: Wind,
  brain: Brain,
  circle: CircleDot,
  droplets: Droplets,
  battery: BatteryLow,
  bone: Bone,
  scan: ScanLine,
  beaker: Beaker,
  activity: Activity,
  gauge: Gauge,
  band: Bandage,
  flower: Flower2,
  more: MoreHorizontal,
};

export type KioskAccount = {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  phone: string | null;
  email?: string | null;
  abhaId: string | null;
  aadhaarLast4: string | null;
  preferredLanguage: string;
};

export function KioskApp({ account }: { account?: KioskAccount | null }) {
  const router = useRouter();
  const [step, setStep] = useState<KioskStep>("language");
  const [lang, setLang] = useState<Lang>(
    (LANGUAGES.find((l) => l.code === account?.preferredLanguage)?.code ?? "en") as Lang,
  );
  const [identifyTab, setIdentifyTab] = useState<"abha" | "aadhaar" | "new">("abha");
  const [useAccount, setUseAccount] = useState(Boolean(account));
  const [form, setForm] = useState({
    abhaId: account?.abhaId ?? "",
    aadhaarLast4: account?.aadhaarLast4 ?? "",
    fullName: account?.fullName ?? "",
    age: account ? String(account.age) : "",
    gender: account?.gender ?? "male",
    phone: account?.phone ?? "",
    email: account?.email ?? "",
  });

  // State for previous submissions
  const [pastSubmissions, setPastSubmissions] = useState<any[]>([]);
  const [selectedPastSession, setSelectedPastSession] = useState<any | null>(null);

  const [granted, setGranted] = useState<Record<string, boolean>>({
    data_capture: true,
    document_scan: true,
    his_push: true,
    abha_share: true,
  });
  const [audioExplained, setAudioExplained] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<CareMode>("allopathic");
  const [department, setDepartment] = useState("general_medicine");
  // Where the patient is right now — asked on the department step.
  // hospital → live queue (doctor calls); home → scheduled time slot.
  const [location, setLocation] = useState<"hospital" | "home">("hospital");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");
  const [qid, setQid] = useState("chief_complaint");
  const [answers, setAnswers] = useState<Record<string, Ans>>({});
  const [draftText, setDraftText] = useState("");
  const [draftValues, setDraftValues] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [dupNotice, setDupNotice] = useState("");
  const [paste, setPaste] = useState("");
  const [docType, setDocType] = useState("lab");
  const [uploading, setUploading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flags, setFlags] = useState<{ triggered: boolean; priority: string; reasons: string[] } | null>(null);
  // True while the patient is confirming "this is NOT an emergency" on the
  // lock screen (false-alarm escape hatch, two-tap confirm).
    const [cancellingEmergency, setCancellingEmergency] = useState(false);
  // ── Fast-chat intake (⚡ optional mode beside the guided interview) ─────
  const [chatMode, setChatMode] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ who: "you" | "ai"; text: string }[]>([]);
  const [chatDraft, setChatDraft] = useState<{ extracted: ExtractedIntake; engine: string; aiUsed: boolean } | null>(null);
  const [chatDone, setChatDone] = useState<{ extracted: ExtractedIntake; engine: string; aiUsed: boolean } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const question = questionById(qid);
  const progress = useMemo(() => questionProgress(qid, answers, mode), [qid, answers, mode]);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopSpeaking();
    };
  }, []);

  // Fetch previous submissions on identify step
  useEffect(() => {
    if (step !== "identify") return;
    const phone = form.phone || account?.phone;
    const abhaId = form.abhaId || account?.abhaId;

    if (phone || abhaId) {
      let url = "/api/sessions";
      if (phone) url += `?phone=${encodeURIComponent(phone)}`;
      else if (abhaId) url += `?abhaId=${encodeURIComponent(abhaId)}`;

      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          setPastSubmissions(data.sessions || []);
        })
        .catch((err) => console.error("Error loading past submissions:", err));
    }
  }, [step, account, form.phone, form.abhaId]);

  useEffect(() => {
    if (step !== "interview" || !question) return;
    setDraftText(answers[qid]?.text ?? "");
    setDraftValues(answers[qid]?.values ?? []);
    setHeard("");
    speak(question.text[lang] || question.text.en, lang);
  }, [qid, step, lang]);

  function stopMic() {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  }

  function toggleMic(onHeard?: (text: string) => void) {
    if (listening) {
      stopMic();
      return;
    }
    if (!canRecognize()) {
      setError("Voice is not available in this browser. Please tap or type.");
      return;
    }
    setError("");
    setListening(true);
    stopRef.current = startRecognition(
      lang,
      (text) => {
        setHeard(text);
        onHeard?.(text);
      },
      () => setListening(false),
    );
  }

    // ── Aadhaar card scan (photo → OCR → auto-fill) ──────────────────────
  const aadhaarScanRef = useRef<HTMLInputElement | null>(null);
  const [aadhaarScan, setAadhaarScan] = useState<{ busy: boolean; msg: string; ok: boolean }>({
    busy: false,
    msg: "",
    ok: false,
  });

  async function handleAadhaarScan(file: File) {
    if (!isValidDocumentFile(file)) {
      setAadhaarScan({ busy: false, msg: "Please use a JPG/PNG photo of the card", ok: false });
      return;
    }
    setAadhaarScan({ busy: true, msg: "📖 Reading card…", ok: false });
    try {
      const result = await performOCR(file, (p) =>
        setAadhaarScan({ busy: true, msg: `📖 Reading card… ${Math.round(p)}%`, ok: false }),
      );
      const parsed = parseAadhaarText(result.text);
      if (!parsed.ok) {
        setAadhaarScan({ busy: false, msg: `⚠️ ${parsed.error ?? "Could not read the card"}`, ok: false });
        return;
      }
      setForm((f) => ({
        ...f,
        aadhaarLast4: parsed.last4 ?? f.aadhaarLast4,
        fullName: f.fullName || parsed.fullName || "",
        age: f.age || parsed.age || "",
        gender: parsed.gender ?? f.gender,
      }));
      setAadhaarScan({
        busy: false,
        ok: true,
        msg: `✅ Aadhaar read: ${parsed.masked}${parsed.fullName ? ` — ${parsed.fullName}` : ""}${
          parsed.age ? `, age ${parsed.age}` : ""
        }`,
      });
    } catch {
      setAadhaarScan({ busy: false, msg: "⚠️ Scan failed — try again or type the details", ok: false });
    }
  }


  // Ensure local profile is synced so "View Full Portal" doesn't fail
  function handleGoToPortal() {
    const profile = {
      fullName: form.fullName || account?.fullName || "Patient",
      phoneNumber: form.phone || account?.phone || "",
      email: form.email || account?.email || "",
      abhaId: form.abhaId || account?.abhaId || "",
    };
    localStorage.setItem("patient_profile", JSON.stringify(profile));
    router.push("/portal");
  }

  async function createPatientAndSession() {
    setBusy(true);
    setError("");
    try {
      let resolvedId = useAccount ? account?.id ?? null : null;
      if (!resolvedId) {
        const res = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            abhaId: form.abhaId || undefined,
            aadhaarLast4: form.aadhaarLast4 || undefined,
            fullName: form.fullName,
            age: Number(form.age),
            gender: form.gender,
            phone: form.phone || undefined,
            email: form.email?.trim() || undefined,
            preferredLanguage: lang,
          }),
        });
        const data = (await res.json()) as { patient?: { id: string }; error?: string };
        if (!res.ok || !data.patient) throw new Error(data.error || "Could not register");
        resolvedId = data.patient.id;
      }
      const data = { patient: { id: resolvedId } };
      setPatientId(data.patient.id);

      const sres = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: data.patient.id,
          department,
          mode,
          location,
          language: lang,
          consents: Object.entries(granted).map(([type, g]) => ({
            type,
            granted: g,
            audioExplained: Boolean(audioExplained[type]),
          })),
        }),
      });
      const sdata = (await sres.json()) as { session?: { id: string; tokenNumber: string | null }; error?: string };
      if (!sres.ok || !sdata.session) throw new Error(sdata.error || "Could not open session");
      setSessionId(sdata.session.id);
      setToken(sdata.session.tokenNumber ?? "");
      setStep("interview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function persistAnswer(next: Ans, questionKey: string, section: string, questionText: string) {
    if (!sessionId) return;
    const res = await fetch(`/api/sessions/${sessionId}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section,
        questionKey,
        questionText,
        text: next.text,
        values: next.values,
        inputMode: next.inputMode,
      }),
    });
    const data = (await res.json()) as { flags?: { triggered: boolean; priority: string; reasons: string[] } };
    if (data.flags) setFlags(data.flags);
  }

  async function commitAndAdvance(partial?: Partial<Ans>) {
    if (!question) return;
    const next: Ans = {
      values: partial?.values ?? draftValues,
      text: partial?.text ?? draftText,
      inputMode: partial?.inputMode ?? (heard ? "voice" : "touch"),
    };
    if (question.type !== "text" && question.type !== "scale" && !question.optional) {
      if (!next.values.length && !next.text.trim()) {
        setError("Please choose an answer, speak, or type.");
        return;
      }
    }
        if (question.type === "text" && !question.optional && !next.text.trim() && !next.values.length) {
      setError("Please tell us a little more.");
      return;
    }
    // ── UTTERANCE GUARD (deterministic intent check, no LLM) ──────────────
    if (question.type === "text" && !question.optional && next.text.trim() && !next.values.length) {
      const check = classifyUtterance(next.text);
      if (!check.relevant) {
        setError(check.hint ?? "Please describe your health problem.");
        return;
      }
    }
    setError("");
    stopMic();
    const merged = { ...answers, [question.id]: next };
    setAnswers(merged);
    await persistAnswer(next, question.id, question.section, question.text.en);
    const nxt = nextQuestionId(question.id, merged, mode);
    if (!nxt) {
      setStep("documents");
      return;
    }
    setQid(nxt);
  }

    function goBackQuestion() {
    if (!question) return;
    const prev = previousQuestionId(question.id, answers, mode);
    if (!prev) {
      setStep("department");
      return;
    }
    setQid(prev);
  }

    // ── Fast chat: conversation → AI extraction → same question keys ────────
  async function submitChat() {
    if (!sessionId) return;
    const msg = chatText.trim();
    if (!msg) {
      setError("Please type or speak your problem first.");
      return;
    }
    setChatBusy(true);
    setError("");
    stopMic();
        const history = chatMsgs.map((m) => ({
      who: m.who === "you" ? ("patient" as const) : ("assistant" as const),
      text: m.text,
    }));
    setChatMsgs((m) => [...m, { who: "you", text: msg }]);
    setChatText("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/chat-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg, history }),
      });
      const data = (await res.json()) as {
        chat?: boolean;
        reply?: string;
        extracted?: ExtractedIntake;
        engine: string;
        aiUsed: boolean;
        followUp?: string;
        flags?: { triggered: boolean; priority: string; reasons: string[] };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not build your file. Please use the guided questions.");
      if (data.flags) setFlags(data.flags);
      // greeting / chit-chat → warm reply, no file, keep chatting
      if (data.chat) {
        setChatMsgs((m) => [...m, { who: "ai", text: data.reply || "Please tell me what health problem you have." }]);
        return;
      }
      if (data.extracted) setChatDraft({ extracted: data.extracted, engine: data.engine, aiUsed: data.aiUsed });
      // essentials still missing → one focused follow-up question at a time
           if (data.followUp && history.filter((x) => x.who === "patient").length < 3) {
        setChatMsgs((m) => [...m, { who: "ai", text: data.followUp! }]);
        return;
      }
      setChatDone(
        data.extracted
          ? { extracted: data.extracted, engine: data.engine, aiUsed: data.aiUsed }
          : chatDone,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setChatBusy(false);
    }
  }

  async function addSample(sampleId: string) {
    if (!sessionId) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleId }),
    });
    const data = (await res.json()) as { document: DocRow; duplicate?: boolean };
    if (data.duplicate) {
      setDupNotice(`"${data.document.fileName}" is already in your medical record — no duplicate created.`);
    } else {
      setDocs((d) => [...d, data.document]);
    }
    setBusy(false);
  }

  async function addPasted() {
    if (!sessionId || !paste.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docType,
        fileName: "typed-or-scanned.txt",
        sourceText: paste,
      }),
    });
    const data = (await res.json()) as { document: DocRow; duplicate?: boolean };
    if (data.duplicate) {
      setDupNotice(`"${data.document.fileName}" is already in your medical record — no duplicate created.`);
    } else {
      setDocs((d) => [...d, data.document]);
    }
    setPaste("");
    setBusy(false);
  }

  // Undo an uploaded document — removes it from the patient's record before
  // the summary is built (the doctor timeline only sees what remains).
  async function removeDoc(docId: string) {
    if (!sessionId) return;
    try {
      setError("");
      const res = await fetch(`/api/sessions/${sessionId}/documents?docId=${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove the document — please try again.");
      setDocs((d) => d.filter((x) => x.id !== docId));
      setDupNotice("");
    } catch (e: any) {
      setError(e?.message || "Could not remove the document");
    }
  }

  async function performOCRAndUpload(file: File) {
    if (!sessionId) return;
    if (!isValidDocumentFile(file)) {
      setError("Invalid file type. Please upload JPG, PNG, PDF or TXT");
      return;
    }
    setUploading(true);
    setOcrProgress(0);
    setError("");
        try {
      let sourceText = "";
      let fileName = file.name;
      let imageBase64: string | undefined;
      let ocrConfidence: number | undefined;
      // photos also go to the handwriting vision lane (downscaled, ~300 KB)
      if (file.type.startsWith("image/")) {
        try {
          imageBase64 = await fileToDownscaledBase64(file);
        } catch {
          /* vision is optional — Tesseract still runs */
        }
      }
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        const ocrResult = await performOCR(file, (progress) => {
          setOcrProgress(progress);
        });
        sourceText = ocrResult.text;
        ocrConfidence = Math.round((ocrResult.confidence ?? 1) * 100);
        // handwriting: Tesseract often reads nothing — the vision AI can
        if (!sourceText.trim() && !imageBase64) {
          throw new Error("OCR could not extract text from image. Try a clearer photo.");
        }
      } else {
        sourceText = await file.text();
      }
      if (!sourceText.trim() && imageBase64) {
        setOcrProgress(60); // reading the handwriting with vision AI…
      }
      const res = await fetch(`/api/sessions/${sessionId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          fileName,
          mimeType: file.type,
          sourceText,
          imageBase64,
          ocrConfidence,
        }),
      });
      const data = (await res.json()) as { document: DocRow; duplicate?: boolean };
      if (data.duplicate) {
        setDupNotice(`"${data.document.fileName}" is already in your medical record — no duplicate created.`);
      } else {
        setDocs((d) => [...d, data.document]);
      }
      setOcrProgress(100);
    } catch (e: any) {
      setError(e.message || "Failed to process document");
      console.error("OCR upload failed:", e);
    } finally {
      setUploading(false);
      setTimeout(() => setOcrProgress(0), 2000);
    }
  }

  // Evaluator demo: fetch a public demo image and push it through the REAL
  // upload pipeline (Tesseract → vision AI) exactly like a patient photo.
  async function tryDemoDoc(url: string, name: string) {
    try {
      setError("");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Demo file not found");
      const blob = await res.blob();
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });
      await performOCRAndUpload(file);
    } catch (e: any) {
      setError(e?.message || "Could not load the demo prescription");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void performOCRAndUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void performOCRAndUpload(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function clearSessionSecurely() {
    setAnswers({});
    setDocs([]);
    setSummary(null);
    setPaste("");
    setDraftText("");
    setDraftValues([]);
    setHeard("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("kiosk_temp_session");
      localStorage.removeItem("patient_profile_temp");
      sessionStorage.clear();
      console.log("[Privacy] Session data cleared per DPDP Act 2023 - temporary data removed");
    }
    stopMic();
    stopSpeaking();
  }

  // False-alarm escape: patient confirmed "not an emergency". The server
  // records the cancellation (the doctor still sees it) and downgrades the
  // priority to urgent — the lock screen closes and the interview continues.
  async function cancelEmergencyFlag() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/cancel-emergency`, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        flags?: { triggered: boolean; priority: string; reasons: string[] };
        error?: string;
      };
      if (!res.ok || !data.flags) throw new Error(data.error || "Could not cancel");
      setFlags(data.flags);
      setCancellingEmergency(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  async function buildSummary() {
    if (!sessionId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/summary`, { method: "POST" });
      const data = (await res.json()) as { summary: Summary; flags: typeof flags };
      setSummary(data.summary);
      setFlags(data.flags);
      setStep("review");
    } catch {
      setError("Could not build summary");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/submit`, { method: "POST" });
      const data = (await res.json()) as { session: { tokenNumber: string | null } };
      setToken(data.session.tokenNumber ?? token);
      setStep("complete");
      setTimeout(() => {
        console.log("[Privacy] Kiosk session completed, clearing temp voice/docs cache");
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("kiosk_voice_cache");
        }
      }, 2000);
    } finally {
      setBusy(false);
    }
  }

  const steps: KioskStep[] = ["language", "identify", "consent", "department", "interview", "documents", "review", "complete"];

  return (
    <div className="kiosk-bezel min-h-screen px-3 py-3 md:px-6 md:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl flex-col overflow-hidden rounded-[32px] bg-[#fffdf7] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <header className="flex items-center justify-between border-b border-[#1b1712]/8 px-5 py-4 md:px-8">
          <BrandMark />
          <div className="flex items-center gap-3">
            {flags?.triggered && (
              <span className="emergency-pulse hidden rounded-full bg-[#b42318] px-3 py-1 text-xs font-semibold text-white md:inline">
                {flags.priority === "emergency" ? "Emergency flag" : "Urgent flag"}
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full bg-[#f6f0e4] px-3 py-1 text-xs text-[#4a4338] md:inline-flex">
              <Languages className="h-3.5 w-3.5" />
              {LANGUAGES.find((l) => l.code === lang)?.native}
            </span>
            <Link href="/" className="text-xs text-[#4a4338] underline-offset-2 hover:underline">
              Exit
            </Link>
          </div>
        </header>

        <div className="flex gap-1.5 px-5 pt-4 md:px-8">
          {steps.map((s) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${steps.indexOf(s) <= steps.indexOf(step) ? "bg-[#0f5c61]" : "bg-[#e8dfd0]"}`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-auto px-5 py-6 md:px-10 md:py-8">
          {step === "language" && (
            <div className="rise mx-auto max-w-3xl">
              <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">Choose your language</p>
              <h1 className="serif mt-2 text-4xl md:text-5xl">{t("chooseLanguage", lang)}</h1>
              <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      setLang(l.code);
                      speak(t("chooseLanguage", l.code), l.code);
                    }}
                    className={`min-h-24 rounded-3xl border px-4 py-5 text-left transition ${
                      lang === l.code
                        ? "border-[#0f5c61] bg-[#0f5c61] text-[#fffdf7]"
                        : "border-[#1b1712]/10 bg-white hover:border-[#0f5c61]/40"
                    }`}
                  >
                    <span className="block text-xl font-semibold">{l.native}</span>
                    <span className="mt-1 block text-xs opacity-70">{l.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep("identify")}
                  className="rounded-full bg-[#0f5c61] px-8 py-3.5 text-base font-semibold text-white"
                >
                  {t("continue", lang)}
                </button>
              </div>
            </div>
          )}

          {step === "identify" && (
            <div className="rise mx-auto max-w-3xl space-y-6">
              <div>
                <h1 className="serif text-4xl">{t("identifyTitle", lang)}</h1>
                <p className="mt-2 text-[#4a4338]">{t("identifyHelp", lang)}</p>
              </div>

              {account && useAccount && (
                <div className="rounded-3xl bg-[#0f5c61] px-6 py-5 text-[#f6f0e4]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#e8d5a3]">{t("continuingAs", lang)}</p>
                  <p className="mt-1 text-2xl font-bold">{account.fullName}</p>
                  <p className="text-sm text-[#f6f0e4]/80">
                    {account.age} {t("years", lang)} ·{" "}
                    {account.abhaId ? `ABHA ${account.abhaId}` : t("noAbha", lang)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setUseAccount(false);
                      setForm({ abhaId: "", aadhaarLast4: "", fullName: "", age: "", gender: "male", phone: "", email: "" });
                      setPastSubmissions([]);
                    }}
                    className="mt-3 rounded-full bg-[#e8d5a3] px-4 py-1.5 text-xs font-semibold text-[#08363a] hover:bg-white"
                  >
                    {t("someoneElse", lang)}
                  </button>
                </div>
              )}

              {/* ── PREVIOUS SUBMISSIONS FOR THIS PATIENT ── */}
              {pastSubmissions.length > 0 && (
                <div className="rounded-3xl border border-[#c9842a]/30 bg-[#f6f0e4]/50 p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1b1712]/10 pb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#08363a] flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#c9842a]" /> Past Submissions ({pastSubmissions.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleGoToPortal}
                      className="text-xs font-semibold text-teal-800 underline hover:text-teal-900"
                    >
                      View Full Portal →
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {pastSubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="bg-white rounded-2xl p-3.5 border border-[#1b1712]/10 flex items-center justify-between text-xs md:text-sm"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#08363a]">
                              Token: {sub.tokenNumber || "OPD"}
                            </span>
                            <span className="text-[11px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded font-medium">
                              {sub.mode}
                            </span>
                          </div>
                          <p className="text-[#4a4338] font-medium mt-1">
                            {sub.summary?.chiefComplaint || sub.department || "General Consultation"}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {new Date(sub.startedAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>

                        {/* SAFE PATIENT READ-ONLY MODAL (Replaces doctor portal link) */}
                        <button
                          type="button"
                          onClick={() => setSelectedPastSession(sub)}
                          className="inline-flex items-center gap-1 bg-[#0f5c61] text-white px-3 py-1.5 rounded-full text-xs font-medium hover:bg-[#08363a]"
                        >
                          <FileText className="h-3.5 w-3.5" /> View Note
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`flex gap-2 ${account && useAccount ? "hidden" : ""}`}>
                {(["abha", "aadhaar", "new"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setIdentifyTab(tab)}
                    className={`rounded-full px-4 py-2 text-sm ${identifyTab === tab ? "bg-[#0f5c61] text-white" : "bg-[#f6f0e4]"}`}
                  >
                    {tab === "abha" ? t("abha", lang) : tab === "aadhaar" ? t("aadhaar", lang) : t("newPatient", lang)}
                  </button>
                ))}
              </div>

              <div className="grid gap-4">
                {identifyTab === "abha" && (
                  <Field
                    label={t("abha", lang)}
                    value={form.abhaId}
                    onChange={(v) => setForm({ ...form, abhaId: v })}
                    placeholder="12-3456-7890-1234"
                  />
                )}
                                {identifyTab === "aadhaar" && (
                  <div className="grid gap-2">
                    <Field
                      label={t("last4", lang)}
                      value={form.aadhaarLast4}
                      onChange={(v) => setForm({ ...form, aadhaarLast4: v.replace(/\D/g, "").slice(0, 4) })}
                      placeholder="8821"
                    />
                    <div>
                      <input
                        ref={aadhaarScanRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void handleAadhaarScan(f);
                        }}
                      />
                      <button
                        type="button"
                        disabled={aadhaarScan.busy}
                        onClick={() => aadhaarScanRef.current?.click()}
                        className="w-full rounded-2xl border border-dashed border-[#0f5c61]/50 bg-[#dceee8] px-4 py-3 text-sm font-semibold text-[#0f5c61] disabled:opacity-60"
                      >
                        📷 {aadhaarScan.busy ? aadhaarScan.msg : "Scan Aadhaar card (auto-fills name, age, gender)"}
                      </button>
                      {!aadhaarScan.busy && aadhaarScan.msg && (
                        <p className={`mt-2 text-sm ${aadhaarScan.ok ? "text-[#0f5c61]" : "text-[#b42318]"}`}>
                          {aadhaarScan.msg}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <Field label={t("fullName", lang)} value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("age", lang)} value={form.age} onChange={(v) => setForm({ ...form, age: v.replace(/\D/g, "").slice(0, 3) })} />
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-[#4a4338]">{t("gender", lang)}</span>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      className="h-14 w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 text-base"
                    >
                      <option value="male">{t("male", lang)}</option>
                      <option value="female">{t("female", lang)}</option>
                      <option value="other">{t("other", lang)}</option>
                    </select>
                  </label>
                </div>
                <Field label={t("phone", lang)} value={form.phone} onChange={(v) => setForm({ ...form, phone: v.replace(/\D/g, "").slice(0, 10) })} />
                <Field
                  label="Email (optional — for your token & live-status link)"
                  value={form.email}
                  type="email"
                  autoComplete="email"
                  onChange={(v) => setForm({ ...form, email: v.trim() })}
                  placeholder="you@example.com"
                />
              </div>

              <Nav
                lang={lang}
                onBack={() => setStep("language")}
                onNext={() => {
                  if (!form.fullName || !form.age) {
                    setError("Name and age are needed.");
                    return;
                  }
                  setError("");
                  setStep("consent");
                }}
                onSpeak={() => toggleMic((text) => setForm((f) => ({ ...f, fullName: f.fullName || text })))}
                listening={listening}
              />
            </div>
          )}

          {step === "consent" && (
            <div className="rise mx-auto max-w-3xl">
              <h1 className="serif text-4xl">{t("consentTitle", lang)}</h1>
              <p className="mt-3 text-[#4a4338]">{t("consentIntro", lang)}</p>
              <div className="mt-6 space-y-3">
                {consentItems.map((item) => (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer gap-4 rounded-3xl border p-5 ${granted[item.id] ? "border-[#0f5c61] bg-[#0f5c61]/5" : "border-[#1b1712]/10 bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={Boolean(granted[item.id])}
                      onChange={(e) => setGranted((g) => ({ ...g, [item.id]: e.target.checked }))}
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">{item.title[lang]}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-[#4a4338]">{item.body[lang]}</span>
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-[#0f5c61]"
                        onClick={(e) => {
                          e.preventDefault();
                          speak(`${item.title[lang]}. ${item.body[lang]}`, lang);
                          setAudioExplained((a) => ({ ...a, [item.id]: true }));
                        }}
                      >
                        <Volume2 className="h-3.5 w-3.5" /> {t("listen", lang)}
                      </button>
                    </span>
                  </label>
                ))}
              </div>
              <Nav
                lang={lang}
                onBack={() => setStep("identify")}
                nextLabel={t("grantAll", lang)}
                onNext={() => {
                  if (!granted.data_capture) {
                    setError("Health-story consent is required to continue.");
                    return;
                  }
                  setError("");
                  setStep("department");
                }}
              />
            </div>
          )}

          {step === "department" && (
            <div className="rise mx-auto max-w-4xl">
              <h1 className="serif text-4xl">{t("departmentTitle", lang)}</h1>

              {/* ── Where are you right now? ─────────────────────────────── */}
              <div className="mt-6 rounded-[24px] border border-[#1b1712]/10 bg-[#fffdf7] p-5">
                <p className="text-sm font-semibold text-[#08363a]">Where are you right now?</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setLocation("hospital")}
                    className={`rounded-2xl border px-5 py-4 text-left transition ${
                      location === "hospital"
                        ? "border-[#0f5c61] bg-[#0f5c61] text-white"
                        : "border-[#1b1712]/10 bg-white"
                    }`}
                  >
                    <span className="text-2xl">🏥</span>
                    <span className="mt-1 block font-semibold">I am at the hospital</span>
                    <span className={`mt-0.5 block text-xs ${location === "hospital" ? "text-white/80" : "text-[#4a4338]"}`}>
                      Join the live queue — the doctor will call your token
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocation("home")}
                    className={`rounded-2xl border px-5 py-4 text-left transition ${
                      location === "home"
                        ? "border-[#c9842a] bg-[#c9842a] text-white"
                        : "border-[#1b1712]/10 bg-white"
                    }`}
                  >
                    <span className="text-2xl">🏠</span>
                    <span className="mt-1 block font-semibold">I am at home</span>
                    <span className={`mt-0.5 block text-xs ${location === "home" ? "text-white/80" : "text-[#4a4338]"}`}>
                      Book a time slot — we will reserve your place in line
                    </span>
                  </button>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("allopathic");
                    setDepartment("general_medicine");
                  }}
                  className={`rounded-full px-5 py-2.5 ${mode === "allopathic" ? "bg-[#0f5c61] text-white" : "bg-[#f6f0e4]"}`}
                >
                  {t("allopathic", lang)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("ayush");
                    setDepartment("ayush_kayachikitsa");
                  }}
                  className={`rounded-full px-5 py-2.5 ${mode === "ayush" ? "bg-[#0f5c61] text-white" : "bg-[#f6f0e4]"}`}
                >
                  {t("ayush", lang)}
                </button>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
                {DEPARTMENTS.filter((d) => (mode === "ayush" ? d.id.startsWith("ayush") : !d.id.startsWith("ayush"))).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDepartment(d.id)}
                    className={`min-h-20 rounded-3xl border px-4 py-4 text-left ${
                      department === d.id ? "border-[#0f5c61] bg-[#0f5c61] text-white" : "border-[#1b1712]/10 bg-white"
                    }`}
                  >
                    <span className="block text-xs opacity-70">{d.token}</span>
                    <span className="mt-1 block font-medium">{d.label}</span>
                  </button>
                ))}
              </div>
              <Nav
                lang={lang}
                onBack={() => setStep("consent")}
                onNext={() => void createPatientAndSession()}
                busy={busy}
              />
            </div>
          )}

          {step === "interview" && question && (
            <div className="rise mx-auto max-w-4xl">
              {/* --- EMERGENCY HARD LOCK --- */}
              {flags?.triggered && flags.priority === "emergency" ? (
                <div className="mt-8 rounded-[32px] bg-[#b42318] p-8 text-center text-white shadow-2xl space-y-4">
                  <ShieldAlert className="mx-auto h-20 w-20 opacity-90" />
                  <h1 className="serif text-4xl md:text-5xl">Medical Emergency Detected</h1>
                  <p className="text-lg text-white/90">
                    Based on your responses, you require immediate medical attention. 
                    Please stop this questionnaire and proceed directly to Emergency Triage Desk.
                  </p>
                  
                  <div className="inline-block rounded-xl bg-black/20 p-4 text-left max-w-md mx-auto">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Flagged Symptoms:</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-white/90">
                      {flags.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        stopMic();
                        void submit();
                      }}
                      className="rounded-full bg-white px-8 py-4 text-lg font-bold text-[#b42318] shadow-lg hover:bg-gray-100 transition"
                    >
                      End Session & Alert Triage Desk
                    </button>
                  </div>

                  {/* ── False-alarm escape hatch (two-tap confirm) ─────── */}
                  {!cancellingEmergency ? (
                    <button
                      type="button"
                      onClick={() => setCancellingEmergency(true)}
                      className="text-sm text-white/70 underline underline-offset-4 transition hover:text-white"
                    >
                      This is a mistake — I do not have these symptoms now
                    </button>
                  ) : (
                    <div className="mx-auto max-w-md rounded-2xl bg-white/10 p-4 text-left space-y-3">
                      <p className="text-sm font-semibold">Are you sure this is not an emergency?</p>
                      <p className="text-xs text-white/85">
                        If you have chest pain, breathing trouble, heavy bleeding, or fainting RIGHT
                        NOW, please stop and alert the hospital staff.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void cancelEmergencyFlag()}
                          disabled={busy}
                          className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#08363a] transition hover:bg-gray-100 disabled:opacity-60"
                        >
                          {busy ? "Saving…" : "Yes — continue my questionnaire"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancellingEmergency(false)}
                          className="rounded-full bg-black/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black/40"
                        >
                          No — it is an emergency
                        </button>
                      </div>
                      <p className="text-[11px] text-white/60">
                        Your doctor will still see this alert and double-check you.
                      </p>
                    </div>
                  )}
                </div>
                            ) : chatMode ? (
                <>
                  <div className="mb-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChatMode(false)}
                      className="rounded-full border border-[#0f5c61]/30 bg-white px-4 py-1.5 text-sm font-semibold text-[#0f5c61] transition hover:bg-[#dceee8]"
                    >
                      ⭐ Guided — step by step
                    </button>
                    <span className="rounded-full bg-[#0f5c61] px-4 py-1.5 text-sm font-semibold text-white">
                      ⚡ Fast chat
                    </span>
                  </div>

                  {!chatDone ? (
                    <div className="space-y-4">
                      <h1 className="serif text-3xl leading-snug md:text-4xl">
                        Tell us everything, in your own words
                      </h1>
                                            <p className="text-sm text-[#c9842a]">
                        Type or speak one paragraph — our AI builds your medical file from it.
                      </p>
                      {/* recognition language — mic listens in THIS language */}
                      <div className="flex flex-wrap gap-2">
                        {LANGUAGES.map((l) => (
                          <button
                            key={l.code}
                            type="button"
                            onClick={() => setLang(l.code)}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                              lang === l.code
                                ? "border-[#0f5c61] bg-[#0f5c61] text-white"
                                : "border-[#1b1712]/15 bg-white text-[#1b1712] hover:bg-[#f6f0e4]"
                            }`}
                          >
                            {l.native}
                          </button>
                        ))}
                                            </div>
                      {/* the conversation so far — bubbles above the input */}
                      {chatMsgs.length > 0 && (
                        <div className="max-h-64 space-y-2 overflow-y-auto rounded-3xl bg-[#f6f0e4]/60 p-4">
                          {chatMsgs.map((m, i) => (
                            <div key={i} className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
                              <p
                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                                  m.who === "you"
                                    ? "bg-[#0f5c61] text-white"
                                    : "border border-[#1b1712]/10 bg-white text-[#1b1712]"
                                }`}
                              >
                                {m.text}
                              </p>
                            </div>
                          ))}
                          {chatBusy && (
                            <div className="flex justify-start">
                              <p className="rounded-2xl border border-[#1b1712]/10 bg-white px-4 py-2.5 text-sm text-[#8a7f6a]">
                                Reading your words, checking allergies and drug conflicts…
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <textarea
                        value={chatText}
                        onChange={(e) => setChatText(e.target.value)}
                        placeholder={
                          "Example: I have chest pain and sweating since 2 days, pain is 8 out of 10. " +
                          "I take telmisartan 40 and brufen. I am allergic to sulfa drugs. " +
                          "I have diabetes and BP. My father had heart disease. I smoke."
                        }
                        className="min-h-44 w-full rounded-3xl border border-[#1b1712]/12 bg-white px-4 py-3 text-lg text-black"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void submitChat()}
                          disabled={chatBusy || !chatText.trim()}
                          className="rounded-full bg-[#0f5c61] px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-[#0b4a4e] disabled:opacity-50"
                        >
                          {chatBusy ? "Checking…" : chatMsgs.length === 0 ? "Build my file ⚡" : "Send ⚡"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMic((text) => setChatText(text))}
                          className={`rounded-full border px-6 py-3.5 text-base font-semibold transition ${
                            listening
                              ? "border-[#b42318] bg-[#f4d4cf] text-[#b42318]"
                              : "border-[#1b1712]/15 bg-white text-[#1b1712]"
                          }`}
                        >
                                                    {listening ? "● Listening — tap to stop" : `🎤 Speak in ${LANGUAGES.find((l) => l.code === lang)?.native ?? "English"}`}
                        </button>
                      </div>
                                            {chatDraft && !chatBusy && !chatDone && (
                        <button
                          type="button"
                          onClick={() => setChatDone(chatDraft)}
                          className="text-sm font-semibold text-[#0f5c61] underline underline-offset-4"
                        >
                          Skip the questions — build my file now
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <h1 className="serif text-3xl leading-snug md:text-4xl">
                        Your file is ready — please check
                      </h1>
                      <p className="text-sm text-[#4a4338]">
                        Built by <span className="font-semibold text-[#0f5c61]">{chatDone.engine}</span> ·
                        your doctor will double-check everything.
                      </p>
                      <div className="space-y-3 rounded-3xl border border-[#1b1712]/10 bg-white p-5 text-left">
                        {(
                          [
                            ["Main problem", chatDone.extracted.chiefComplaint],
                            ["Duration", chatDone.extracted.durationText],
                            ["Severity (1–10)", chatDone.extracted.severity],
                            ["Current medicines", chatDone.extracted.medications.join(", ")],
                            ["Allergies", chatDone.extracted.allergies.join(", ")],
                            ["Past history", chatDone.extracted.pastMedical],
                            ["Family history", chatDone.extracted.familyHistory],
                            ["Tobacco", chatDone.extracted.tobacco],
                          ] as [string, string][]
                        ).map(([label, value]) => (
                          <div
                            key={label}
                            className="flex flex-col gap-0.5 border-b border-[#1b1712]/5 pb-2 last:border-0 last:pb-0"
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8a7f6a]">
                              {label}
                            </span>
                            <span className="text-base text-[#1b1712]">{value?.trim() ? value : "—"}</span>
                          </div>
                        ))}
                      </div>
                      {flags?.triggered && (
                        <p className="rounded-2xl bg-[#f4d4cf] px-4 py-3 text-sm font-medium text-[#b42318]">
                          ⚠️ {flags.reasons[0]}
                          {flags.reasons.length > 1
                            ? ` (+${flags.reasons.length - 1} more — shown to the doctor)`
                            : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setStep("documents")}
                          className="rounded-full bg-[#0f5c61] px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-[#0b4a4e]"
                        >
                          ✓ Looks right — continue
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatMode(false)}
                          className="rounded-full border border-[#1b1712]/15 bg-white px-6 py-3.5 text-base font-semibold text-[#1b1712] transition hover:bg-[#f6f0e4]"
                        >
                          ✎ Review question-by-question
                        </button>
                        <button
                          type="button"
                                                    onClick={() => {
                            setChatDone(null);
                            setChatDraft(null);
                            setChatMsgs([]);
                            setChatText("");
                          }}
                          className="rounded-full px-4 py-3.5 text-sm font-semibold text-[#0f5c61] underline underline-offset-4"
                        >
                          ↺ Say it again
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* ── intake mode switch: guided (default) vs fast chat ──── */}
                  <div className="mb-4 flex flex-wrap justify-center gap-2">
                    <span className="rounded-full bg-[#0f5c61] px-4 py-1.5 text-sm font-semibold text-white">
                      ⭐ Guided — step by step
                    </span>
                    <button
                      type="button"
                                            onClick={() => {
                        setChatDone(null);
                        setChatDraft(null);
                        setChatMsgs([]);
                        setChatMode(true);
                      }}
                      className="rounded-full border border-[#0f5c61]/30 bg-white px-4 py-1.5 text-sm font-semibold text-[#0f5c61] transition hover:bg-[#dceee8]"
                    >
                      ⚡ Fast chat — type it all
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-sm text-[#4a4338]">
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[#0f5c61]"
                      onClick={() => speak(question.text[lang] || question.text.en, lang)}
                    >
                      <Volume2 className="h-4 w-4" /> {t("listen", lang)}
                    </button>
                  </div>
                  <h1 className="serif mt-3 text-3xl leading-snug md:text-4xl">{question.text[lang] || question.text.en}</h1>
                  {question.help && <p className="mt-2 text-[#4a4338]">{question.help[lang]}</p>}
                  <p className="mt-2 text-sm text-[#c9842a]">{t("tapOrSpeak", lang)}</p>

                  {question.type === "chips" && question.options && (
                    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                      {question.options.map((opt) => {
                        const Icon = ICONS[opt.icon ?? "more"] ?? MoreHorizontal;
                        const on = draftValues.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              const values = [opt.id];
                              setDraftValues(values);
                              void commitAndAdvance({ values, text: draftText, inputMode: "touch" });
                            }}
                            className={`flex min-h-24 flex-col items-start rounded-3xl border px-4 py-4 text-left ${
                              on ? "border-[#0f5c61] bg-[#0f5c61] text-white" : "border-[#1b1712]/10 bg-white"
                            }`}
                          >
                            <Icon className="h-5 w-5 opacity-80" />
                            <span className="mt-2 font-medium leading-snug">{opt.label[lang] || opt.label.en}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(question.type === "single" || question.type === "yesno") && (
                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                      {(question.type === "yesno" ? YES_NO_OPTIONS : question.options ?? []).map((opt) => {
                        const on = draftValues.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setDraftValues([opt.id]);
                              if (question.type === "yesno" || question.type === "single") {
                                void commitAndAdvance({ values: [opt.id], text: draftText, inputMode: "touch" });
                              }
                            }}
                            className={`min-h-16 rounded-3xl border px-5 py-4 text-left text-lg ${
                              on ? "border-[#0f5c61] bg-[#0f5c61] text-white" : "border-[#1b1712]/10 bg-white"
                            }`}
                          >
                            {opt.label[lang] || opt.label.en}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {question.type === "multi" && question.options && (
                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                      {question.options.map((opt) => {
                        const on = draftValues.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setDraftValues((curr) => {
                                if (opt.id.startsWith("none") || opt.id === "no_travel" || opt.id === "nothing_worse" || opt.id === "nothing_better") {
                                  return [opt.id];
                                }
                                const withoutNone = curr.filter((id) => !id.startsWith("none") && id !== "no_travel");
                                return on ? withoutNone.filter((id) => id !== opt.id) : [...withoutNone, opt.id];
                              });
                            }}
                            className={`min-h-14 rounded-3xl border px-5 py-3.5 text-left ${
                              on ? "border-[#0f5c61] bg-[#0f5c61] text-white" : "border-[#1b1712]/10 bg-white"
                            }`}
                          >
                            {opt.label[lang] || opt.label.en}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {question.type === "scale" && (
                    <div className="mt-8">
                      <div className="flex justify-between gap-1">
                        {Array.from({ length: 11 }, (_, n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setDraftValues([String(n)]);
                              void commitAndAdvance({ values: [String(n)], text: "", inputMode: "touch" });
                            }}
                            className={`h-14 flex-1 rounded-2xl text-sm font-semibold ${
                              draftValues[0] === String(n)
                                ? "bg-[#0f5c61] text-white"
                                : n >= 8
                                  ? "bg-[#f4d4cf]"
                                  : n >= 4
                                    ? "bg-[#f3e1c0]"
                                    : "bg-[#dceee8]"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(question.type === "text" || question.type === "chips" || question.optional) && (
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      placeholder={question.placeholder?.[lang] || t("orType", lang)}
                      className="mt-6 min-h-28 w-full rounded-3xl border border-[#1b1712]/12 bg-white px-4 py-3 text-lg text-black"
                    />
                  )}

                  {heard && (
                    <p className="mt-3 rounded-2xl bg-[#f6f0e4] px-4 py-2 text-sm">
                      “{heard}”
                    </p>
                  )}

                  <Nav
                    lang={lang}
                    onBack={goBackQuestion}
                    onNext={() => void commitAndAdvance()}
                    nextLabel={t("nextQuestion", lang)}
                    listening={listening}
                    onSpeak={() =>
                      toggleMic((text) => {
                        setDraftText(text);
                        if (question.options) {
                          const hits = matchSpokenToOptions(text, question);
                          if (hits.length) setDraftValues(question.type === "multi" ? hits : [hits[0]]);
                        }
                        if (question.type === "scale") {
                          const n = text.match(/\b(10|[0-9])\b/);
                          if (n) setDraftValues([n[1]]);
                        }
                      })
                    }
                  />
                </>
              )}
            </div>
          )}

          {step === "documents" && (
            <div className="rise mx-auto max-w-4xl">
              <h1 className="serif text-4xl">{t("documentsTitle", lang)}</h1>
              <p className="mt-3 text-[#4a4338]">{t("documentsHelp", lang)}</p>
              {dupNotice && (
                <p className="mt-3 rounded-2xl bg-[#0f5c61]/10 px-4 py-3 text-sm text-[#0f5c61]">
                  ✓ {dupNotice}
                </p>
              )}
              
              <div className="mt-6 grid gap-4">
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`rounded-[28px] border-2 border-dashed p-8 text-center transition ${
                    isDragging ? "border-[#0f5c61] bg-[#0f5c61]/5" : "border-[#1b1712]/20 bg-white"
                  }`}
                >
                  <div className="mx-auto max-w-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f6f0e4]">
                      <ScanLine className="h-8 w-8 text-[#0f5c61]" />
                    </div>
                    <h3 className="mt-4 font-semibold">Upload Medical Documents - Real OCR</h3>
                    <p className="mt-1 text-sm text-[#4a4338]">Drag & drop or click to upload - JPG, PNG, PDF with Tesseract.js OCR (eng+hin+tam+tel+ben+mar+kan) + Bhashini future</p>
                    
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="rounded-full bg-[#0f5c61] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {uploading ? `Scanning... ${ocrProgress}%` : "Choose File"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={uploading}
                        className="rounded-full bg-[#f6f0e4] px-5 py-2.5 text-sm font-medium disabled:opacity-50"
                      >
                        📷 Camera Scan
                      </button>
                    </div>

                    {uploading && (
                      <div className="mt-4">
                        <div className="h-2 w-full rounded-full bg-[#e8dfd0]">
                          <div className="h-2 rounded-full bg-[#0f5c61] transition-all" style={{ width: `${ocrProgress}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-[#4a4338]">OCR: {ocrProgress}% - Tesseract.js (multilingual) - Bhashini roadmap for handwritten Hindi</p>
                      </div>
                    )}

                    <input ref={fileInputRef} type="file" accept="image/*,.pdf,.txt" className="hidden" onChange={handleFileChange} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                    
                    <p className="mt-3 text-[11px] text-[#4a4338]/70">Secure: Images processed client-side, only extracted text sent to server per DPDP Act 2023</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-[#c9842a]">Or try sample documents (AIIMS, Safdarjung, KEM, AIIA) - Demo</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {SAMPLE_DOCUMENTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => void addSample(s.id)}
                        className="rounded-3xl border border-[#1b1712]/10 bg-white p-5 text-left hover:border-[#0f5c61]/40"
                      >
                        <span className="text-xs uppercase tracking-wider text-[#c9842a]">{s.docType}</span>
                        <span className="mt-1 block font-semibold">{s.fileName}</span>
                        <span className="mt-1 block text-sm text-[#4a4338]">{s.facilityName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-[#c9842a]/30 bg-[#fffdf7] p-5">
                  <p className="text-xs uppercase tracking-wider text-[#c9842a]">
                    Evaluator demo prescriptions — real images, real pipeline
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {DEMO_DOCS.map((demo) => (
                      <div key={demo.file} className="flex items-center gap-3 rounded-2xl border border-[#1b1712]/10 bg-white p-3">
                        <a href={demo.file} target="_blank" rel="noreferrer" className="shrink-0" title="View full image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={demo.file} alt={demo.label} className="h-16 w-12 rounded-lg border border-[#1b1712]/10 object-cover" />
                        </a>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{demo.label}</p>
                          <p className="truncate text-xs text-[#4a4338]">{demo.hint}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void tryDemoDoc(demo.file, demo.name)}
                          disabled={uploading}
                          className="shrink-0 rounded-full bg-[#0f5c61] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Try it
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-[#4a4338]/70">
                    Tap a thumbnail to view the paper. "Try it" runs it through the same pipeline as a
                    patient photo: Tesseract OCR → confidence check → vision AI for handwriting.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-dashed border-[#1b1712]/20 p-5">
                <p className="text-sm font-medium">Manual Text Entry (Fallback for low-literacy)</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["prescription", "lab", "discharge", "imaging", "other"].map((ty) => (
                    <button
                      key={ty}
                      type="button"
                      onClick={() => setDocType(ty)}
                      className={`rounded-full px-3 py-1 text-sm ${docType === ty ? "bg-[#0f5c61] text-white" : "bg-[#f6f0e4]"}`}
                    >
                      {ty}
                    </button>
                  ))}
                </div>
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={t("pastePlaceholder", lang)}
                  className="mt-3 min-h-28 w-full rounded-2xl border border-[#1b1712]/10 bg-white px-3 py-2 text-black"
                />
                <button
                  type="button"
                  onClick={() => void addPasted()}
                  className="mt-3 rounded-full bg-[#08363a] px-5 py-2 text-sm text-white"
                >
                  {t("readPaper", lang)}
                </button>
              </div>
              {docs.length > 0 && (
                <ul className="mt-6 space-y-3">
                  {docs.map((d) => (
                    <li key={d.id} className="rounded-3xl bg-[#f6f0e4] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{d.fileName}</p>
                          <p className="text-xs text-[#4a4338]">
                            {d.facilityName} · {d.documentDate}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeDoc(d.id)}
                          className="shrink-0 rounded-full border border-[#b42318]/30 px-3 py-1 text-xs font-semibold text-[#b42318] transition hover:bg-[#f4d4cf]"
                        >
                          ✕ Remove
                        </button>
                      </div>
                      {d.extractedJson && (
                        <p className="mt-2 text-sm">
                          {d.extractedJson.labs.filter((l) => l.abnormal).length > 0 && (
                            <span className="mr-2 text-[#b42318]">
                              {d.extractedJson.labs.filter((l) => l.abnormal).length} {t("abnormalValues", lang)}
                            </span>
                          )}
                                                    {d.extractedJson.medications.length} {t("medicinesWord", lang)} ·{" "}
                          {d.extractedJson.diagnoses.length} {t("diagnosesWord", lang)}
                        </p>
                      )}
                      {d.extractedJson?.structuredBy?.startsWith("AI") && (
                        <p className="mt-1 text-xs font-semibold text-[#0f5c61]">
                          ✨ Structured by {d.extractedJson.structuredBy}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Nav
                lang={lang}
                onBack={() => {
                  setStep("interview");
                }}
                onNext={() => void buildSummary()}
                nextLabel={docs.length ? t("continue", lang) : t("skipDocs", lang)}
                busy={busy}
              />
            </div>
          )}

          {step === "review" && summary && (
            <div className="rise mx-auto max-w-3xl">
              <h1 className="serif text-4xl">{t("reviewTitle", lang)}</h1>
              {flags?.triggered && (
                <div className="mt-4 rounded-3xl bg-[#b42318] px-5 py-4 text-white">
                  <p className="font-semibold">{t("emergencyBanner", lang)}</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-white/90">
                    {flags.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="prose-clinical mt-6 space-y-4 text-[15px] leading-relaxed">
                <Block title={sectionTitles.chiefComplaint[lang]} body={summary.chiefComplaint} />
                <Block title={sectionTitles.hpi[lang]} body={summary.hpi} />
                <Block title={sectionTitles.pastMedical[lang]} body={summary.pastMedical} />
                <Block title={sectionTitles.pastSurgical[lang]} body={summary.pastSurgical} />
                <Block title={sectionTitles.drugs[lang]} body={summary.drugs} />
                <Block title={sectionTitles.allergies[lang]} body={summary.allergies} />
                <Block title={sectionTitles.family[lang]} body={summary.familyHistory} />
                <Block title={sectionTitles.personal[lang]} body={summary.personalHistory} />
                <Block title={sectionTitles.ros[lang]} body={summary.reviewOfSystems} />
                <Block title={sectionTitles.priorPapers[lang]} body={summary.investigationsSummary} />
                {summary.ayushAssessment && (
                  <div className="rounded-3xl bg-[#f6f0e4] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#c9842a]">Dashavidha Pariksha</p>
                    <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                      {Object.entries(summary.ayushAssessment)
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt className="capitalize text-[#4a4338]">{k}</dt>
                            <dd className="font-medium">{v}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                )}
              </div>
              <Nav lang={lang} onBack={() => setStep("documents")} onNext={() => void submit()} nextLabel={t("submit", lang)} busy={busy} />
            </div>
          )}

          {step === "complete" && (
            <div className="rise mx-auto max-w-xl py-8 text-center">
              <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">{t("doneTitle", lang)}</p>
              <h1 className="serif mt-2 text-4xl">{form.fullName}, {t("tokenLabel", lang)}</h1>
              <div className="ticket mx-auto mt-8 max-w-sm rounded-[28px] border border-dashed border-[#c9842a] px-8 py-10">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4338]">MediKiosk · OPD</p>
                <p className="serif mt-3 text-6xl tracking-tight text-[#08363a]">{token || "OPD"}</p>
                <p className="mt-3 text-sm text-[#4a4338]">
                  {DEPARTMENTS.find((d) => d.id === department)?.label} · {mode}
                </p>
                                <p className="mt-3 text-sm text-[#4a4338]">
                  {DEPARTMENTS.find((d) => d.id === department)?.label} · {mode}
                </p>
                                {location === "hospital" && (
                  <TicketRoom department={department} emergency={Boolean(flags?.triggered)} />
                )}
                                {summary && (
                  <p className="mt-3 inline-block rounded-full bg-[#f6f0e4] px-3 py-1 text-[11px] font-semibold text-[#08363a]">
                    {summary.aiUsed ? `✨ AI summary ready for the doctor (${summary.engine ?? "ai"})` : "📋 Summary ready for the doctor"}
                  </p>
                )}
                {location === "home" ? <ScheduleSlotBox /> : <QueuePosition token={token} />}
                {flags?.triggered && (
                  <p className="mt-4 rounded-full bg-[#b42318] px-3 py-1 text-xs font-semibold text-white">
                    {t("goTriage", lang)}
                  </p>
                )}
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={handleGoToPortal}
                  className="rounded-full bg-[#0f5c61] px-6 py-3 text-white font-medium"
                >
                  View My Submissions Portal →
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopMic();
                    stopSpeaking();
                    setStep("language");
                    setIdentifyTab("abha");
                    setForm({ abhaId: "", aadhaarLast4: "", fullName: "", age: "", gender: "male", phone: "", email: "" });
                    setGranted({ data_capture: true, document_scan: true, his_push: true, abha_share: true });
                    setAudioExplained({});
                    setMode("allopathic");
                    setDepartment("general_medicine");
                    setLocation("hospital");
                    setPatientId(null);
                    setSessionId(null);
                    setToken("");
                    setQid("chief_complaint");
                    setAnswers({});
                    setDraftText("");
                    setDraftValues([]);
                    setDocs([]);
                    setSummary(null);
                    setFlags(null);
                    setCancellingEmergency(false);
                    setError("");
                    setPaste("");
                    setPastSubmissions([]);
                  }}
                  className="rounded-full bg-[#f6f0e4] px-6 py-3"
                >
                  {t("nextPatient", lang)} (Secure Clear)
                </button>
              </div>
            </div>
          )}

          {error && <p className="mx-auto mt-4 max-w-3xl text-sm text-[#b42318]">{error}</p>}
        </div>

        {patientId && (
          <footer className="border-t border-[#1b1712]/8 px-6 py-3 text-[11px] text-[#4a4338]">
            Session scratch · {sessionId?.slice(0, 8)} · answers saved as draft, not a diagnosis
            {question && answers[question.id] ? ` · last: ${formatAnswer(question, answers[question.id].values, answers[question.id].text, lang)}` : ""}
          </footer>
        )}
      </div>

      {/* ── SAFE PATIENT READ-ONLY MODAL (Prevents unauthorized doctor portal access) ── */}
      {selectedPastSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 md:p-8 shadow-2xl border border-[#1b1712]/10 space-y-4 text-black">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-xs uppercase font-bold text-[#c9842a]">Patient Receipt & Summary</span>
                <h3 className="text-xl font-bold text-[#08363a]">
                  Token: {selectedPastSession.tokenNumber || "OPD"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPastSession(null)}
                className="p-2 text-gray-400 hover:text-black rounded-full hover:bg-gray-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="font-bold text-[#c9842a] uppercase text-xs">Chief Complaint</span>
                <p className="mt-0.5 text-gray-800 font-medium">
                  {selectedPastSession.summary?.chiefComplaint || selectedPastSession.department || "General Consultation"}
                </p>
              </div>

              {selectedPastSession.summary?.hpi && (
                <div>
                  <span className="font-bold text-[#c9842a] uppercase text-xs">History of Present Illness</span>
                  <p className="mt-0.5 text-gray-700">{selectedPastSession.summary.hpi}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl">
                <div>
                  <span className="font-semibold text-gray-500 block">Care Mode</span>
                  <span className="font-bold text-[#08363a] uppercase">{selectedPastSession.mode}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-500 block">Submitted At</span>
                  <span className="font-bold text-[#08363a]">
                    {new Date(selectedPastSession.startedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPastSession(null)}
                className="bg-[#0f5c61] text-white px-6 py-2.5 rounded-full font-medium text-sm hover:bg-[#08363a]"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-[#4a4338]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-14 w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 text-lg text-black"
      />
    </label>
  );
}

function Nav({
  lang,
  onBack,
  onNext,
  onSpeak,
  listening,
  nextLabel,
  busy,
}: {
  lang: Lang;
  onBack: () => void;
  onNext: () => void;
  onSpeak?: () => void;
  listening?: boolean;
  nextLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[#4a4338]">
        <ArrowLeft className="h-4 w-4" /> {t("back", lang)}
      </button>
      <div className="flex gap-2">
        {onSpeak && (
          <button
            type="button"
            onClick={onSpeak}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-3 ${listening ? "bg-[#b42318] text-white" : "bg-[#f6f0e4]"}`}
          >
            <Mic className="h-4 w-4" /> {listening ? t("listening", lang) : t("speak", lang)}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-[#0f5c61] px-7 py-3 font-semibold text-white disabled:opacity-60"
        >
          <Check className="h-4 w-4" /> {busy ? "…" : nextLabel || t("continue", lang)}
        </button>
      </div>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-[0.16em] text-[#c9842a]">{title}</h2>
      <p className="mt-1">{body}</p>
    </section>
  );
}

// ── Appointment slot for HOME bookings ────────────────────────────────────
// Home patients are NOT in the live queue — they get a scheduled time
// (after everyone currently waiting, min 15 minutes) to arrive at the OPD.
function ScheduleSlotBox() {
  const [slot, setSlot] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/queue", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const waiting = (data.queue ?? []).length;
        setSlot(formatClockTime(scheduleSlot(waiting)));
      } catch {
        /* silent — the ticket works without the slot */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!slot) return null;
  return (
    <div className="mt-4 rounded-2xl bg-[#fdf3e0] px-3 py-2 text-sm font-medium text-[#8a5a13]">
      <p>Your appointment is booked for</p>
      <p className="mt-0.5 text-base font-bold">{slot}</p>
      <p className="mt-0.5 text-xs">Please arrive 10 minutes early and press &ldquo;I have arrived&rdquo; in your portal.</p>
    </div>
  );
}

// ── Room on the patient's token ticket ────────────────────────────────────
// Shows which consultation room + floor to head to (from the department).
// Emergencies are routed to the Triage Bay instead of the OPD room.
function TicketRoom({ department, emergency }: { department: string; emergency: boolean }) {
  const room = roomFor(department, emergency ? "emergency" : "routine");
  return (
    <div className="mt-3 rounded-2xl bg-[#08363a] px-3 py-2 text-left text-[#f6f0e4]">
      <p className="text-xs font-bold uppercase tracking-wider text-[#e8d5a3]">
        {emergency ? "🚨 Go to triage" : "Go to consultation room"}
      </p>
      <p className="mt-0.5 text-base font-bold">
        {room.room} · {room.floor}
      </p>
      <p className="text-[11px] text-[#f6f0e4]/75">{room.wing} — {room.land}</p>
    </div>
  );
}
// ── Live queue position on the patient's token ticket ─────────────────────
// Fetches the deterministic OPD queue once and shows how many patients are
// ahead plus a real clock time ("Be at the hospital by 10:45 am") so the
// patient knows when to be at the consultation door.
function QueuePosition({ token }: { token: string | null }) {
  const [info, setInfo] = useState<{ ahead: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/queue", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const idx = (data.queue ?? []).findIndex(
          (q: { tokenNumber: string | null }) => q.tokenNumber === token,
        );
        if (idx >= 0) {
          setInfo({ ahead: idx });
        } else if (data.nowServing?.tokenNumber === token) {
          setInfo({ ahead: 0 });
        }
      } catch {
        /* silent — the ticket works without the estimate */
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (info === null) return null;
  const arriveBy = formatClockTime(arriveByTime(info.ahead));
  return (
    <div className="mt-4 rounded-2xl bg-[#dceee8] px-3 py-2 text-sm font-medium text-[#0f5c61]">
      {info.ahead === 0 ? (
        <p className="text-base">🔔 It is your turn — please go to the consultation room</p>
      ) : (
        <>
          <p>
            {info.ahead} {info.ahead === 1 ? "patient" : "patients"} ahead of you
          </p>
          <p className="mt-0.5 text-base font-bold">Be at the hospital by {arriveBy}</p>
        </>
      )}
    </div>
  );
}
