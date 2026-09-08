"use client";

// 📺 MediKiosk Token Board — big screen for the hospital waiting area.
// Shows "NOW SERVING" + upcoming tokens, refreshes every 10 seconds.
// Works on any smart TV browser: just open /board and leave it on.

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand";
import { roomFor } from "@/lib/facility";

type Row = {
  id: string;
  tokenNumber: string;
  department: string;
  status: string;
  priority: string;
  startedAt: string;
  calledAt?: string | null;
  submittedAt?: string | null;
  expiresAt?: string | null;
  patient: { fullName: string };
};

// Queue algorithm (same rules as the server lib): emergency → urgent →
// longest waiting. Overdue no-show tokens drop out (expired).
function queueSort(rows: Row[]): Row[] {
  const rank: Record<string, number> = { emergency: 0, urgent: 1, routine: 2 };
  const nowMs = Date.now();
  const waiting = rows.filter(
    (r) =>
      (r.status === "submitted" || r.status === "summary") &&
      !(r.expiresAt && !r.calledAt && new Date(r.expiresAt).getTime() < nowMs),
  );
  return waiting.sort((a, b) => {
    const p = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
    if (p !== 0) return p;
    const ta = new Date(a.submittedAt ?? a.startedAt).getTime();
    const tb = new Date(b.submittedAt ?? b.startedAt).getTime();
    return ta - tb;
  });
}

function clock(d: Date) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function BoardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState<Date>(new Date());
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/sessions", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) {
          setRows((data.sessions ?? []).slice(0, 6));
          setError("");
        }
      } catch {
        if (alive) setError("Connection lost — retrying…");
      }
    }
    void load();
    const poll = setInterval(load, 10_000);
    const tick = setInterval(() => setNow(new Date()), 1_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  // NOW SERVING = the patient the doctor explicitly CALLED (latest calledAt
  // today); if none called yet, the queue's next patient (preview).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const calledRows = rows
    .filter((r) => r.calledAt && new Date(r.calledAt).getTime() >= startOfDay.getTime())
    .sort((a, b) => new Date(b.calledAt!).getTime() - new Date(a.calledAt!).getTime());
  const sortedQueue = queueSort(rows);
  const active = calledRows[0] ?? sortedQueue[0] ?? null;
  const upcoming = sortedQueue.filter((r) => r.id !== active?.id).slice(0, 4);
  const emergency = rows.some(
    (r) => r.priority === "emergency" || r.priority === "urgent",
  );
  const deptName = (id: string) =>
    id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <main className="min-h-screen bg-[#08363a] p-8 text-[#f6f0e4]">
      <div className="mx-auto max-w-6xl">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BrandMark />
            <div>
              <h1 className="text-2xl font-bold tracking-wide">TOKEN BOARD</h1>
              <p className="text-sm text-[#f6f0e4]/60">District Hospital · OPD</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold tabular-nums">{clock(now)}</p>
            <p className="text-sm text-[#f6f0e4]/60">
              {now.toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-xl bg-[#b42318] px-4 py-2 text-center text-sm">
            {error}
          </p>
        )}

        {/* NOW SERVING */}
        {active ? (
          <div
            className={`mt-10 rounded-[32px] p-10 text-center ring-4 ${
              emergency ? "bg-[#b42318] ring-[#f6f0e4]/30 animate-pulse" : "bg-[#f6f0e4] text-[#08363a] ring-[#0f5c61]/20"
            }`}
          >
            <p className={`text-sm font-bold uppercase tracking-[0.3em] ${emergency ? "text-white/80" : "text-[#0f5c61]"}`}>
              {emergency ? "🚨 Emergency — priority attention" : "Now Serving"}
            </p>
            <p className="mt-2 text-8xl font-black tabular-nums tracking-tight">
              {active.tokenNumber}
            </p>
            <p className={`mt-2 text-lg ${emergency ? "text-white/90" : "text-[#4a4338]"}`}>
              {deptName(active.department)}
            </p>
            {(() => {
              const room = roomFor(active.department, active.priority);
              return (
                <div
                  className={`mx-auto mt-3 inline-block max-w-md rounded-2xl px-4 py-2 text-sm ${
                    emergency ? "bg-black/20 text-white" : "bg-[#dceee8] text-[#0f5c61]"
                  }`}
                >
                  <p className="font-bold">
                    {emergency ? "🚨 Go to " : "→ Please go to "}
                    {room.room} · {room.floor}
                  </p>
                  <p className="opacity-80">{room.wing}</p>
                  <p className="opacity-70">{room.land}</p>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="mt-10 rounded-[32px] bg-[#f6f0e4]/10 p-10 text-center">
            <p className="text-2xl text-[#f6f0e4]/70">
              No patients yet — tokens will appear here automatically
            </p>
          </div>
        )}

        {/* upcoming */}
        {upcoming.length > 0 && (
          <>
            <p className="mt-10 text-xs font-bold uppercase tracking-[0.3em] text-[#f6f0e4]/50">
              Next in queue
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
              {upcoming.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-2xl p-5 text-center ${
                    r.priority === "emergency" || r.priority === "urgent"
                      ? "bg-[#b42318]"
                      : "bg-[#f6f0e4]/10"
                  }`}
                >
                  <p className="text-3xl font-bold tabular-nums">{r.tokenNumber}</p>
                  <p className="mt-1 truncate text-xs text-[#f6f0e4]/70">
                    {deptName(r.department)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-10 text-center text-xs text-[#f6f0e4]/40">
          Auto-refreshes every 10 seconds · Please wait for your turn
        </p>
      </div>
    </main>
  );
}