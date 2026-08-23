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
import { canRecognize, speak, startRecognition, stopSpeaking } from "@/lib/speech";
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
  Droplets,
  Flower2,
  Gauge,
  HeartPulse,
  Languages,
  Mic,
  MoreHorizontal,
  ScanLine,
  Thermometer,
  Volume2,
  Wind,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Ans = { values: string[]; text: string; inputMode: InputMode };
type Summary = {
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
  extractedJson: ExtractedDocument | null;
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
  abhaId: string | null;
  aadhaarLast4: string | null;
  preferredLanguage: string;
};

export function KioskApp({ account }: { account?: KioskAccount | null }) {
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
  });
  const [granted, setGranted] = useState<Record<string, boolean>>({
    data_capture: true,
    document_scan: true,
    his_push: true,
    abha_share: true,
  });
  const [audioExplained, setAudioExplained] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<CareMode>("allopathic");
  const [department, setDepartment] = useState("general_medicine");
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
  const [paste, setPaste] = useState("");
  const [docType, setDocType] = useState("lab");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flags, setFlags] = useState<{ triggered: boolean; priority: string; reasons: string[] } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const question = questionById(qid);
  const progress = useMemo(() => questionProgress(qid, answers, mode), [qid, answers, mode]);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (step !== "interview" || !question) return;
    setDraftText(answers[qid]?.text ?? "");
    setDraftValues(answers[qid]?.values ?? []);
    setHeard("");
    speak(question.text[lang] || question.text.en, lang);
  }, [qid, step, lang]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function addSample(sampleId: string) {
    if (!sessionId) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sampleId }),
    });
    const data = (await res.json()) as { document: DocRow };
    setDocs((d) => [...d, data.document]);
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
    const data = (await res.json()) as { document: DocRow };
    setDocs((d) => [...d, data.document]);
    setPaste("");
    setBusy(false);
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
            <div className="rise mx-auto max-w-3xl">
              <h1 className="serif text-4xl">{t("identifyTitle", lang)}</h1>
              <p className="mt-3 text-[#4a4338]">{t("identifyHelp", lang)}</p>
              {account && useAccount && (
                <div className="mt-5 rounded-3xl bg-[#0f5c61] px-5 py-4 text-[#f6f0e4]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#e8d5a3]">{t("continuingAs", lang)}</p>
                  <p className="mt-1 text-lg font-semibold">{account.fullName}</p>
                  <p className="text-sm text-[#f6f0e4]/78">
                    {account.age} {t("years", lang)} ·{" "}
                    {account.abhaId ? `ABHA ${account.abhaId}` : t("noAbha", lang)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setUseAccount(false);
                      setForm({ abhaId: "", aadhaarLast4: "", fullName: "", age: "", gender: "male", phone: "" });
                    }}
                    className="mt-3 rounded-full bg-[#e8d5a3] px-4 py-1.5 text-xs font-semibold text-[#08363a]"
                  >
                    {t("someoneElse", lang)}
                  </button>
                </div>
              )}
              <div className={`mt-6 flex gap-2 ${account && useAccount ? "hidden" : ""}`}>
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
              <div className="mt-6 grid gap-4">
                {identifyTab === "abha" && (
                  <Field
                    label={t("abha", lang)}
                    value={form.abhaId}
                    onChange={(v) => setForm({ ...form, abhaId: v })}
                    placeholder="12-3456-7890-1234"
                  />
                )}
                {identifyTab === "aadhaar" && (
                  <Field
                    label={t("last4", lang)}
                    value={form.aadhaarLast4}
                    onChange={(v) => setForm({ ...form, aadhaarLast4: v.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="8821"
                  />
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
                <p className="text-xs text-[#4a4338]">
                  Demo ABHA already in the system: <button type="button" className="underline" onClick={() => setForm({ ...form, abhaId: "12-3456-7890-1234", fullName: "Ramesh Kumar", age: "58", gender: "male", phone: "9810011122" })}>12-3456-7890-1234</button>
                </p>
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
                  className="mt-6 min-h-28 w-full rounded-3xl border border-[#1b1712]/12 bg-white px-4 py-3 text-lg"
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
            </div>
          )}

          {step === "documents" && (
            <div className="rise mx-auto max-w-4xl">
              <h1 className="serif text-4xl">{t("documentsTitle", lang)}</h1>
              <p className="mt-3 text-[#4a4338]">{t("documentsHelp", lang)}</p>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
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
              <div className="mt-6 rounded-3xl border border-dashed border-[#1b1712]/20 p-5">
                <div className="flex flex-wrap gap-2">
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
                  className="mt-3 min-h-28 w-full rounded-2xl border border-[#1b1712]/10 bg-white px-3 py-2"
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
                      <p className="font-semibold">{d.fileName}</p>
                      <p className="text-xs text-[#4a4338]">
                        {d.facilityName} · {d.documentDate}
                      </p>
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
                {flags?.triggered && (
                  <p className="mt-4 rounded-full bg-[#b42318] px-3 py-1 text-xs font-semibold text-white">
                    {t("goTriage", lang)}
                  </p>
                )}
              </div>
              <div className="mt-8 flex justify-center gap-3">
                <Link href={`/physician/${sessionId ?? ""}`} className="rounded-full bg-[#0f5c61] px-6 py-3 text-white">
                  {t("openDoctorScreen", lang)}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    stopMic();
                    stopSpeaking();
                    setStep("language");
                    setIdentifyTab("abha");
                    setForm({ abhaId: "", aadhaarLast4: "", fullName: "", age: "", gender: "male", phone: "" });
                    setGranted({ data_capture: true, document_scan: true, his_push: true, abha_share: true });
                    setAudioExplained({});
                    setMode("allopathic");
                    setDepartment("general_medicine");
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
                    setError("");
                    setPaste("");
                  }}
                  className="rounded-full bg-[#f6f0e4] px-6 py-3"
                >
                  {t("nextPatient", lang)}
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
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-[#4a4338]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 text-lg"
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
