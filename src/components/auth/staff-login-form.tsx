"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

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
      // Login API fallback
    }
    router.replace("/physician");
    router.refresh();
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#c9842a]">Clinical console</p>
      <h1 className="serif mt-2 text-4xl">Hospital staff sign in</h1>
      <p className="mt-2 text-sm text-[#4a4338]">
        Enter your authorized facility credentials to access the clinical console and OPD queue.
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
    </div>
  );
}
