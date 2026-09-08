"use client";

import { useEffect, useState } from "react";
import { KioskApp, type KioskAccount } from "@/components/kiosk/kiosk-app";

export default function KioskPage() {
  const [account, setAccount] = useState<KioskAccount | null | undefined>(undefined);

  useEffect(() => {
    const savedProfile = localStorage.getItem("patient_profile");

    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        setAccount({
          id: "local-" + Date.now(),
          fullName: profile.fullName || "",
          age: 30,
          gender: "male",
          phone: profile.phoneNumber || null,
          email: profile.email || null,
          abhaId: profile.abhaId && profile.abhaId !== "N/A" ? profile.abhaId : null,
          aadhaarLast4: null,
          preferredLanguage: "en",
        });
      } catch (e) {
        console.error("Failed to parse patient profile", e);
        setAccount(null);
      }
    } else {
      setAccount(null);
    }
  }, []);

  if (account === undefined) {
    return <div className="min-h-screen bg-[#fffdf7]" />;
  }

  return <KioskApp account={account} />;
}