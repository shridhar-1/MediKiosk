"use client";

/**
 * ============================================================================
 * STREAMLINED PATIENT ONBOARDING (mentor feedback: fewer questions)
 * ============================================================================
 * Before: 6 question blocks + 2 OTP verifications (phone AND email) + manual
 *         hospital selection = ~40–60 s of kiosk occupancy.
 * After:  Step 1 — name + phone (2 fields). Step 2 — one OTP.
 *         Everything else is auto-selected or deferred (progressive profile).
 *
 *  • Hospital: auto-selected (nearest) — one line, tap to change.
 *  • Location: GPS auto-detected silently, best effort.
 *  • ABHA / email: optional, collapsed, NEVER blocking.
 *  • OTP: Firebase phone auth when configured; automatic demo-OTP fallback
 *         when it isn't (so the kiosk always works in demos/offline).
 * ============================================================================
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, Building2, CheckCircle2, User, Phone, Shield,
  ChevronDown, ChevronUp, Loader2, PartyPopper,
} from "lucide-react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  getAuth,
} from "firebase/auth";
import { initializeApp, getApps, getApp } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const SAMPLE_HOSPITALS = [
  { id: 1, name: "City Care General Hospital", address: "Station Road, Main Circle", distance: "1.2 km" },
  { id: 2, name: "Apollo MediKiosk Hub", address: "Sector 4, Near Metro Gate 2", distance: "3.5 km" },
  { id: 3, name: "District Government Hospital", address: "Civil Lines, Opp. Park", distance: "5.0 km" },
  { id: 4, name: "Sunrise Multi-Specialty Clinic", address: "Ring Road, Phase 1", distance: "7.8 km" },
];

export default function PatientSetupForm() {
  const router = useRouter();

  // ── The only 3 required inputs ──
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");

  // ── OTP state ──
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null); // fallback when Firebase is not configured
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [msg, setMsg] = useState("");

  // ── Auto / optional (never blocking) ──
  const [selectedHospitalId, setSelectedHospitalId] = useState<number>(SAMPLE_HOSPITALS[0].id); // auto: nearest
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [abhaId, setAbhaId] = useState("");
  const [email, setEmail] = useState("");
  const [detectedArea, setDetectedArea] = useState("");

  // Init Firebase reCAPTCHA (harmless if unconfigured — we fall back to demo OTP)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
          callback: () => {},
        });
      }
    } catch {
      /* demo mode */
    }
  }, []);

  // Silent, best-effort GPS — zero taps from the patient
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDetectedArea(`Lat ${pos.coords.latitude.toFixed(3)}, Lng ${pos.coords.longitude.toFixed(3)}`),
      () => setDetectedArea(""),
      { timeout: 4000 },
    );
  }, []);

  const hospital = SAMPLE_HOSPITALS.find((h) => h.id === selectedHospitalId) ?? SAMPLE_HOSPITALS[0];

  // ── STEP 1 → 2: send one OTP (Firebase, or demo fallback) ──
  const sendOtp = async () => {
    if (fullName.trim().length < 2) { setMsg("Please tell us your name"); return; }
    if (phoneNumber.replace(/\D/g, "").length < 10) { setMsg("Enter a valid 10-digit phone number"); return; }
    setLoading(true);
    setMsg("");
    const formatted = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber.replace(/\D/g, "")}`;

    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const confirmation = await signInWithPhoneNumber(auth, formatted, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
      setMsg("OTP sent to your phone 📲");
    } catch {
      // Firebase not configured / quota / offline → demo OTP so the kiosk never dead-ends
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setDemoOtp(code);
      setMsg(`Demo mode (SMS not configured) — your OTP is ${code}`);
    } finally {
      setStep(2);
      setLoading(false);
    }
  };

  // ── STEP 2: verify the single OTP, create profile, go to kiosk ──
  const verifyAndContinue = async () => {
    setLoading(true);
    setMsg("");
    try {
      if (confirmationResult) {
        await confirmationResult.confirm(otp);
      } else if (demoOtp) {
        if (otp !== demoOtp) { setMsg("Wrong OTP — check the code shown above"); setLoading(false); return; }
      } else {
        setMsg("Please request an OTP first"); setLoading(false); return;
      }
      setVerified(true);

      const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber.replace(/\D/g, "")}`;
      const cleanAbha = abhaId.replace(/-/g, "").trim();

      // same localStorage contract the kiosk & portal already read
      const profile = {
        fullName: fullName.trim(),
        abhaId: cleanAbha || "N/A",
        email: email || undefined,
        phoneNumber: formattedPhone,
        location: detectedArea || undefined,
        selectedHospital: hospital,
      };
      localStorage.setItem("patient_profile", JSON.stringify(profile));
      if (cleanAbha) {
        const existingDb = JSON.parse(localStorage.getItem("registered_abha_db") || "{}");
        existingDb[cleanAbha] = formattedPhone;
        existingDb[abhaId] = formattedPhone;
        localStorage.setItem("registered_abha_db", JSON.stringify(existingDb));
      }

      // register server-side too (same route the demo login uses) — non-blocking
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "patient", identifier: formattedPhone, fullName: fullName.trim() }),
      }).catch(() => {});

      setTimeout(() => router.push("/kiosk"), 700);
    } catch {
      setMsg("Invalid OTP. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-black focus:ring-2 focus:ring-teal-500 focus:outline-none";

  if (verified) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-teal-200 bg-white p-8 text-center shadow-xl">
        <div id="recaptcha-container" />
        <PartyPopper className="mx-auto h-10 w-10 text-teal-600" />
        <h2 className="mt-3 text-2xl font-bold text-gray-900">You&apos;re in, {fullName.split(" ")[0]}!</h2>
        <p className="mt-2 text-sm text-gray-500">
          Hospital: <b>{hospital.name}</b> · Profile saved. Opening your clinical interview…
        </p>
        <div className="mx-auto mt-5 flex items-center justify-center gap-2 text-teal-700">
          <Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm">Loading kiosk…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-6 shadow-xl md:p-8">
      <div id="recaptcha-container"></div>

      <div className="mb-5 border-b pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Quick sign up</h2>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700">
            {step === 1 ? "STEP 1 OF 2 · 30 SECONDS" : "STEP 2 OF 2 · VERIFY"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">Just your name and phone — everything else can wait.</p>
      </div>

      {step === 1 && (
        <div className="space-y-5">
          {/* Field 1 — name */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Name *</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="text"
                autoFocus
                placeholder="e.g. Ramesh Kumar"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`${inputCls} pl-10`}
              />
            </div>
          </div>

          {/* Field 2 — phone */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">Phone number *</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                placeholder="10-digit mobile"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className={`${inputCls} pl-10`}
              />
            </div>
          </div>

          {/* Auto-selected hospital — visible, one tap to change, never blocking */}
          <button
            type="button"
            onClick={() => setShowHospitalPicker((s) => !s)}
            className="flex w-full items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-left"
          >
            <Building2 className="h-5 w-5 shrink-0 text-teal-600" />
            <span className="flex-1 text-sm">
              <span className="font-semibold text-gray-800">{hospital.name}</span>
              <span className="ml-2 text-xs text-teal-700">auto-selected · {hospital.distance} away</span>
              <span className="block text-[11px] text-gray-500">Tap to change hospital</span>
            </span>
            {showHospitalPicker ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
          {showHospitalPicker && (
            <div className="grid grid-cols-1 gap-2">
              {SAMPLE_HOSPITALS.map((h) => (
                <div
                  key={h.id}
                  onClick={() => { setSelectedHospitalId(h.id); setShowHospitalPicker(false); }}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                    selectedHospitalId === h.id ? "border-teal-600 bg-teal-50/50" : "border-gray-200 hover:border-teal-200"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{h.name}</p>
                    <p className="text-xs text-gray-500">{h.address} · {h.distance}</p>
                  </div>
                  {selectedHospitalId === h.id && <CheckCircle2 className="h-5 w-5 text-teal-600" />}
                </div>
              ))}
            </div>
          )}

          {/* Optional — collapsed, deferred (progressive profiling) */}
          <div className="rounded-xl bg-gray-50 p-3">
            <button type="button" onClick={() => setShowOptional((s) => !s)} className="flex w-full items-center justify-between text-sm font-medium text-gray-600">
              <span>Optional (can also be added later): ABHA ID · email</span>
              {showOptional ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showOptional && (
              <div className="mt-3 space-y-3">
                <div className="relative">
                  <Shield className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ABHA ID — 12-3456-7890-1234 (optional)"
                    value={abhaId}
                    onChange={(e) => setAbhaId(e.target.value)}
                    className={`${inputCls} pl-10`}
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email (optional — no verification needed now)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void sendOtp()}
            disabled={loading}
            className="w-full rounded-xl bg-teal-700 py-3.5 font-semibold text-white transition hover:bg-teal-800 disabled:bg-gray-400"
          >
            {loading ? "Sending OTP…" : "Send OTP →"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            OTP sent to <b>+91 {phoneNumber.replace(/\D/g, "").slice(-10)}</b>{" "}
            <button type="button" onClick={() => { setStep(1); setMsg(""); }} className="font-semibold text-teal-700 hover:underline">
              change
            </button>
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            placeholder="— — — — — —"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className={`${inputCls} text-center text-2xl tracking-[0.5em]`}
          />
          <button
            type="button"
            onClick={() => void verifyAndContinue()}
            disabled={loading || otp.length < 6}
            className="w-full rounded-xl bg-teal-700 py-3.5 font-semibold text-white transition hover:bg-teal-800 disabled:bg-gray-400"
          >
            {loading ? "Verifying…" : "Verify & start →"}
          </button>
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.includes("OTP") && !msg.includes("Wrong") && !msg.includes("Invalid") ? "text-teal-700" : "text-red-500"}`}>
          {msg}
        </p>
      )}
      {detectedArea && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin className="h-3 w-3" /> Location noted automatically: {detectedArea}
        </p>
      )}

      <p className="mt-5 text-center text-sm text-gray-500">
        Already registered?{" "}
        <a href="/login/patient" className="font-semibold text-teal-700 hover:underline">Login here</a>
      </p>
    </div>
  );
}

declare global {
  interface Window {
    recaptchaVerifier: any;
    grecaptcha: any;
  }
}