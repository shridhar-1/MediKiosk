import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff, staffOrDemo } from "@/lib/auth";
import { db } from "@/db";
import { clinicalSummaries, patients, sessions } from "@/db/schema";
import { PhysicianNav } from "@/components/physician/nav";
import { DeleteSessionButton } from "@/components/physician/delete-session-button";
import { seedIfEmpty } from "@/lib/seed";
import { DEPARTMENTS } from "@/lib/types";
import { desc, eq } from "drizzle-orm";
import { DeletePatientButton } from "@/components/physician/delete-patient-button";

export const dynamic = "force-dynamic";

function deptLabel(id: string) {
  return DEPARTMENTS.find((d) => d.id === id)?.label ?? id;
}

function fmtDate(date: Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HospitalRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await seedIfEmpty();
  const member = (await currentStaff()) ?? (await staffOrDemo());
  if (!member) redirect("/login/staff");

  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const statusFilter = params.status ?? "all";

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

  let filtered = rows;
  if (statusFilter !== "all") {
    filtered = filtered.filter((r) => r.session.status === statusFilter);
  }
  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.patient.fullName.toLowerCase().includes(q) ||
        (r.patient.phone ?? "").includes(q) ||
        (r.patient.abhaId ?? "").toLowerCase().includes(q) ||
        (r.session.tokenNumber ?? "").toLowerCase().includes(q) ||
        (r.summary?.chiefComplaint ?? "").toLowerCase().includes(q),
    );
  }

  const isAdmin = member.role === "admin";

  return (
    <div className="min-h-screen">
      <PhysicianNav member={member} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">Hospital authority</p>
            <h1 className="serif mt-2 text-4xl">Submission history</h1>
            <p className="mt-2 max-w-xl text-sm text-[#4a4338]">
              Every intake across the hospital. Delete individual submissions, or —{" "}
              <strong className={isAdmin ? "" : "opacity-50"}>admin only</strong> — wipe an entire patient record.
            </p>
          </div>
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search name, phone, ABHA, token…"
              className="h-11 rounded-full border border-[#1b1712]/12 bg-white px-4 text-sm outline-none focus:border-[#08363a]"
            />
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-11 rounded-full border border-[#1b1712]/12 bg-white px-4 text-sm outline-none focus:border-[#08363a]"
            >
              <option value="all">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="summary">Summary</option>
              <option value="reviewed">Reviewed</option>
              <option value="interview">In progress</option>
            </select>
            <button
              type="submit"
              className="h-11 rounded-full bg-[#08363a] px-5 text-sm font-semibold text-white"
            >
              Filter
            </button>
          </form>
        </div>

        <p className="mt-6 text-sm text-[#4a4338]">
          {filtered.length} record{filtered.length === 1 ? "" : "s"} · shown to{" "}
          <strong>{member.fullName}</strong> ({member.role})
        </p>

        <section className="mt-5 space-y-3">
          {filtered.length === 0 && (
            <p className="rounded-3xl bg-[#fffdf7] px-5 py-8 text-sm text-[#4a4338]">
              No records match this filter.
            </p>
          )}

          {filtered.map((row) => (
            <article
              key={row.session.id}
              className="rounded-[24px] bg-[#fffdf7] p-5 ring-1 ring-[#1b1712]/8"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="ticket flex min-w-24 flex-col items-center justify-center rounded-2xl px-4 py-2">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#4a4338]">Token</span>
                    <span className="serif text-xl text-[#08363a]">{row.session.tokenNumber}</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{row.patient.fullName}</h3>
                      <span className="text-sm text-[#4a4338]">
                        {row.patient.age} / {row.patient.gender} · {row.patient.phone ?? "no phone"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                          row.session.status === "reviewed"
                            ? "bg-[#1f6b45]/10 text-[#1f6b45]"
                            : row.session.status === "submitted" || row.session.status === "summary"
                              ? "bg-[#c9842a]/15 text-[#8a5a18]"
                              : "bg-[#f6f0e4] text-[#4a4338]"
                        }`}
                      >
                        {row.session.status}
                      </span>
                      {row.session.priority === "emergency" && (
                        <span className="rounded-full bg-[#b42318]/10 px-2 py-0.5 text-[10px] uppercase font-bold text-[#b42318]">
                          Emergency
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[#1b1712]">
                      {row.summary?.chiefComplaint ?? "Interview in progress"}
                    </p>
                    <p className="mt-1 text-xs text-[#4a4338]">
                      {deptLabel(row.session.department)} · {row.session.mode} · {fmtDate(row.session.startedAt)}
                      {row.session.reviewedBy ? ` · reviewed by ${row.session.reviewedBy}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/physician/${row.session.id}`}
                    className="inline-flex items-center rounded-full bg-[#f6f0e4] px-4 py-2 text-xs font-semibold text-[#08363a] hover:bg-[#efe4cf]"
                  >
                    Open
                  </Link>
                  <DeleteSessionButton sessionId={row.session.id} label="Delete" />
                </div>
              </div>
            </article>
          ))}

          {isAdmin && filtered.length > 0 && (
            <div className="mt-8 rounded-[28px] border border-[#b42318]/20 bg-[#fff5f3] p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-[#b42318]">Hospital authority</p>
              <h2 className="serif mt-1 text-2xl">Delete whole patient record</h2>
              <p className="mt-1 text-sm text-[#4a4338]">
                Permanently remove a patient from the system together with all of their intakes,
                answers, documents and summaries. This is reversible only by restoring a database backup.
              </p>
              <div className="mt-4 space-y-2">
                {Array.from(new Set(filtered.map((r) => r.patient.id))).map((pid) => {
                  const p = filtered.find((r) => r.patient.id === pid)!.patient;
                  return (
                    <div
                      key={pid}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#1b1712]/8"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {p.fullName} <span className="text-[#4a4338]">({p.age} / {p.gender})</span>
                        </p>
                        <p className="text-xs text-[#4a4338]">
                          {p.phone ?? "no phone"} {p.abhaId ? `· ABHA ${p.abhaId}` : "· no ABHA"}
                        </p>
                      </div>
                      <DeletePatientButton patientId={pid} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}