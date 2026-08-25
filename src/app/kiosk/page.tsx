import { KioskApp } from "@/components/kiosk/kiosk-app";
import { currentPatient } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  await seedIfEmpty();
  // FIXED: Use currentPatient() not patientOrDemo() to prevent Priya Nair default
  const patient = await currentPatient();

  return (
    <KioskApp
      account={
        patient
          ? {
              id: patient.id,
              fullName: patient.fullName,
              age: patient.age,
              gender: patient.gender,
              phone: patient.phone,
              abhaId: patient.abhaId,
              aadhaarLast4: patient.aadhaarLast4,
              preferredLanguage: patient.preferredLanguage,
            }
          : null
      }
    />
  );
}