// 🧠 AI Insights — longitudinal pattern detection across this patient's
// visits. Deterministic rules (no LLM, no invention): every line shows the
// evidence it came from. Server component — no client JS needed.

export type VisitFact = {
  date: Date;
  complaint: string; // chief complaint (may be empty early in intake)
  department: string;
  priority: string;
  redFlag: boolean;
};

const STOP = new Set([
  "since", "morning", "evening", "night", "pain", "having", "feeling",
  "about", "severe", "mild", "days", "weeks", "months", "years", "with",
]);

function keyWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !STOP.has(w)),
  );
}

export function AiInsights({
  patientName,
  visits,
  currentComplaint,
}: {
  patientName: string;
  visits: VisitFact[]; // ALL visits including the current one, newest first
  currentComplaint: string;
}) {
  const [current, ...past] = visits;
  const lines: { icon: string; text: string }[] = [];

  if (!current) return null;

  if (past.length > 0) {
    lines.push({
      icon: "🔁",
      text: `${past.length} earlier ${past.length === 1 ? "visit" : "visits"} on file — first seen ${new Date(
        past[past.length - 1].date,
      ).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`,
    });

    // Recurring-complaint match: shared significant word with THIS complaint
    const currentWords = keyWords(currentComplaint || current.complaint);
    if (currentWords.size > 0) {
      const matches = past.filter((p) => {
        const words = keyWords(p.complaint);
        for (const w of words) if (currentWords.has(w)) return true;
        return false;
      });
      if (matches.length > 0) {
        const dates = matches
          .slice(0, 3)
          .map((m) => new Date(m.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))
          .join(", ");
        lines.push({
          icon: "⚠️",
          text: `Same complaint area as ${matches.length} earlier ${matches.length === 1 ? "visit" : "visits"} (${dates}) — consider a chronic or recurring problem.`,
        });
      }
    }

    const last = past[0];
    const days = Math.floor((current.date.getTime() - last.date.getTime()) / 86_400_000);
    if (days <= 30) {
      lines.push({
        icon: "📅",
        text: `Returned within ${days} ${days === 1 ? "day" : "days"} of the last visit — quick return visits often mean unresolved illness.`,
      });
    }

    const redFlags = past.filter((p) => p.redFlag).length;
    if (redFlags > 0) {
      lines.push({
        icon: "🚨",
        text: `Red-flagged in ${redFlags} previous ${redFlags === 1 ? "visit" : "visits"} — the pattern matters more than any single visit.`,
      });
    }
  } else {
    lines.push({ icon: "✨", text: "First visit on record — no history to compare yet." });
  }

  return (
    <section className="mt-6 rounded-[24px] border border-[#c9842a]/30 bg-[#fff9ef] p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[#8a5a13]">
          🧠 AI Insights — {patientName}
        </h2>
        <span
          className="rounded-full bg-[#f6f0e4] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4a4338]"
          title="Computed by deterministic rules over visit history — no LLM involved"
        >
          rules · not LLM
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-[#1b1712]">
            <span aria-hidden>{l.icon}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}