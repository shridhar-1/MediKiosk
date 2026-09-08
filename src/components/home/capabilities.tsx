// 🧩 Capabilities & Spec Band — turns the homepage from a single demo story
// into a scannable feature + honesty statement. Presentational only.
// Mirrors the brand tokens used across the landing page.

const CAPABILITIES: { icon: string; title: string; body: string }[] = [
  {
    icon: "🎙️",
    title: "Voice-first intake",
    body: "Patient speaks in their language — no forms, no literacy barrier. Silence auto-stops, live transcript preview.",
  },
  {
    icon: "🩺",
    title: "Red-flag engine",
    body: "Deterministic rules run first, every answer saved. Rules are data, every verdict carries its evidence.",
  },
  {
    icon: "💊",
    title: "Drug-safety engine",
    body: "Allergy, drug–drug & drug–condition flags with Indian brand names — Penicillin vs Amoxicillin, NSAID on kidney.",
  },
  {
    icon: "🧾",
    title: "Paper → record",
    body: "Photograph an old prescription; OCR structures it into labs, medicines & diagnoses with guardrails.",
  },
  {
    icon: "🌐",
    title: "8+ languages",
    body: "English, हिंदी, ಕನ್ನಡ, తెలుగు, தமிழ், বাংলা, मराठी & more — questions, answers and the summary.",
  },
  {
    icon: "🔁",
    title: "Never stuck without AI",
    body: "Groq → Gemini → Ollama → rule-based template. If every model is down, the kiosk still works offline.",
  },
  {
    icon: "🏛️",
    title: "ABHA · ABDM · HIS",
    body: "FHIR R4 output, ABHA linkage and hospital push — real sandbox paths with honest MOCK fallback.",
  },
  {
    icon: "📱",
    title: "Patient portal",
    body: "The doctor's plain-words advice lives in the patient's portal — they leave remembering what to do.",
  },
];

const STREAMS = [
  { label: "Allopathy", tag: "AI triage · emergency skip-queue", dot: "#b42318" },
  { label: "AYUSH / Ayurveda", tag: "Dashavidha · Prakriti · Agni · Nadi", dot: "#2e9e6b" },
];

const STACK = [
  "Next.js 16 · React 19",
  "PostgreSQL · Drizzle",
  "FHIR R4",
  "ABDM / ABHA",
  "Groq · Gemini · Ollama",
  "DPDP consent",
  "Twilio · SMTP",
];

export function Capabilities() {
  return (
    <section className="mx-auto mt-16 max-w-5xl">
      {/* eyebrow */}
      <p className="text-center text-[11px] uppercase tracking-[0.24em] text-[#e8d5a3]">
        One intake · two medical systems
      </p>
      <h2 className="serif mt-2 text-center text-[clamp(1.6rem,3.5vw,2.4rem)] leading-tight text-[#f6f0e4]">
        Allopathy triage <span className="text-[#e8d5a3]">&amp;</span> AYUSH assessment,
        <br className="hidden sm:block" /> from the same kiosk.
      </h2>

      {/* streams */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {STREAMS.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-2xl bg-[#fffdf7] px-5 py-4 ring-1 ring-[#0f5c61]/20"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.dot }}
            />
            <div>
              <p className="text-sm font-bold text-[#08363a]">{s.label}</p>
              <p className="text-xs text-[#4a4338]">{s.tag}</p>
            </div>
          </div>
        ))}
      </div>

      {/* capability grid */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.map((c) => (
          <div
            key={c.title}
            className="rounded-2xl bg-[#fffdf7]/[0.06] p-4 ring-1 ring-[#f6f0e4]/10 transition hover:bg-[#fffdf7]/10"
          >
            <p className="text-2xl">{c.icon}</p>
            <p className="mt-2 text-sm font-bold text-[#f6f0e4]">{c.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#f6f0e4]/70">{c.body}</p>
          </div>
        ))}
      </div>

      {/* honest spec strip */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {STACK.map((t) => (
          <span
            key={t}
            className="rounded-full bg-[#e8d5a3]/10 px-3 py-1 text-[11px] font-medium text-[#e8d5a3] ring-1 ring-[#e8d5a3]/25"
          >
            {t}
          </span>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-[#f6f0e4]/50">
        Every external integration is honest about LIVE vs MOCK — nothing over-claims on the demo.
      </p>
    </section>
  );
}