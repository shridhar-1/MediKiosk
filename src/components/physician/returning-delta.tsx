// 🔄 Returning-Delta Panel (server component).
// Shown on a physician's session page when the patient has a PRIOR
// summarized visit. It surfaces the stable, carry-forward history (past
// medical / surgical, drugs, allergies, family) from that last visit so the
// doctor can see in seconds what is "known already" vs new today — without
// re-reading every chart. Presentational only; the DB query runs in the page.

import { DEPARTMENTS } from "@/lib/types";

export type DeltaCarryField = { label: string; value: string };

export function ReturningDelta({
  priorToken,
  visitedAt,
  department,
  mode,
  carried,
  currentSummaryHas,
}: {
  priorToken: string | null;
  visitedAt: Date;
  department: string;
  mode: string;
  carried: DeltaCarryField[];
  currentSummaryHas?: (label: string) => boolean;
}) {
  const dept = DEPARTMENTS.find((d) => d.id === department);
  return (
    <div className="rounded-[24px] border border-[#0f5c61]/15 bg-gradient-to-br from-[#eaf4f1] to-[#f6f0e4]/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-bold text-[#08363a]">
          🔄 Returning patient
        </p>
        <span className="rounded-full bg-[#0f5c61] px-2.5 py-0.5 text-[11px] font-semibold text-white">
          Last: {priorToken ?? "OPD"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#4a4338]">
        Prior {mode === "ayush" ? "AYUSH" : "Allopathy"} visit · {dept?.label ?? department} ·{" "}
        {visitedAt.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>

      {carried.length > 0 ? (
        <>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#c9842a]">
            Carried forward from last visit (doctor can confirm "no change")
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {carried.map((c) => (
              <div key={c.label} className="rounded-xl bg-white/70 px-3 py-2 text-xs ring-1 ring-black/5">
                <span className="font-bold text-[#08363a]">{c.label}</span>
                <span className="mt-0.5 block leading-relaxed text-[#1b1712]">{c.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs text-[#4a4338]">
          A prior visit exists but has no carried-forward summary fields yet.
        </p>
      )}
    </div>
  );
}