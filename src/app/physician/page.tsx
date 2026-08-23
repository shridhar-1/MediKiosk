import Link from "next/link";
import { redirect } from "next/navigation";
import { staffOrDemo } from "@/lib/auth";
import { db } from "@/db";
import { clinicalSummaries, patients, sessions } from "@/db/schema";
import { PhysicianNav } from "@/components/physician/nav";
import { seedIfEmpty } from "@/lib/seed";
import { DEPARTMENTS } from "@/lib/types";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function deptLabel(id: string) {
  return DEPARTMENTS.find((d) => d.id === id)?.label ?? id;
}

function minutesAgo(date: Date | null) {
  if (!date) return "—";
  const m = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export default async function PhysicianQueuePage() {
  await seedIfEmpty();
  const member = await staffOrDemo();
  if (!member) redirect("/login/staff");

  const rows = await db
    .select({
      session: sessions,
      patient: patients,
      summary: clinicalSummaries,
    })
    .from(sessions)
    .innerJoin(patients, eq(sessions.patientId, patients.id))
    .leftJoin(clinicalSummaries, eq(clinicalSummaries.sessionId, sessions.id))
    .orderBy(desc(sessions.startedAt));

  const waiting = rows.filter((r) => r.session.status === "submitted" || r.session.status === "summary");
  const done = rows.filter((r) => r.session.status === "reviewed");
  const emergencies = waiting.filter((r) => r.session.priority === "emergency");

  return (
    <div className="min-h-screen">
      <PhysicianNav member={member} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">Consultation screen</p>
            <h1 className="serif mt-2 text-4xl">Today&apos;s digital intake</h1>
            <p className="mt-2 max-w-xl text-sm text-[#4a4338]">
              Histories arrive before the patient. Confirm, amend, or send back. Red flags skip the ordinary queue.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-2xl bg-[#fffdf7] px-4 py-3 ring-1 ring-[#1b1712]/8">
              <dt className="text-[#4a4338]">Waiting</dt>
              <dd className="serif text-2xl">{waiting.length}</dd>
            </div>
            <div className="rounded-2xl bg-[#fffdf7] px-4 py-3 ring-1 ring-[#1b1712]/8">
              <dt className="text-[#4a4338]">Emergency</dt>
              <dd className="serif text-2xl text-[#b42318]">{emergencies.length}</dd>
            </div>
            <div className="rounded-2xl bg-[#fffdf7] px-4 py-3 ring-1 ring-[#1b1712]/8">
              <dt className="text-[#4a4338]">Confirmed</dt>
              <dd className="serif text-2xl">{done.length}</dd>
            </div>
          </dl>
        </div>

        {emergencies.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[#b42318]">Triage now</h2>
            <div className="mt-3 grid gap-3">
              {emergencies.map((row) => (
                <QueueRow key={row.session.id} row={row} accent="emergency" />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#0f5c61]">Waiting for review</h2>
          <div className="mt-3 grid gap-3">
            {waiting
              .filter((r) => r.session.priority !== "emergency")
              .map((row) => (
                <QueueRow key={row.session.id} row={row} accent={row.session.priority === "urgent" ? "urgent" : "routine"} />
              ))}
            {waiting.filter((r) => r.session.priority !== "emergency").length === 0 && (
              <p className="rounded-3xl bg-[#fffdf7] px-5 py-8 text-sm text-[#4a4338]">No routine patients waiting.</p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#4a4338]">Confirmed into HIS</h2>
          <div className="mt-3 grid gap-3">
            {done.map((row) => (
              <QueueRow key={row.session.id} row={row} accent="done" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function QueueRow({
  row,
  accent,
}: {
  row: {
    session: typeof sessions.$inferSelect;
    patient: typeof patients.$inferSelect;
    summary: typeof clinicalSummaries.$inferSelect | null;
  };
  accent: "emergency" | "urgent" | "routine" | "done";
}) {
  const ring =
    accent === "emergency"
      ? "ring-[#b42318]/40 bg-[#fff5f3]"
      : accent === "urgent"
        ? "ring-[#c9842a]/35 bg-[#fff9ef]"
        : "ring-[#1b1712]/8 bg-[#fffdf7]";

  return (
    <Link
      href={`/physician/${row.session.id}`}
      className={`grid gap-4 rounded-[24px] p-5 ring-1 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(27,23,18,0.08)] md:grid-cols-[auto_1fr_auto] ${ring}`}
    >
      <div className="ticket flex min-w-28 flex-col items-center justify-center rounded-2xl px-4 py-3">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#4a4338]">Token</span>
        <span className="serif text-2xl text-[#08363a]">{row.session.tokenNumber}</span>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{row.patient.fullName}</h3>
          <span className="text-sm text-[#4a4338]">
            {row.patient.age} / {row.patient.gender}
          </span>
          {row.session.mode === "ayush" && (
            <span className="rounded-full bg-[#08363a] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#e8d5a3]">
              AYUSH
            </span>
          )}
          <span className="rounded-full bg-[#f6f0e4] px-2 py-0.5 text-[10px] uppercase tracking-wider">
            {row.session.priority}
          </span>
        </div>
        <p className="mt-1 text-sm text-[#1b1712]">{row.summary?.chiefComplaint ?? "Interview in progress"}</p>
        <p className="mt-1 text-xs text-[#4a4338]">
          {deptLabel(row.session.department)} · {row.patient.preferredLanguage.toUpperCase()} ·{" "}
          {row.patient.abhaId ? `ABHA ${row.patient.abhaId}` : "No ABHA"} · {minutesAgo(row.session.submittedAt ?? row.session.startedAt)}
        </p>
        {row.session.redFlagTriggered && row.session.redFlagReasons?.[0] && (
          <p className="mt-2 text-xs font-medium text-[#b42318]">{row.session.redFlagReasons[0]}</p>
        )}
      </div>
      <div className="self-center text-sm text-[#0f5c61]">{accent === "done" ? "Open note" : "Review draft →"}</div>
    </Link>
  );
}
