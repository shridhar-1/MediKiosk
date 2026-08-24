"use client";

import { useEffect, useState } from "react";
import { KioskApp, type KioskAccount } from "@/components/kiosk/kiosk-app";

export default function KioskPage() {
  const [account, setAccount] = useState<KioskAccount | null | undefined>(undefined);

  useEffect(() => {
    // 1. Read the profile saved during Sign Up / Login
    const savedProfile = localStorage.getItem("patient_profile");
    
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        
        // 2. Map the local profile to the KioskAccount type
        setAccount({
          id: "local-" + Date.now(), // Will be replaced by real DB ID in KioskApp
          fullName: profile.fullName || "",
          age: 30, // Default fallback if age wasn't asked in setup
          gender: "male",
          phone: profile.phoneNumber || null,
          abhaId: profile.abhaId && profile.abhaId !== "N/A" ? profile.abhaId : null,
          aadhaarLast4: null,
          preferredLanguage: "en",
        });
      } catch (e) {
        console.error("Failed to parse patient profile", e);
        setAccount(null);
      }
    } else {
      // No logged in patient found, proceed as guest
      setAccount(null);
    }
  }, []);

  // Show a blank loading state while reading localStorage
  if (account === undefined) {
    return <div className="min-h-screen bg-[#fffdf7]" />;
  }

  // Inject the authenticated account into the Kiosk Engine
  return <KioskApp account={account} />;
}