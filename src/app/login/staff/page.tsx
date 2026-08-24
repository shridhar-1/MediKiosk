import { AuthShell } from "@/components/auth/auth-shell";
import { StaffLoginForm } from "@/components/auth/staff-login-form";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage() {
  await seedIfEmpty();

  return (
    <AuthShell
      image="/images/physician-console.jpg"
      eyebrow="Hospital authority"
      title="Read the whole history in seconds."
      blurb="Physicians, triage nurses and superintendents sign in to the OPD queue, red-flag alerts, document timelines and the FHIR push log."
      aside={
        <div className="space-y-2 text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#e8d5a3]">Authorized Access Only</p>
          <p className="font-medium">Facility SSO Enabled</p>
          <p className="text-[#f6f0e4]/70">
            Access is restricted to authorized hospital personnel. All session actions are recorded in the facility audit log.
          </p>
        </div>
      }
      swapHref="/login/patient"
      swapLabel="Are you a patient? Sign in to the patient portal &rarr;"
    >
      <StaffLoginForm />
    </AuthShell>
  );
}
