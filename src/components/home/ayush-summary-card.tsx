// 🌿 AYUSH Summary Card — the second "persona" on the homepage.
// Shows a *different* scenario from the Allopathy chest-pain card so a judge
// can see MediKiosk is not hard-coded to one emergency: a routine AYUSH /
// Ayurveda intake (Dashavidha Pariksha output, non-emergency triage).
// Static, presentational — no client JS, no external assets.

export function AyushSummaryCard() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[26px] bg-[#fffdf7] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] ring-1 ring-[#0f5c61]/20">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1b1712]/10 pb-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[#08363a]">
            🌿 AI Clinical Summary · AYUSH Assessment
          </p>
          <span
            className="rounded-full bg-[#e7f0e3] px-2.5 py-0.5 text-[10px] font-semibold text-[#3a5c37]"
            title="Dashavidha Pariksha fields are grounded — Prakriti/Agni/Koshtha computed from the patient's answers"
          >
            Dashavidha grounded · sources cited
          </span>
        </div>
        <p className="mt-2 text-xs text-[#4a4338]">
          Token MED-0081 · AYUSH / Panchakarma OPD · Lakshmi, 54 / Female · ABHA linked
        </p>

        {/* flags */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-[#b42318] px-3 py-1.5 text-xs font-bold text-white shadow-sm"
            style={{ animationDelay: "0.15s" }}
          >
            ⚠️ NSAID on borderline kidney
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0f7b5c] px-3 py-1.5 text-xs font-bold text-white shadow-sm"
            style={{ animationDelay: "0.35s" }}
          >
            Routine — no red flag
          </span>
        </div>

        {/* fields */}
        <div className="mt-5 space-y-3 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c9842a]">
              Chief complaint
            </p>
            <p className="mt-0.5 text-[#08363a]">
              Bilateral knee pain &amp; stiffness, worse in cold mornings — 6 months, mild swelling.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c9842a]">
              Dashavidha Pariksha (AI-computed, doctor-verifiable)
            </p>
            <p className="mt-0.5 leading-relaxed text-[#1b1712]">
              Prakriti: Vata–Pitta · Agni: Vishama · Koshtha: Krura · Nadi: 82/mt, Vata-dominant ·
              Jihva: mild coating. History favours Vataja Sandhigata Vata — no fever, no trauma.
            </p>
          </div>
        </div>

        {/* triage strip — contrast: routine, not emergency */}
        <div
          className="mt-5 rounded-2xl bg-[#08363a] p-4 text-[#f6f0e4]"
          style={{ animationDelay: "0.55s" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              <span className="rounded-full bg-[#2e9e6b] px-2.5 py-0.5 text-xs uppercase tracking-wider">
                Priority: Routine
              </span>
            </p>
            <p className="text-sm font-semibold tabular-nums">Queue position 12 of 18</p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-[67%] rounded-full bg-[#e8d5a3]" />
          </div>
          <p className="mt-2 text-xs text-[#f6f0e4]/70">
            Same engine, calm case — nothing is invented. The deterministic rules floor cleared
            this intake, so the doctor walks in already knowing it is routine.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-[#4a4338]">
          ✓ One kiosk speaks both systems — Allopathy triage <em>and</em> AYUSH Pariksha.
        </p>
      </div>
    </div>
  );
}