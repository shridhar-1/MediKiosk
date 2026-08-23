import { notFound, redirect } from "next/navigation";
import { staffOrDemo } from "@/lib/auth";
import { PhysicianNav } from "@/components/physician/nav";
import { ReviewWorkspace } from "@/components/physician/review-workspace";
import { loadSessionBundle } from "@/lib/session-data";
import { seedIfEmpty } from "@/lib/seed";

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

  return (
    <div className="min-h-screen">
      <PhysicianNav member={member} />
      <ReviewWorkspace bundle={bundle} reviewer={member.fullName} />
    </div>
  );
}
