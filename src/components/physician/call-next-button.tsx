"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play } from "lucide-react";

export function CallNextButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function callNext() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to call next");
      setMsg(`🔊 Now calling ${data.called.tokenNumber} (${data.called.priority})`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={callNext}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-2xl bg-[#08363a] px-5 py-3 text-sm font-semibold text-[#f6f0e4] transition hover:bg-[#0f5c61] disabled:opacity-60"
      >
        <Play className="h-4 w-4" />
        {busy ? "Calling…" : "▶ Call next patient"}
      </button>
      {msg && <p className="mt-2 text-xs font-medium text-[#0f5c61]">{msg}</p>}
      {err && <p className="mt-2 text-xs text-[#b42318]">{err}</p>}
    </div>
  );
}