"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  getAuth,
} from "firebase/auth";
import { initializeApp, getApps, getApp } from "firebase/app";
import { Phone, CreditCard, ShieldAlert, ArrowRight, CheckCircle2 } from "lucide-react";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Default Demo Database
const DEFAULT_ABHA_DATABASE: Record<string, string> = {
  "12345678901234": "+919972752670",
  "12-3456-7890-1234": "+919972752670",
  "98765432109876": "+919876543210",
};

type LoginMethod = "phone" | "abha";

export default function PhoneAuth() {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod>("phone");

  // Phone state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);

  // ABHA state
  const [abhaId, setAbhaId] = useState("");
  const [abhaStep, setAbhaStep] = useState<"enter_abha" | "verify_otp">("enter_abha");
  const [linkedPhone, setLinkedPhone] = useState("");
  const [abhaOtp, setAbhaOtp] = useState("");
  const [abhaConfirmation, setAbhaConfirmation] = useState<ConfirmationResult | null>(null);
  const [abhaNotFound, setAbhaNotFound] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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

  // --- PHONE LOGIN FLOW ---
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const formatted = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;
      const confirmation = await signInWithPhoneNumber(auth, formatted, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
      setMessage("OTP sent successfully!");
    } catch (error: any) {
      setMessage(`Error: ${error.message || "Failed to send OTP"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setLoading(true);
    setMessage("");
    try {
      await confirmationResult.confirm(otp);
      setMessage("Verified! Redirecting...");
      setTimeout(() => router.push("/kiosk"), 800);
    } catch {
      setMessage("Invalid OTP. Please try again.");
      setLoading(false);
    }
  };

  // --- ABHA LOGIN FLOW (SEARCHES SIGNUP DB TOO) ---
  const handleVerifyAbha = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setAbhaNotFound(false);

    const cleanAbha = abhaId.replace(/-/g, "").trim();

    // Read dynamic user registrations from Sign Up page
    const customAbhaDb = JSON.parse(localStorage.getItem("registered_abha_db") || "{}");
    const combinedDb = { ...DEFAULT_ABHA_DATABASE, ...customAbhaDb };

    // Find linked phone number
    const foundPhone = combinedDb[cleanAbha] || combinedDb[abhaId];

    if (!foundPhone) {
      setLoading(false);
      setAbhaNotFound(true);
      setMessage("No ABHA linked account found. Please go and sign up.");
      return;
    }

    // ABHA Found! Send OTP to linked phone
    try {
      setLinkedPhone(foundPhone);
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);

      const confirmation = await signInWithPhoneNumber(auth, foundPhone, window.recaptchaVerifier);
      setAbhaConfirmation(confirmation);
      setAbhaStep("verify_otp");
      setMessage(`ABHA verified! OTP sent to linked phone ending in ...${foundPhone.slice(-4)}`);
    } catch (error: any) {
      console.error(error);
      setMessage(`Failed to send OTP: ${error.message || "Error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAbhaOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abhaConfirmation) return;
    setLoading(true);
    setMessage("");
    try {
      await abhaConfirmation.confirm(abhaOtp);
      setMessage("ABHA login successful! Redirecting...");
      setTimeout(() => router.push("/kiosk"), 800);
    } catch {
      setMessage("Invalid OTP code. Please try again.");
      setLoading(false);
    }
  };

  const maskPhone = (phone: string) => {
    if (!phone) return "";
    return `${phone.slice(0, 3)} ******${phone.slice(-4)}`;
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md border space-y-5">
      <h2 className="text-xl font-bold text-gray-800">Patient Login</h2>

      {/* Tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setMethod("phone");
            setMessage("");
            setIsOtpSent(false);
            setAbhaNotFound(false);
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            method === "phone" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Phone className="h-4 w-4" /> Phone OTP
        </button>
        <button
          type="button"
          onClick={() => {
            setMethod("abha");
            setMessage("");
            setAbhaStep("enter_abha");
            setAbhaNotFound(false);
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            method === "abha" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <CreditCard className="h-4 w-4" /> ABHA ID
        </button>
      </div>

      <div id="recaptcha-container"></div>

      {/* PHONE METHOD */}
      {method === "phone" && (
        !isOtpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                className="w-full p-2.5 border rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-400"
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter 6-Digit OTP</label>
              <input
                type="text"
                placeholder="123456"
                value={otp}
                maxLength={6}
                onChange={(e) => setOtp(e.target.value)}
                required
                className="w-full p-2.5 border rounded-lg text-center text-lg tracking-widest text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-400"
            >
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
          </form>
        )
      )}

      {/* ABHA METHOD */}
      {method === "abha" && (
        abhaStep === "enter_abha" ? (
          <form onSubmit={handleVerifyAbha} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ABHA Number</label>
              <input
                type="text"
                placeholder="12-3456-7890-1234"
                value={abhaId}
                onChange={(e) => setAbhaId(e.target.value)}
                required
                className="w-full p-2.5 border rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter your 14-digit Ayushman Bharat Health Account ID
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-400"
            >
              {loading ? "Searching ABHA..." : "Verify ABHA & Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyAbhaOtp} className="space-y-4">
            <div className="bg-teal-50 p-3 rounded-lg border border-teal-200 text-xs text-teal-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <span>OTP sent to linked phone: <b>{maskPhone(linkedPhone)}</b></span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter 6-Digit OTP</label>
              <input
                type="text"
                placeholder="123456"
                value={abhaOtp}
                maxLength={6}
                onChange={(e) => setAbhaOtp(e.target.value)}
                required
                className="w-full p-2.5 border rounded-lg text-center text-lg tracking-widest text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-400"
            >
              {loading ? "Verifying..." : "Verify & Complete Login"}
            </button>
          </form>
        )
      )}

      {/* ERROR BANNER */}
      {abhaNotFound && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
          <div className="flex items-start gap-2 text-red-700 text-sm">
            <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">ABHA Record Not Found</p>
              <p className="text-xs text-red-600 mt-0.5">
                No account is linked to this ABHA ID. Please sign up to create your account.
              </p>
            </div>
          </div>
          <a
            href="/patient/setup"
            className="flex items-center justify-center gap-2 w-full py-2 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg transition-colors"
          >
            Go to Sign Up Page <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      )}

      {message && !abhaNotFound && (
        <p className={`text-sm ${message.includes("Error") || message.includes("Failed") ? "text-red-500" : "text-green-600"}`}>
          {message}
        </p>
      )}

      <div className="border-t pt-4 text-center">
        <p className="text-sm text-gray-500">
          New patient?{" "}
          <a href="/patient/setup" className="text-teal-700 font-semibold hover:underline">
            Sign up here
          </a>
        </p>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    recaptchaVerifier: any;
    grecaptcha: any;
  }
}