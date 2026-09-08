import Link from "next/link";
import Image from "next/image";
import { BrandMark } from "@/components/brand";
import { AiHero } from "@/components/home/ai-hero";
import { AiSummaryCard } from "@/components/home/ai-summary-card";
import { AyushSummaryCard } from "@/components/home/ayush-summary-card";
import { Capabilities } from "@/components/home/capabilities";
import { DemoLoginButton } from "@/components/auth/demo-login-button";
import { HeartPulse, Stethoscope } from "lucide-react";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function Home() {
  await seedIfEmpty();

  const doors = [
    {
      href: "/login/patient",
      icon: HeartPulse,
      eyebrow: "For patients & families",
      title: "Patient sign in",
      body: "Record your history before the queue, scan old papers, and collect your OPD token. Opens instantly.",
      image: "/images/hero-kiosk.jpg",
    },
    {
      href: "/login/staff",
      icon: Stethoscope,
      eyebrow: "For hospital authority",
      title: "Staff sign in",
      body: "Physicians, triage nurses and administrators access the consultation console and OPD queue.",
      image: "/images/physician-console.jpg",
    },
  ];

  return (
    <main className="kiosk-bezel min-h-screen px-5 py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/">
          <BrandMark light />
        </Link>

        {/* ── AI-FIRST HERO — the demo plays itself ─────────────────────── */}
        <h1 className="serif mt-10 max-w-3xl text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.02] text-[#f6f0e4]">
          Any paper. Any language. One clean record.
        </h1>
        <p className="mt-3 max-w-xl text-[#f6f0e4]/75">
          A villager&rsquo;s old prescription walks in as a photo — AI reads it, structures it,
          flags the dangers, and the doctor gets it before the patient sits down.
        </p>

        {/* ── dual-stream positioning chips ─────────────────────────────── */}
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffdf7]/10 px-3 py-1.5 text-xs font-semibold text-[#f6f0e4] ring-1 ring-[#f6f0e4]/20">
            🩺 Allopathy · AI triage
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffdf7]/10 px-3 py-1.5 text-xs font-semibold text-[#f6f0e4] ring-1 ring-[#f6f0e4]/20">
            🌿 AYUSH · Dashavidha &amp; Prakriti
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffdf7]/10 px-3 py-1.5 text-xs font-semibold text-[#f6f0e4] ring-1 ring-[#f6f0e4]/20">
            🌐 8+ Indian languages
          </span>
        </div>

        <div className="mt-10">
          <AiHero />
        </div>

        {/* ── THE ARTIFACT — what the doctor receives ────────────────────── */}
        <p className="mt-16 text-center text-[11px] uppercase tracking-[0.24em] text-[#f6f0e4]/50">
          Before the patient sits down, the doctor already has this
        </p>
        <div className="mt-5">
          <AiSummaryCard />
        </div>

        {/* ── SECOND PERSONA — the same kiosk in AYUSH mode ──────────────── */}
        <p className="mt-16 text-center text-[11px] uppercase tracking-[0.24em] text-[#f6f0e4]/50">
          Same kiosk · a routine AYUSH intake — proof it is not one hard-coded demo
        </p>
        <div className="mt-5">
          <AyushSummaryCard />
        </div>

        {/* ── CAPABILITIES — why the engineering matters ─────────────────── */}
        <Capabilities />

        {/* ── ONE-TAP INSTANT DEMO — judges never hunt for a login ───────── */}
        <div className="mt-12 rounded-[26px] bg-[#f6f0e4]/10 p-5 text-center ring-1 ring-[#f6f0e4]/20">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#e8d5a3]">
            Judges &amp; evaluators — try the real product now
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <DemoLoginButton
              role="patient"
              label="Instant demo — be a patient in 4 seconds"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#e8d5a3] px-7 py-4 text-base font-bold text-[#08363a] shadow-lg transition hover:bg-white disabled:opacity-60 sm:w-auto"
            />
            <DemoLoginButton
              role="staff"
              label="Open the doctor console"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0f5c61] px-7 py-4 text-base font-semibold text-white ring-1 ring-white/25 transition hover:bg-[#0a4549] disabled:opacity-60 sm:w-auto"
            />
          </div>
          <p className="mt-3 text-xs text-[#f6f0e4]/60">
            No OTP · no password · no signup. One tap and you are inside the live product.
          </p>
        </div>

        {/* ── PORTALS (secondary now — the hero sells first) ─────────────── */}
        <p className="mt-14 text-[11px] uppercase tracking-[0.24em] text-[#f6f0e4]/50">
          Select your portal
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {doors.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group relative overflow-hidden rounded-[30px] bg-[#fffdf7] p-1 transition hover:-translate-y-1"
            >
              <div className="relative h-32 overflow-hidden rounded-[26px]">
                <Image src={d.image} alt="" fill className="object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-[#08363a]/35" />
              </div>
              <div className="p-5">
                <d.icon className="h-6 w-6 text-[#0f5c61]" />
                <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[#c9842a]">{d.eyebrow}</p>
                <h2 className="serif mt-1 text-2xl">{d.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#4a4338]">{d.body}</p>
                <span className="mt-3 inline-block text-sm font-medium text-[#0f5c61]">Continue &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}