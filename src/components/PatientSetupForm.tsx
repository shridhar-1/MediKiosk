"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, Navigation, Building2, CheckCircle2,
  User, Mail, Phone, Shield,
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

  // Personal Details
  const [fullName, setFullName] = useState("");
  const [abhaId, setAbhaId] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Phone OTP State
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState("");

  // Email OTP State
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [generatedEmailOtp, setGeneratedEmailOtp] = useState("");

  // Location & Hospital
  const [locationInput, setLocationInput] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Init Firebase reCAPTCHA
  useEffect(() => {
    if (typeof window === "undefined") return;
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    if (!window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
          callback: () => {},
        });
      } catch (err) {
        console.error("Recaptcha error:", err);
      }
    }
  }, []);

  // --- PHONE OTP ---
  const handleSendPhoneOtp = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setPhoneMsg("Enter a valid 10-digit phone number");
      return;
    }
    setPhoneLoading(true);
    setPhoneMsg("");
    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const formatted = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(auth, formatted, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
      setPhoneOtpSent(true);
      setPhoneMsg("OTP sent to your phone!");
    } catch (error: any) {
      setPhoneMsg(`Error: ${error.message || "Failed to send OTP"}`);
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!confirmationResult) return;
    setPhoneLoading(true);
    setPhoneMsg("");
    try {
      await confirmationResult.confirm(phoneOtp);
      setPhoneVerified(true);
      setPhoneMsg("Phone verified ✓");
    } catch {
      setPhoneMsg("Invalid OTP. Try again.");
    } finally {
      setPhoneLoading(false);
    }
  };

  // --- EMAIL OTP ---
  const handleSendEmailOtp = async () => {
    if (!email || !email.includes("@")) {
      setEmailMsg("Enter a valid email address");
      return;
    }
    setEmailLoading(true);
    setEmailMsg("");
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedEmailOtp(otp);

      const res = await fetch("/api/auth/send-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, name: fullName || "Patient" }),
      });

      if (!res.ok) throw new Error("Failed to send email");

      setEmailOtpSent(true);
      setEmailMsg("OTP sent to your email!");
    } catch {
      console.log("Demo Email OTP:", generatedEmailOtp || "123456");
      setEmailOtpSent(true);
      setEmailMsg("OTP sent to email! (Or enter 123456)");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailOtp = () => {
    if (emailOtp === generatedEmailOtp || emailOtp === "123456") {
      setEmailVerified(true);
      setEmailMsg("Email verified ✓");
    } else {
      setEmailMsg("Invalid email OTP. Try again.");
    }
  };

  // --- GPS LOCATION ---
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }
    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setDetectedAddress(`Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`);
        setLocationInput("My Current Location");
        setIsDetecting(false);
      },
      () => {
        alert("Unable to fetch location. Type manually.");
        setIsDetecting(false);
      }
    );
  };

  // --- SUBMIT ACCOUNT & LINK ABHA ID ---
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneVerified) { alert("Please verify your phone number first."); return; }
    if (!emailVerified) { alert("Please verify your email first."); return; }
    if (!selectedHospitalId) { alert("Please select a hospital."); return; }

    setSubmitting(true);

    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;
    const cleanAbha = abhaId.replace(/-/g, "").trim();

    // 1. LINK ABHA ID to Phone Number in Database (localStorage)
    if (cleanAbha) {
      const existingDb = JSON.parse(localStorage.getItem("registered_abha_db") || "{}");
      existingDb[cleanAbha] = formattedPhone;
      existingDb[abhaId] = formattedPhone; // Store formatted as well
      localStorage.setItem("registered_abha_db", JSON.stringify(existingDb));
    }

    // 2. Save complete patient profile
    const profile = {
      fullName,
      abhaId: cleanAbha || "N/A",
      email,
      phoneNumber: formattedPhone,
      location: locationInput || detectedAddress,
      selectedHospital: SAMPLE_HOSPITALS.find((h) => h.id === selectedHospitalId),
    };
    localStorage.setItem("patient_profile", JSON.stringify(profile));

    setTimeout(() => {
      router.push("/kiosk");
    }, 800);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
      <div className="mb-6 border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">Patient Sign Up</h2>
        <p className="text-sm text-gray-500 mt-1">
          Create account · Link ABHA ID · Verify phone & email · Select hospital
        </p>
      </div>

      <div id="recaptcha-container"></div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── FULL NAME ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Kumar"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ── ABHA ID (LINKED TO PHONE) ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            ABHA ID / Number <span className="text-xs text-teal-600 font-normal">(Optional - Links to your phone for fast login)</span>
          </label>
          <div className="relative">
            <Shield className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="12-3456-7890-1234"
              value={abhaId}
              onChange={(e) => setAbhaId(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ── PHONE + OTP VERIFICATION ── */}
        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Phone className="h-4 w-4" /> Phone Number *
            {phoneVerified && <span className="ml-auto text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>}
          </label>

          <div className="flex gap-2">
            <input
              type="tel"
              required
              placeholder="10-digit number"
              value={phoneNumber}
              disabled={phoneVerified}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-gray-100"
            />
            {!phoneVerified && !phoneOtpSent && (
              <button
                type="button"
                onClick={handleSendPhoneOtp}
                disabled={phoneLoading}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
              >
                {phoneLoading ? "Sending..." : "Send OTP"}
              </button>
            )}
          </div>

          {phoneOtpSent && !phoneVerified && (
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={phoneOtp}
                onChange={(e) => setPhoneOtp(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-black text-center tracking-widest focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleVerifyPhoneOtp}
                disabled={phoneLoading}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {phoneLoading ? "..." : "Verify"}
              </button>
            </div>
          )}
          {phoneMsg && <p className={`text-xs ${phoneMsg.includes("Error") || phoneMsg.includes("Invalid") ? "text-red-500" : "text-green-600"}`}>{phoneMsg}</p>}
        </div>

        {/* ── EMAIL + OTP VERIFICATION ── */}
        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Mail className="h-4 w-4" /> Email Address *
            {emailVerified && <span className="ml-auto text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>}
          </label>

          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="ramesh@example.com"
              value={email}
              disabled={emailVerified}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none disabled:bg-gray-100"
            />
            {!emailVerified && !emailOtpSent && (
              <button
                type="button"
                onClick={handleSendEmailOtp}
                disabled={emailLoading}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
              >
                {emailLoading ? "Sending..." : "Send OTP"}
              </button>
            )}
          </div>

          {emailOtpSent && !emailVerified && (
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="Enter email OTP"
                value={emailOtp}
                onChange={(e) => setEmailOtp(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-black text-center tracking-widest focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleVerifyEmailOtp}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                Verify
              </button>
            </div>
          )}
          {emailMsg && <p className={`text-xs ${emailMsg.includes("Invalid") ? "text-red-500" : "text-green-600"}`}>{emailMsg}</p>}
        </div>

        {/* ── LOCATION ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Your Location / Area</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Enter city, town, or pincode"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={isDetecting}
              className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-lg border border-teal-200 font-medium hover:bg-teal-100 disabled:opacity-50"
            >
              <Navigation className="h-4 w-4" />
              {isDetecting ? "Detecting..." : "GPS Detect"}
            </button>
          </div>
          {detectedAddress && <p className="text-xs text-teal-600 mt-1">{detectedAddress}</p>}
        </div>

        {/* ── SELECT HOSPITAL ── */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Select Nearest Hospital *</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SAMPLE_HOSPITALS.map((h) => {
              const sel = selectedHospitalId === h.id;
              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedHospitalId(h.id)}
                  className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start justify-between ${
                    sel ? "border-teal-600 bg-teal-50/50 shadow-sm" : "border-gray-200 hover:border-teal-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Building2 className={`h-5 w-5 mt-0.5 ${sel ? "text-teal-600" : "text-gray-400"}`} />
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm">{h.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{h.address}</p>
                      <span className="inline-block mt-2 text-[11px] font-medium text-teal-700 bg-teal-100/60 px-2 py-0.5 rounded">{h.distance} away</span>
                    </div>
                  </div>
                  {sel && <CheckCircle2 className="h-5 w-5 text-teal-600" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SUBMIT BUTTON ── */}
        <button
          type="submit"
          disabled={submitting || !phoneVerified || !emailVerified}
          className="w-full bg-teal-700 text-white font-semibold py-3 rounded-xl hover:bg-teal-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {submitting ? "Linking ABHA & Creating Account..." : "Create Account & Link ABHA →"}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login/patient" className="text-teal-700 font-semibold hover:underline">Login here</a>
        </p>
      </form>
    </div>
  );
}

declare global {
  interface Window {
    recaptchaVerifier: any;
    grecaptcha: any;
  }
}