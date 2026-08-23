import Link from "next/link";
import Image from "next/image";
import { BrandMark } from "@/components/brand";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await seedIfEmpty();

  return (
    <main className="min-h-screen">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 md:px-10">
        <BrandMark light />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login/staff" className="rounded-full px-4 py-2 text-[#f6f0e4]/85 hover:bg-white/10">
            Hospital staff
          </Link>
          <Link
            href="/login/patient"
            className="rounded-full bg-[#e8d5a3] px-5 py-2.5 font-medium text-[#08363a] shadow-sm"
          >
            Patient sign in
          </Link>
        </nav>
      </header>

      <section className="mesh-hero relative min-h-[92vh] overflow-hidden text-[#f6f0e4]">
        <div className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-end px-6 pb-16 pt-32 md:px-10">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#e8d5a3]">
            For Indian public OPDs · ABDM-ready · DPDP 2023
          </p>
          <h1 className="serif mt-4 max-w-3xl text-[clamp(2.6rem,7vw,5.4rem)] font-medium leading-[0.95] tracking-tight">
            The history is taken
            <span className="italic text-[#e8d5a3]"> before </span>
            the door opens.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#f6f0e4]/82">
            Patients speak or tap through a full clinical interview, scan old papers, and walk in
            with a physician-ready summary. Two-minute consultations stop being two-minute interrogations.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login/patient"
              className="rounded-full bg-[#f6f0e4] px-6 py-3.5 text-base font-semibold text-[#08363a]"
            >
              Start patient intake
            </Link>
            <Link
              href="/login/staff"
              className="rounded-full border border-[#f6f0e4]/30 px-6 py-3.5 text-base text-[#f6f0e4]"
            >
              Review today&apos;s queue
            </Link>
          </div>
          <dl className="mt-12 grid max-w-3xl grid-cols-3 gap-6 border-t border-white/15 pt-6 text-sm">
            <div>
              <dt className="text-[#e8d5a3]/80">OPD load</dt>
              <dd className="serif mt-1 text-2xl">4k–10k / day</dd>
            </div>
            <div>
              <dt className="text-[#e8d5a3]/80">Consult time now</dt>
              <dd className="serif mt-1 text-2xl">~2 minutes</dd>
            </div>
            <div>
              <dt className="text-[#e8d5a3]/80">History yield</dt>
              <dd className="serif mt-1 text-2xl">70–80%</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 md:px-10">
        <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">The first-mile problem</p>
        <h2 className="serif mt-3 max-w-3xl text-4xl leading-tight md:text-5xl">
          Registration captures a name. Medicine needs a story.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            {
              k: "01",
              t: "No time to ask",
              d: "Tertiary OPDs collapse history into a sentence. Comorbidities, drugs and red flags go unasked.",
            },
            {
              k: "02",
              t: "Paper in plastic bags",
              d: "Handwritten prescriptions, disordered labs, three languages. The physician leafs while the queue grows.",
            },
            {
              k: "03",
              t: "AYUSH needs more, not less",
              d: "Dashavidha Pariksha cannot live in a two-minute slot. Prakriti and Agni get guessed, not elicited.",
            },
          ].map((card) => (
            <article key={card.k} className="rounded-[28px] border border-[#1b1712]/8 bg-[#fffdf7] p-7 shadow-[0_20px_50px_rgba(27,23,18,0.06)]">
              <span className="text-xs tracking-[0.2em] text-[#c9842a]">{card.k}</span>
              <h3 className="mt-3 text-xl font-semibold">{card.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#4a4338]">{card.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#08363a] text-[#f6f0e4]">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:px-10">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#e8d5a3]">Five steps, no staff desk</p>
            <h2 className="serif mt-3 text-4xl leading-tight">A kiosk journey any first-time patient can finish.</h2>
            <ol className="mt-8 space-y-5">
              {[
                ["Identify", "ABHA, Aadhaar last-4, or a new registration. Language first."],
                ["Consent", "Granular, revocable, with audio explanation for low-literacy users."],
                ["Converse", "Voice or tap. Adaptive SOCRATES, ROS, and AYUSH branches."],
                ["Scan", "Prescriptions, labs, discharge notes — dated, extracted, flagged."],
                ["Route", "Structured draft lands on the physician screen and the HIS / ABHA locker."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8d5a3] text-sm font-semibold text-[#08363a]">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#f6f0e4]/75">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative min-h-[420px] overflow-hidden rounded-[32px]">
            <Image src="/images/scan-docs.jpg" alt="Scanning prior medical papers" fill className="object-cover" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 md:px-10">
        <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">Four modules</p>
        <h2 className="serif mt-3 text-4xl">Software that behaves like a careful intern.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {[
            {
              t: "A · Conversational history",
              d: "Dual-mode questions. Chest pain opens SOCRATES. Stroke signs escalate to triage instead of a token.",
            },
            {
              t: "B · Document intelligence",
              d: "OCR-style extraction of diagnoses, doses and labs. Out-of-range values glow before the doctor asks.",
            },
            {
              t: "C · Physician-ready draft",
              d: "Chief complaint through ROS, bilingual confirmation, fully editable. Never an autonomous diagnosis.",
            },
            {
              t: "D · Consent & ABDM",
              d: "DPDP-first capture. FHIR document bundle pushed to HIS and optionally linked to the ABHA PHR.",
            },
          ].map((m) => (
            <article key={m.t} className="rounded-[28px] bg-[#1b1712] p-8 text-[#f6f0e4]">
              <h3 className="text-xl font-semibold text-[#e8d5a3]">{m.t}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#f6f0e4]/78">{m.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 md:grid-cols-2 md:px-10">
        <div className="relative min-h-[360px] overflow-hidden rounded-[32px]">
          <Image src="/images/ayush-opd.jpg" alt="Ayurvedic OPD" fill className="object-cover" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">AYUSH mode</p>
          <h2 className="serif mt-3 text-4xl leading-tight">Dashavidha Pariksha, without the abbreviation.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[#4a4338]">
            Prakriti, Agni, Koshtha, Ahara-Vihara, Sattva, Vyayama Shakti and Nidana are elicited in
            the same voice-or-tap grammar as an allopathic HPI. The vaidya receives a structured
            assessment, not a blank sheet.
          </p>
        </div>
      </section>

      <footer className="border-t border-[#1b1712]/10 px-6 py-10 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6">
          <div>
            <BrandMark />
            <p className="mt-3 max-w-md text-sm text-[#4a4338]">
              Draft histories only. The physician accepts, amends or rejects. Session scratch data
              can be cleared after HIS push. Built for noisy OPDs, elderly hands, and first-time users.
            </p>
          </div>
          <p className="text-xs text-[#4a4338]">
            Aligns with ABDM FHIR exchange · Digital Personal Data Protection Act, 2023
          </p>
        </div>
      </footer>
    </main>
  );
}
