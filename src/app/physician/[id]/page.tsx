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

  return (
    <div className="min-h-screen">
      <PhysicianNav member={member} />
      <div className="mx-auto max-w-7xl px-6 pt-8">
        {bundle.summary && (
          <p className="mb-3 inline-block rounded-full bg-[#e8d5a3] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#08363a]">
            {bundle.summary.aiUsed
              ? `✨ AI-written summary · engine ${bundle.summary.engine ?? "ai"} · doctor-editable`
              : "📋 Template summary — AI unavailable, nothing pretended"}
          </p>
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