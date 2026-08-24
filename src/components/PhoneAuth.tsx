"use client";

import { useState, useEffect } from "react";
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult 
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function PhoneAuth() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Initialize reCAPTCHA on component mount
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
          size: "invisible",
          callback: () => {
            // reCAPTCHA solved
          },
        }
      );
    }
  }, []);

  // Step 1: Send OTP to user's phone
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      // Ensure phone number has country code (e.g. +91 for India)
      const formattedPhone = phoneNumber.startsWith("+") 
        ? phoneNumber 
        : `+91${phoneNumber}`; // Default to India (+91) if not provided

      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
      setMessage("OTP sent successfully to your phone!");
    } catch (error: any) {
      console.error(error);
      setMessage(`Error: ${error.message}`);
      // Reset reCAPTCHA on failure
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then((widgetId: any) => {
          window.grecaptcha?.reset(widgetId);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the 6-digit OTP entered by the user
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;

    setLoading(true);
    setMessage("");

    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;
      setMessage(`Phone number verified successfully! Welcome ${user.phoneNumber}`);
      
      // TODO: Here you can redirect the patient to the dashboard or call your backend DB
    } catch (error: any) {
      console.error(error);
      setMessage("Invalid OTP code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md border space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Phone Verification</h2>

      {/* Required element for Firebase reCAPTCHA */}
      <div id="recaptcha-container"></div>

      {!isOtpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. 9876543210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="mt-1 block w-full p-2 border rounded-md"
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
              className="mt-1 block w-full p-2 border rounded-md text-center text-lg letter-spacing"
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

// Global TypeScript declaration for Firebase reCAPTCHA
declare global {
  interface Window {
    recaptchaVerifier: any;
    grecaptcha: any;
  }
}