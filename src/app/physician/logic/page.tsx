import { redirect } from "next/navigation";
import { staffOrDemo } from "@/lib/auth";
import { PhysicianNav } from "@/components/physician/nav";
import { RED_FLAG_RULES, TEXT_RULES, EMERGENCY_OPTIONS } from "@/lib/redflags";
import type { Staff } from "@/db/schema";

export const dynamic = "force-dynamic";

const LAYERS = [
  {
    n: "1",
    title: "Deterministic rules on structured answers",
    body: "Every answer the patient taps is checked against the rule table below (chief complaint + associated symptoms + onset, duration, site, character, radiation, severity). Runs in milliseconds on every save.",
  },
  {
    n: "1b",
    title: "Speech & free-text screening",
    body: "Everything the patient says or types (English, Hindi, Hinglish) is screened with keyword-combination rules, because red flags are often narrated rather than tapped. Merged with Layer 1, never allowed to lower a verdict.",
  },
  {
    n: "2",
    title: "LLM adjudication (gray zone)",
    body: "During summary generation the LLM may raise a red flag for ambiguous narrations. It can escalate — it can never silently clear a flag raised by the rules.",
  },
  {
    n: "3",
    title: "Safety reconciliation & audit",
    body: "Any layer saying 'emergency' wins. The final priority, every fired rule ID and its evidence are stored on the session and shown here and on the queue card — so anyone can answer 'why was this flagged?'",
  },
];

const ESCALATION = [
  {
    priority: "EMERGENCY",
    style: "bg-red-50 text-red-800 ring-red-200",
    queue: "Skips the queue entirely",
    actions: "Triage desk paged immediately (console banner + browser notification + email + WhatsApp/SMS) · stat ECG / vitals on arrival · RED token prefix",
  },
  {
    priority: "URGENT",
    style: "bg-amber-50 text-amber-800 ring-amber-200",
    queue: "Head of the routine queue",
    actions: "Vitals at triage before consultation · flagged on the physician queue card",
  },
  {
    priority: "ROUTINE",
    style: "bg-teal-50 text-teal-800 ring-teal-200",
    queue: "Normal FIFO queue",
    actions: "Standard OPD flow · history summary still delivered to the consultation screen",
  },
];

export default async function EmergencyLogicPage() {
  const member: Staff | null = await staffOrDemo();
  if (!member) redirect("/login/staff");

  return (
    <div className="min-h-screen">
      <PhysicianNav member={member} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">Clinical safety · explainability</p>
        <h1 className="serif mt-2 text-4xl">How MediKiosk classifies an emergency</h1>
        <p className="mt-3 max-w-2xl text-sm text-[#4a4338]">
          This page is generated directly from the rule table in the source code
          (<code className="rounded bg-[#1b1712]/5 px-1.5 py-0.5 text-xs">src/lib/redflags.ts</code>) — the
          explanation and the behaviour can never drift apart. Rules are data, so clinicians can review or extend
          them without touching application logic.
        </p>

        {/* Layers */}
        <section className="mt-10 grid gap-4 md:grid-cols-2">
          {LAYERS.map((l) => (
            <div key={l.n} className="rounded-2xl bg-[#fffdf7] p-5 ring-1 ring-[#1b1712]/10">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#0f5c61]">Layer {l.n}</p>
              <h2 className="mt-1 text-lg font-semibold text-[#1b1712]">{l.title}</h2>
              <p className="mt-2 text-sm text-[#4a4338]">{l.body}</p>
            </div>
          ))}
        </section>

        {/* Rule table */}
        <section className="mt-12">
          <h2 className="serif text-2xl">Layer 1 — structured-answer rule table</h2>
          <p className="mt-1 text-sm text-[#4a4338]">A rule fires when any of its trigger rows is satisfied.</p>
          <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-[#1b1712]/10">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-[#08363a] text-[#fffdf7]">
                <tr>
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Rule</th>
                  <th className="px-4 py-3 font-semibold">Fires when</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Automatic action</th>
                </tr>
              </thead>
              <tbody>
                {RED_FLAG_RULES.map((r, i) => (
                  <tr key={r.id} className={i % 2 ? "bg-[#fffdf7]" : "bg-white"}>
                    <td className="px-4 py-3 font-mono text-xs text-[#0f5c61]">{r.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1b1712]">{r.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-[#4a4338]">{r.category}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4a4338]">
                      <ul className="list-disc space-y-1 pl-4">
                        {r.tests.map((t) => (
                          <li key={t.label}>{t.label}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ring-1 ${
                          r.priority === "emergency"
                            ? "bg-red-50 text-red-800 ring-red-200"
                            : "bg-amber-50 text-amber-800 ring-amber-200"
                        }`}
                      >
                        {r.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4a4338]">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#4a4338]">
            Fallback <span className="font-mono text-[#0f5c61]">RF-SINGLE-99</span>: if any single hard red-flag
            option ({[...EMERGENCY_OPTIONS].slice(0, 5).join(", ")} …) is ticked but no combination rule fires,
            the session is still marked <b>urgent</b> — never silently routine.
          </p>
        </section>

        {/* Speech rules */}
        <section className="mt-12">
          <h2 className="serif text-2xl">Layer 1b — speech &amp; free-text screening</h2>
          <p className="mt-1 text-sm text-[#4a4338]">
            Multi-language keyword groups (English · हिन्दी · Hinglish). Groups joined by AND — e.g. ACS requires
            a chest-pain phrase <i>and</i> a modifier phrase.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {TEXT_RULES.map((r) => (
              <div key={r.id + r.name} className="rounded-2xl bg-[#fffdf7] p-4 ring-1 ring-[#1b1712]/10">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#1b1712]">
                    <span className="mr-2 font-mono text-xs text-[#0f5c61]">{r.id}</span>
                    {r.name}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${
                      r.priority === "emergency" ? "bg-red-50 text-red-800 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200"
                    }`}
                  >
                    {r.priority}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-[#4a4338]">
                  {r.anyOf.map((group, gi) => (
                    <li key={gi}>
                      <span className="font-semibold">{String.fromCharCode(65 + gi)}:</span> {group.slice(0, 6).join(" · ")}
                      {group.length > 6 ? " · …" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Escalation */}
        <section className="mt-12">
          <h2 className="serif text-2xl">What each priority triggers</h2>
          <div className="mt-5 space-y-3">
            {ESCALATION.map((e) => (
              <div key={e.priority} className="flex flex-wrap items-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-[#1b1712]/10">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${e.style}`}>{e.priority}</span>
                <div className="min-w-[220px] flex-1">
                  <p className="font-semibold text-[#1b1712]">{e.queue}</p>
                  <p className="mt-1 text-sm text-[#4a4338]">{e.actions}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Principles */}
        <section className="mt-12 rounded-2xl bg-[#08363a] p-6 text-[#fffdf7]">
          <h2 className="serif text-2xl">Safety principles</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#dfe9e9]">
            <li><b>Fail-safe:</b> unknown or missing input can never downgrade a fired emergency; escalation always wins over de-escalation.</li>
            <li><b>Physician-in-the-loop:</b> flags change queue order and page staff — they never generate a diagnosis or prescribe.</li>
            <li><b>Explainable:</b> every verdict stores the rule IDs + evidence; this page and the queue card render them verbatim.</li>
            <li><b>Reviewed by clinicians:</b> the rule table is plain data (id, trigger, priority, action) — extensible without redeploying logic.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}