"use client";

// ✨ AI-First Hero — the homepage sells itself in 5 seconds:
// LEFT  a messy handwritten prescription (SVG mock — squiggles, tape, stamp)
// RIGHT the structured digital record building itself field by field
// BADGE "✨ AI extracted this in 2.4s" — then it loops forever.
// No external assets, no network calls — pure CSS/SVG animation.

import { useEffect, useState } from "react";
import { Sparkles, FileWarning } from "lucide-react";

const FIELDS: { label: string; value: string; warn?: boolean }[] = [
  { label: "Patient", value: "Shivanna · 67 · Male" },
  { label: "Diagnosis", value: "Type 2 Diabetes + Hypertension" },
  { label: "Medicines", value: "Metformin 500 mg twice a day · Telmisartan 40 mg once a day" },
  { label: "Allergy", value: "Penicillin", warn: true },
  { label: "Last HbA1c", value: "8.9% — high" },
];

const REVEAL_MS = 480; // per field → 5 fields ≈ 2.4 s

export function AiHero() {
  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let hold: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      setRevealed(0);
      setDone(false);
      hold = setTimeout(() => {
        interval = setInterval(() => {
          setRevealed((r) => {
            if (r >= FIELDS.length) {
              if (interval) clearInterval(interval);
              setDone(true);
              hold = setTimeout(start, 3400); // let it sink in, then loop
              return r;
            }
            return r + 1;
          });
        }, REVEAL_MS);
      }, 900); // "scan" pause first
    };
    start();
    return () => {
      clearTimeout(hold);
      if (interval) clearInterval(interval);
    };
  }, []);

  const seconds = (Math.min(revealed, FIELDS.length) * (REVEAL_MS / 1000)).toFixed(1);

  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
      {/* ── LEFT: the messy prescription photo ─────────────────────────── */}
      <div className="relative mx-auto w-full max-w-sm rotate-[-2deg]">
        {/* tape strips */}
        <div className="absolute -top-3 left-8 z-10 h-6 w-24 rotate-[-8deg] bg-[#e8d5a3]/70 shadow-sm" />
        <div className="absolute -top-2 right-10 z-10 h-6 w-20 rotate-[6deg] bg-[#e8d5a3]/70 shadow-sm" />
        <div className="rounded-lg bg-[#fffdf7] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
          {/* prescription head */}
          <div className="flex items-start justify-between border-b border-dashed border-[#1b1712]/25 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1b1712]/70">
                Govt. District Hospital
              </p>
              <p className="text-[10px] text-[#1b1712]/50">OPD · General Medicine</p>
            </div>
            <p className="serif text-3xl font-bold text-[#08363a]">℞</p>
          </div>
          {/* handwriting squiggles (SVG) */}
          <svg viewBox="0 0 300 170" className="mt-3 w-full" aria-label="handwritten prescription">
            <g stroke="#1b1712" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.82">
              <path d="M14 18 C40 8, 66 26, 92 15 S 140 20, 166 12" />
              <path d="M180 16 C205 8, 230 22, 256 14" />
              <path d="M14 44 C48 36, 70 52, 108 42 S 168 48, 212 40 S 268 46, 288 38" />
              <path d="M14 70 C52 62, 84 80, 128 70" />
              <path d="M150 68 C186 60, 214 76, 250 66" />
              <path d="M14 96 C40 88, 60 104, 88 94 S 132 100, 158 92" />
              <path d="M14 122 C50 114, 90 130, 130 120 S 210 126, 252 116" />
              <path d="M14 148 C60 140, 100 156, 150 146" />
            </g>
            {/* circled "signature" */}
            <g stroke="#08363a" strokeWidth="1.6" fill="none" opacity="0.75">
              <ellipse cx="238" cy="148" rx="42" ry="14" />
              <path d="M214 148 C224 138, 234 156, 244 144 S 258 152, 264 146" stroke="#1b1712" />
            </g>
          </svg>
          {/* round stamp */}
          <div className="absolute bottom-4 left-4 flex h-16 w-16 rotate-[14deg] items-center justify-center rounded-full border-2 border-[#b42318]/60 text-center opacity-70">
            <p className="text-[7px] font-bold uppercase leading-tight text-[#b42318]">
              District
              <br />
              Hospital
              <br />
              2026
            </p>
          </div>
          {/* scanning shimmer while reading */}
          {!done && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
              <div className="scanline absolute left-0 h-16 w-full bg-gradient-to-b from-transparent via-[#0f5c61]/25 to-transparent" />
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-[#f6f0e4]/50">
          The reality today — unreadable, unsearchable paper
        </p>
      </div>

      {/* ── arrow ────────────────────────────────────────────────────────── */}
      <div className="hidden justify-center text-[#e8d5a3] md:flex">
        <Sparkles className="h-8 w-8 animate-pulse" />
      </div>

      {/* ── RIGHT: the structured record building itself ─────────────────── */}
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-[26px] bg-[#fffdf7] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] ring-1 ring-[#0f5c61]/20">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f5c61]">
              MediKiosk · Digital record
            </p>
            <span className="rounded-full bg-[#f6f0e4] px-2 py-0.5 text-[10px] font-semibold text-[#4a4338]">
              ✨ OCR + AI
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {FIELDS.map((f, i) => {
              const shown = i < revealed;
              return (
                <div key={f.label} className={shown ? "rise" : "opacity-100"}>
                  {shown ? (
                    <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#1b1712]/10 pb-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c9842a]">
                        {f.label}
                      </span>
                      <span className="flex items-center gap-1.5 text-right text-sm font-medium text-[#08363a]">
                        {f.warn && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#b42318]/10 px-2 py-0.5 text-[10px] font-bold text-[#b42318]">
                            <FileWarning className="h-3 w-3" /> allergy
                          </span>
                        )}
                        {f.value}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 border-b border-dashed border-[#1b1712]/10 pb-2">
                      <span className="h-2.5 w-14 rounded bg-[#1b1712]/10" />
                      <span className="h-3 w-40 rounded bg-[#1b1712]/10" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* the money line */}
          <div className="mt-5 text-center">
            {done ? (
              <p className="rise inline-flex items-center gap-2 rounded-full bg-[#08363a] px-4 py-2 text-sm font-bold text-[#e8d5a3]">
                <Sparkles className="h-4 w-4" /> AI extracted this in 2.4 s
              </p>
            ) : (
              <p className="text-sm font-medium tabular-nums text-[#0f5c61]">
                reading prescription… {seconds}s
              </p>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-[#f6f0e4]/50">
          What the doctor receives — searchable, translated, flagged
        </p>
      </div>
    </div>
  );
}