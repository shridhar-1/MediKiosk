import { AuthShell } from "@/components/auth/auth-shell";
import { PatientLoginForm } from "@/components/auth/patient-login-form";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function PatientLoginPage() {
  await seedIfEmpty();

  return (
    <AuthShell
      image="/images/hero-kiosk.jpg"
      eyebrow="Patient access"
      title="Your history, in your own words."
      blurb="Sign in once. Answer by voice or touch in seven languages, scan old prescriptions, and walk into the consultation with everything ready."
      aside={
        <div className="text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#e8d5a3]">Open demonstration</p>
          <p className="mt-2 font-medium">No password. No OTP.</p>
          <p className="mt-1 text-[#f6f0e4]/70">
            Type anything, or skip the fields entirely — the portal opens straight away.
          </p>
        </div>
      }
      swapHref="/login/staff"
      swapLabel="Hospital staff? Sign in to the clinical console →"
    >
      <PatientLoginForm />
    </AuthShell>
  );
}
