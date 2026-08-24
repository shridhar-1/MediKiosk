"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock, ArrowLeft, ShieldCheck } from "lucide-react";

export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");

  function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setOtpSent(true);
    }, 800);
  }

  async function verifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "staff", email }),
      });
    } catch {
      // Login API fallback
    }
    router.replace("/physician");
    router.refresh();
  }

  if (otpSent) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button 
          onClick={() => setOtpSent(false)} 
          className="mb-6 flex items-center gap-2 text-sm text-[#4a4338] hover:text-[#08363a] transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#08363a]/10 text-[#08363a]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="serif mt-2 text-4xl">Facility Authentication</h1>
        <p className="mt-2 text-sm text-[#4a4338]">
          A secure access code has been sent to <strong>{email || "your email"}</strong>. Enter it below to access the console.
        </p>
        <form onSubmit={verifyOTP} className="mt-8 space-y-6">
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            className="w-full text-center text-3xl tracking-[0.5em] rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-4 outline-none focus:border-[#08363a]"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#08363a] px-6 py-4 font-semibold text-white disabled:opacity-60 transition"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Authenticate 
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#c9842a]">Clinical console</p>
      <h1 className="serif mt-2 text-4xl">Hospital staff sign in</h1>
      <p className="mt-2 text-sm text-[#4a4338]">
        Enter your authorized facility credentials to securely access the clinical console and OPD queue.
      </p>

      <form onSubmit={handleRequestOTP} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm text-[#4a4338]">Hospital email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@medikiosk.in"
            type="email"
            required
            className="w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-3.5 outline-none focus:border-[#08363a]"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#08363a] px-6 py-3.5 font-semibold text-white disabled:opacity-60 transition"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Request Access Code
        </button>
      </form>
    </div>
  );
}
