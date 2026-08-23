import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clinicalSummaries, sessions } from "@/db/schema";
import { BrandMark } from "@/components/brand";
import { LogoutButton } from "@/components/auth/logout-button";
import { patientOrDemo } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/seed";
import { DEPARTMENTS } from "@/lib/types";
import { desc, eq } from "drizzle-orm";
import { CalendarClock, FileHeart, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PatientPortal() {
  await seedIfEmpty();
  const patient = await patientOrDemo();
  if (!patient) redirect("/login/patient");

  const visits = await db
    .select({ session: sessions, summary: clinicalSummaries })
    .from(sessions)
    .leftJoin(clinicalSummaries, eq(clinicalSummaries.sessionId, sessions.id))
    .where(eq(sessions.patientId, patient.id))
    .orderBy(desc(sessions.startedAt));

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[#1b1712]/10 bg-[#fffdf7] px-6 py-4">
        <Link href="/">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-[#4a4338] sm:inline">{patient.fullName}</span>
          <LogoutButton kind="patient" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-xs uppercase tracking-[0.22em] text-[#c9842a]">Patient portal</p>
        <h1 className="serif mt-2 text-4xl">Namaste, {patient.fullName.split(" ")[0]}.</h1>
        <p className="mt-2 max-w-xl text-sm text-[#4a4338]">
          {patient.age} years · {patient.gender} ·{" "}
          {patient.abhaId ? `ABHA ${patient.abhaId}` : "ABHA not linked yet"}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            href="/kiosk"
            className="rounded-[28px] bg-[#0f5c61] p-7 text-[#f6f0e4] transition hover:-translate-y-0.5"
          >
            <FileHeart className="h-6 w-6 text-[#e8d5a3]" />
            <h2 className="serif mt-3 text-2xl">Start today&apos;s intake</h2>
            <p className="mt-2 text-sm text-[#f6f0e4]/78">
              Answer by voice or touch, scan old papers, and get your OPD token.
            </p>
          </Link>
          <div className="rounded-[28px] bg-[#fffdf7] p-7 ring-1 ring-[#1b1712]/8">
            <ShieldCheck className="h-6 w-6 text-[#0f5c61]" />
            <h2 className="serif mt-3 text-2xl">Your consent</h2>
            <p className="mt-2 text-sm text-[#4a4338]">
              Each visit asks permission separately for history, documents, HIS push and ABHA
              linking. You may refuse any part and still be seen.
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#4a4338]">Your visits</h2>
          <div className="mt-3 space-y-3">
            {visits.map(({ session, summary }) => (
              <article key={session.id} className="rounded-[24px] bg-[#fffdf7] p-5 ring-1 ring-[#1b1712]/8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-[#c9842a]" />
                    <span className="text-sm text-[#4a4338]">
                      {new Date(session.startedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <span className="rounded-full bg-[#f6f0e4] px-3 py-1 text-xs uppercase tracking-wider">
                    {session.status}
                  </span>
                </div>
                <p className="mt-2 font-medium">
                  {summary?.chiefComplaint ?? "Interview not completed"}
                </p>
                <p className="mt-1 text-xs text-[#4a4338]">
                  {DEPARTMENTS.find((d) => d.id === session.department)?.label ?? session.department} ·
                  Token {session.tokenNumber ?? "—"}
                </p>
                {session.redFlagTriggered && (
                  <p className="mt-2 text-xs font-medium text-[#b42318]">
                    This visit was marked for priority triage.
                  </p>
                )}
                {session.physicianNotes && (
                  <p className="mt-2 rounded-2xl bg-[#f6f0e4] px-4 py-3 text-sm">
                    <span className="text-xs uppercase tracking-wider text-[#c9842a]">Doctor&apos;s advice</span>
                    <br />
                    {session.physicianNotes}
                  </p>
                )}
              </article>
            ))}
            {visits.length === 0 && (
              <p className="rounded-[24px] bg-[#fffdf7] p-6 text-sm text-[#4a4338]">
                No visits yet. Start your first intake above.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
