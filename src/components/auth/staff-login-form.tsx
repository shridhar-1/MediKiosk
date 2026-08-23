"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Lock, Stethoscope } from "lucide-react";

const ROLES = [
  { label: "Physician", email: "physician@medikiosk.in" },
  { label: "Triage nurse", email: "triage@medikiosk.in" },
  { label: "Superintendent", email: "admin@medikiosk.in" },
  { label: "Vaidya (AYUSH)", email: "vaidya@medikiosk.in" },
];

export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "staff", ...payload }),
      });
    } catch {
      // Demo mode never blocks entry.
    }
    router.replace("/physician");
    router.refresh();
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#c9842a]">Clinical console</p>
      <h1 className="serif mt-2 text-4xl">Hospital staff sign in</h1>
      <p className="mt-2 text-sm text-[#4a4338]">
        Enter your hospital email to continue. This demonstration opens the console immediately.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enter({ email });
        }}
        className="mt-6 space-y-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm text-[#4a4338]">Hospital email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@medikiosk.in"
            className="w-full rounded-2xl border border-[#1b1712]/12 bg-white px-4 py-3.5 outline-none focus:border-[#0f5c61]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#08363a] px-6 py-3.5 font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Enter console
        </button>
      </form>

      <button
        type="button"
        onClick={() => void enter({})}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-[#0f5c61]/25 px-6 py-3 text-sm font-medium text-[#0f5c61] hover:bg-[#0f5c61]/5"
      >
        Skip and explore the console <ArrowRight className="h-4 w-4" />
      </button>

      <div className="mt-6 rounded-[22px] border border-[#1b1712]/10 bg-[#fffdf7] p-4">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#c9842a]">
          <Stethoscope className="h-3.5 w-3.5" /> Enter as a role
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <button
              key={r.email}
              type="button"
              disabled={busy}
              onClick={() => void enter({ email: r.email })}
              className="rounded-2xl bg-[#f6f0e4] px-3 py-2.5 text-left text-sm hover:bg-[#eee3cd] disabled:opacity-60"
            >
              <span className="block font-medium">{r.label}</span>
              <span className="block text-[11px] text-[#4a4338]">Open console →</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[#4a4338]">
        Demonstration environment — no passwords or OTPs are collected. A live deployment would use
        facility-issued single sign-on with full audit logging.
      </p>
    </div>
  );
}
