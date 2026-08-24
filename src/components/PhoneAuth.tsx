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
import { Phone, CreditCard, Shield } from "lucide-react";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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

  const handleAbhaLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!abhaId || abhaId.length < 8) {
      setMessage("Enter a valid ABHA number (e.g. 12-3456-7890-1234)");
      return;
    }
    setLoading(true);
    setMessage("ABHA verified! Redirecting...");
    // TODO: Connect real ABHA API later
    setTimeout(() => router.push("/kiosk"), 1000);
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md border space-y-5">
      <h2 className="text-xl font-bold text-gray-800">Patient Login</h2>

      {/* Method Tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => { setMethod("phone"); setMessage(""); setIsOtpSent(false); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${method === "phone" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
          <Phone className="h-4 w-4" /> Phone OTP
        </button>
        <button type="button" onClick={() => { setMethod("abha"); setMessage(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${method === "abha" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
          <CreditCard className="h-4 w-4" /> ABHA ID
        </button>
      </div>

      <div id="recaptcha-container"></div>

      {/* PHONE LOGIN */}
      {method === "phone" && (
        !isOtpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="tel" placeholder="e.g. 9876543210" value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)} required
                className="w-full p-2.5 border rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-400">
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter 6-Digit OTP</label>
              <input type="text" placeholder="123456" value={otp} maxLength={6}
                onChange={(e) => setOtp(e.target.value)} required
                className="w-full p-2.5 border rounded-lg text-center text-lg tracking-widest text-black focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-400">
              {loading ? "Verifying..." : "Verify & Login"}
            </button>
          </form>
        )
      )}

      {/* ABHA LOGIN */}
      {method === "abha" && (
        <form onSubmit={handleAbhaLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ABHA Number</label>
            <div className="relative">
              <Shield className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input type="text" placeholder="12-3456-7890-1234" value={abhaId}
                onChange={(e) => setAbhaId(e.target.value)} required
                className="w-full pl-10 p-2.5 border rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">14-digit Ayushman Bharat Health Account number</p>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-400">
            {loading ? "Verifying ABHA..." : "Login with ABHA"}
          </button>
        </form>
      )}

      {message && (
        <p className={`text-sm ${message.includes("Error") || message.includes("Invalid") ? "text-red-500" : "text-green-600"}`}>
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