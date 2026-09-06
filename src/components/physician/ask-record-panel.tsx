"use client";

// 🧠 Ask-the-Record — the doctor questions the patient's own data.
// The AI (or, without a key, an honest record-search) answers ONLY from the
// record and cites the fields used. This is the panel that turns the doctor
// screen from a case viewer into an assistant.

import { useState } from "react";
import { BrainCircuit, Send } from "lucide-react";

type Answer = {
  answer: string;
  sources: string[];
  engine: string;
  aiUsed: boolean;
};

const SUGGESTED = [
  "Any allergies or medication conflicts?",
  "Has this patient visited before, and for what?",
  "Summarise the past visits in two lines.",
];

export function AskRecordPanel({ sessionId }: { sessionId: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<Answer | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setResult(data as Answer);
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-[24px] border border-[#0f5c61]/20 bg-[#f0f7f5] p-5">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-[#0f5c61]" />
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[#0f5c61]">
          Ask this patient&rsquo;s record
        </h2>
      </div>
      <p className="mt-1 text-xs text-[#4a4338]">
        Answers come only from this record, with the fields it used. Nothing outside it.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Is there any past history of the same complaint?"
          className="flex-1 rounded-full border border-[#1b1712]/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#0f5c61]"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0f5c61] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#08363a] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQ(s);
              void ask(s);
            }}
            disabled={busy}
            className="rounded-full bg-white px-3 py-1 text-xs text-[#0f5c61] ring-1 ring-[#0f5c61]/25 transition hover:bg-[#dceee8] disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {err && <p className="mt-3 text-xs text-[#b42318]">{err}</p>}

      {result && (
        <div className="mt-4 rounded-2xl border border-[#1b1712]/10 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                result.aiUsed ? "bg-[#e8d5a3] text-[#08363a]" : "bg-[#f6f0e4] text-[#4a4338]"
              }`}
              title={result.engine}
            >
              {result.aiUsed ? `🤖 ${result.engine}` : "📋 record-search (no AI key)"}
            </span>
            {result.sources.length > 0 && (
              <span className="text-[10px] uppercase tracking-wider text-[#4a4338]/70">
                from: {result.sources.join(" · ")}
              </span>
            )}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#1b1712]">
            {result.answer}
          </p>
        </div>
      )}
    </section>
  );
}