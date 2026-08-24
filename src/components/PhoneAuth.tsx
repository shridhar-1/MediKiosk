"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation"; // Added router for navigation
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult,
  getAuth
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

export default function PhoneAuth() {
  const router = useRouter(); // Next.js Router
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);

    if (!window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,
          "recaptcha-container",
          {
            size: "invisible",
            callback: () => {},
          }
        );
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
      const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+91${phoneNumber}`;

      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
      setMessage("OTP sent successfully!");
    } catch (error: any) {
      console.error(error);
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
      const result = await confirmationResult.confirm(otp);
      setMessage("Phone verified successfully! Redirecting...");

      // REDIRECT TO THE NEXT PAGE:
      setTimeout(() => {
        router.push("/kiosk"); // Change "/kiosk" to "/portal" if you want a different page
      }, 1000);

    } catch (error: any) {
      console.error(error);
      setMessage("Invalid OTP code. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md border space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Phone Verification</h2>

      <div id="recaptcha-container"></div>

      {!isOtpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              placeholder="Enter 10-digit number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="mt-1 block w-full p-2 border rounded-md text-black"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 text-white p-2 rounded-md hover:bg-teal-700 disabled:bg-gray-400"
          >
            {loading ? "Sending SMS..." : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Enter 6-Digit OTP</label>
            <input
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="mt-1 block w-full p-2 border rounded-md text-center text-lg text-black"
              maxLength={6}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white p-2 rounded-md hover:bg-emerald-700 disabled:bg-gray-400"
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>
        </form>
      )}

      {message && (
        <p className={`text-sm ${message.includes("Error") || message.includes("Invalid") ? "text-red-500" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

declare global {
  interface Window {
    recaptchaVerifier: any;
    grecaptcha: any;
  }
}