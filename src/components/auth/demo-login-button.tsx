"use client";

// ⚡ One-click demo login for evaluators (SIH judges, mentors, anyone).
// Uses the existing /api/auth/demo backend — no OTP, no password.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap } from "lucide-react";

export function DemoLoginButton({
  role,
  className,
  label,
}: {
  role: "patient" | "staff";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function enter() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          role === "patient"
            ? { kind: "patient", identifier: "9999900010", fullName: "Demo Patient" }
            : { kind: "staff", email: "dr.meena@hospital.in" },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Login failed");
      }
      router.push(role === "patient" ? "/kiosk" : "/physician");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={enter}
        disabled={busy}
        className={
          className ??
          "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f5c61] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#08363a] disabled:opacity-60"
        }
      >
        <Zap className="h-4 w-4" />
        {busy ? "Entering…" : (label ?? (role === "patient" ? "⚡ One-click demo — patient" : "⚡ One-click demo — doctor"))}
      </button>
      {err && <p className="mt-2 text-xs text-[#b42318]">{err}</p>}
    </div>
  );
}