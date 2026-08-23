"use client";

import { LANGUAGES } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";

type Tab = "signin" | "register";

export function PatientLoginForm() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [reg, setReg] = useState({
    fullName: "",
    age: "",
    gender: "male",
    phone: "",
    abhaId: "",
    preferredLanguage: "en",
  });

  async function enter(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "patient", ...payload }),
      });
    } catch {
      // Demo mode never blocks entry.
    }
    router.replace("/portal");
    router.refresh();
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#c9842a]">Patient portal</p>
      <h1 className="serif mt-2 text-4xl">
        {tab === "signin" ? "Welcome back" : "Create your health login"}
      </h1>
      <p className="mt-2 text-sm text-[#4a4338]">
        {tab === "signin"
          ? "Enter your ABHA ID or mobile number to continue. This demo opens straight away."
          : "Tell us as much or as little as you like — the demo lets you straight in."}
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enter({ identifier });
          }}
          className="mt-6 space-y-4"
        >
          <Field
            label="ABHA ID or mobile number"
            value={identifier}
            onChange={setIdentifier}
            placeholder="9810011122"
          />
          <Submit busy={busy} label="Enter patient portal" />
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enter(reg);
          }}
          className="mt-6 space-y-4"
        >
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
          <Field
            label="ABHA ID (optional)"
            value={reg.abhaId}
            onChange={(v) => setReg({ ...reg, abhaId: v })}
            placeholder="12-3456-7890-1234"
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
                  {l.native} · {l.label}
                </option>
              ))}
            </select>
          </label>
          <Submit busy={busy} label="Create and continue" />
        </form>
      )}

      <button
        type="button"
        onClick={() => void enter({})}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[#0f5c61]/25 px-6 py-3 text-sm font-medium text-[#0f5c61] hover:bg-[#0f5c61]/5"
      >
        Skip and explore as a patient <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-[#4a4338]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0f5c61]" />
        Demonstration environment — no passwords or OTPs are collected. In a live deployment this
        screen would authenticate against ABDM and the Digital Personal Data Protection Act, 2023.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
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
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0f5c61] px-6 py-3.5 font-semibold text-white disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}
