"use client";

import { LANGUAGES } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";

type Tab = "signin" | "register";

export function PatientLoginForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  
  const [identifier, setIdentifier] = useState("");
  const [reg, setReg] = useState({
    fullName: "",
    age: "",
    gender: "male",
    phone: "",
    abhaId: "",
    preferredLanguage: "en",
  });

  // Step 1: Simulate sending the OTP
  function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setOtpSent(true);
    }, 800); // Feels like a real network request
  }

  // Step 2: Verify OTP and enter
  async function verifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = tab === "signin" ? { identifier } : reg;
      await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "patient", ...payload }),
      });
    } catch {
      // Login API fallback
    }
    router.replace("/portal");
    router.refresh();
  }

  if (otpSent) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button 
          onClick={() => setOtpSent(false)} 
          className="mb-6 flex items-center gap-2 text-sm text-[#4a4338] hover:text-[#0f5c61] transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#0f5c61]/10 text-[#0f5c61]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="serif mt-2 text-4xl">Enter Verification Code</h1>
        <p className="mt-2 text-sm text-[#4a4338]">
          We sent a secure 6-digit code to your registered device. Enter it below to verify your identity.
        </p>
        <form onSubmit={verifyOTP} className="mt-8 space-y-6">
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            className="w-full text-center text-3xl tracking-[0.5em] rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-4 outline-none focus:border-[#0f5c61]"
          />
          <Submit busy={busy} label="Verify and Enter" />
        </form>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#c9842a]">Patient portal</p>
      <h1 className="serif mt-2 text-4xl">
        {tab === "signin" ? "Welcome back" : "Create your health login"}
      </h1>
      <p className="mt-2 text-sm text-[#4a4338]">
        {tab === "signin"
          ? "Enter your ABHA ID or mobile number to receive a secure OTP."
          : "Register a new profile to begin your clinical history intake."}
      </p>

      <div className="mt-6 flex gap-2 rounded-full bg-[#f0e8d8] p-1">
        {(["signin", "register"] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
              tab === k ? "bg-[#0f5c61] text-white" : "text-[#4a4338]"
            }`}
          >
            {k === "signin" ? "Sign in" : "New patient"}
          </button>
        ))}
      </div>

      {tab === "signin" ? (
        <form onSubmit={handleRequestOTP} className="mt-6 space-y-4">
          <Field
            label="ABHA ID or mobile number"
            value={identifier}
            onChange={setIdentifier}
            placeholder="9810011122"
          />
          <Submit busy={busy} label="Request OTP" />
        </form>
      ) : (
        <form onSubmit={handleRequestOTP} className="mt-6 space-y-4">
          <Field label="Full name" value={reg.fullName} onChange={(v) => setReg({ ...reg, fullName: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Age"
              value={reg.age}
              onChange={(v) => setReg({ ...reg, age: v.replace(/\D/g, "").slice(0, 3) })}
              inputMode="numeric"
            />
            <label className="block">
              <span className="mb-1.5 block text-sm text-[#4a4338]">Gender</span>
              <select
                value={reg.gender}
                onChange={(e) => setReg({ ...reg, gender: e.target.value })}
                className="w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-3.5"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <Field
            label="Mobile number"
            value={reg.phone}
            onChange={(v) => setReg({ ...reg, phone: v.replace(/\D/g, "").slice(0, 10) })}
            inputMode="numeric"
            placeholder="10-digit number"
          />
          <label className="block">
            <span className="mb-1.5 block text-sm text-[#4a4338]">Preferred language</span>
            <select
              value={reg.preferredLanguage}
              onChange={(e) => setReg({ ...reg, preferredLanguage: e.target.value })}
              className="w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-3.5"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native} — {l.label}
                </option>
              ))}
            </select>
          </label>
          <Submit busy={busy} label="Send Verification Code" />
        </form>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "numeric" | "text"; }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-[#4a4338]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-3.5 text-base outline-none focus:border-[#0f5c61]"
      />
    </label>
  );
}

function Submit({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0f5c61] px-6 py-3.5 font-semibold text-white disabled:opacity-60 transition"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}
