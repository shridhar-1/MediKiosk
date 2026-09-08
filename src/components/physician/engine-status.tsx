"use client";

// 🔌 Engine Status Pill — surfaces /api/ai-status as a visible honesty widget
// on the physician console. Green = LIVE engine on this deployment, amber =
// that lane is off (the router falls to the next lane), and the note reminds
// the viewer that the deterministic rules floor always runs regardless.
// Never leaks key values — the API returns booleans only.

import { useEffect, useState } from "react";

type Status = {
  engines: Record<string, boolean>;
  models: Record<string, string>;
} | null;

const LANES = [
  { key: "groq", label: "Groq" },
  { key: "gemini", label: "Gemini" },
  { key: "ollama", label: "Ollama" },
  { key: "bhashini", label: "Bhashini" },
];

export function EngineStatus() {
  const [data, setData] = useState<Status>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d: Status) => {
        if (alive) setData(d);
      })
      .catch(() => {
        /* offline / not deployed — leave null, pill shows "rules floor only" */
      });
    return () => {
      alive = false;
    };
  }, []);

  const anyLive = data ? LANES.some((l) => data.engines[l.key]) : false;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-[#08363a] px-3 py-1.5 text-[11px] text-[#f6f0e4]"
      title="Transparency: shows which AI lanes are LIVE on this deployment. Missing lanes just fall back — the deterministic rules engine always runs."
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${anyLive ? "bg-[#2e9e6b]" : "bg-[#c9842a]"}`}
      />
      <span className="font-semibold">AI</span>
      {LANES.map((l) => {
        const live = data?.engines?.[l.key];
        return (
          <span
            key={l.key}
            className={live ? "text-[#9fe6c2]" : "text-[#f6f0e4]/40"}
            title={`${l.label} ${live ? "LIVE" : "off → next lane"}`}
          >
            {l.label}
          </span>
        );
      })}
      <span className="text-[#f6f0e4]/50">· rules floor on</span>
    </div>
  );
}