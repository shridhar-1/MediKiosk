import { notFound, redirect } from "next/navigation";
import { staffOrDemo } from "@/lib/auth";
import { db } from "@/db";
import { clinicalSummaries, sessions } from "@/db/schema";
import { PhysicianNav } from "@/components/physician/nav";
import { ReviewWorkspace } from "@/components/physician/review-workspace";
import { AiInsights, type VisitFact } from "@/components/physician/ai-insights";
import { AskRecordPanel } from "@/components/physician/ask-record-panel";
import { loadSessionBundle } from "@/lib/session-data";
import { seedIfEmpty } from "@/lib/seed";
import { roomCaption } from "@/lib/facility";
import { ReturningDelta } from "@/components/physician/returning-delta";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function PhysicianSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await seedIfEmpty();
  const member = await staffOrDemo();
  if (!member) redirect("/login/staff");
  const { id } = await params;
  const bundle = await loadSessionBundle(id);
  if (!bundle) notFound();

  // Visit history for the AI Insights panel (same patient, newest first)
  const history = await db
    .select({ session: sessions, summary: clinicalSummaries })
    .from(sessions)
    .leftJoin(clinicalSummaries, eq(clinicalSummaries.sessionId, sessions.id))
    .where(eq(sessions.patientId, bundle.session.patientId))
    .orderBy(desc(sessions.startedAt))
    .limit(30);

  const visits: VisitFact[] = history.map((r) => ({
    date: new Date(r.session.startedAt),
    complaint: r.summary?.chiefComplaint ?? "",
    department: r.session.department,
    priority: r.session.priority,
    redFlag: r.session.redFlagTriggered,
  }));

  // ── DELTA — this patient's most recent PRIOR summarized visit ──────────
  const prior = history.find((r) => r.session.id !== id && r.summary) ?? null;
  const CARRY: { key: keyof typeof clinicalSummaries.$inferSelect; label: string }[] = [
    { key: "pastMedical", label: "Past medical" },
    { key: "pastSurgical", label: "Past surgical" },
    { key: "drugs", label: "Drugs / meds" },
    { key: "allergies", label: "Allergies" },
    { key: "familyHistory", label: "Family history" },
  ];
  const carried = prior?.summary
    ? CARRY.filter((c) => {
        const v = (prior.summary as Record<string, unknown>)[c.key];
        return typeof v === "string" && v.trim().length > 0;
      }).map((c) => ({
        label: c.label,
        value: (prior.summary as Record<string, unknown>)[c.key] as string,
      }))
    : [];

  return (
    <div className="min-h-screen">
      <PhysicianNav member={member} />
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#0f5c61] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
            🏥 {roomCaption(bundle.session.department, bundle.session.priority)}
          </span>
          {bundle.session.priority === "emergency" && (
            <span className="rounded-full bg-[#b42318] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              🚨 Emergency — bypassed the queue
            </span>
          )}
          {bundle.summary && (
            <span className="inline-block rounded-full bg-[#e8d5a3] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#08363a]">
              {bundle.summary.aiUsed
                ? `✨ AI-written summary · engine ${bundle.summary.engine ?? "ai"} · doctor-editable`
                : "📋 Template summary — AI unavailable, nothing pretended"}
            </span>
          )}
        </div>

        {prior && (
          <div className="mb-5">
            <ReturningDelta
              priorToken={prior.session.tokenNumber}
              visitedAt={new Date(prior.session.startedAt)}
              department={prior.session.department}
              mode={prior.session.mode}
              carried={carried}
            />
          </div>
        )}

        <AiInsights
          patientName={bundle.patient.fullName}
          visits={visits}
          currentComplaint={bundle.summary?.chiefComplaint ?? ""}
        />
        <AskRecordPanel sessionId={id} />
      </div>
      <ReviewWorkspace bundle={bundle} reviewer={member.fullName} />
    </div>
  );
}