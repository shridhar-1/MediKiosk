import { KioskApp } from "@/components/kiosk/kiosk-app";
import { patientOrDemo } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function KioskPage() {
  await seedIfEmpty();
  const patient = await patientOrDemo();

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
