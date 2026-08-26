"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck } from "lucide-react";

type Alert = {
  sessionId: string;
  tokenNumber: string | null;
  priority: "routine" | "urgent" | "emergency";
  department: string;
  patientName: string;
  patientAge: number | null;
  patientGender: string | null;
  redFlagTriggered: boolean;
  redFlagReasons: string[] | null;
  minutesAgo: number | null;
};

const POLL_MS = 8000;

const PRIORITY_STYLE: Record<Alert["priority"], string> = {
  emergency: "bg-red-50 text-red-800 ring-red-200",
  urgent: "bg-amber-50 text-amber-800 ring-amber-200",
  routine: "bg-teal-50 text-teal-800 ring-teal-200",
};

/**
 * LiveAlerts — the hospital's automated notification receiver.
 * Polls /api/notifications (the same feed backed by his_events audit rows)
 * and surfaces every new submission the moment it lands. Emergency cases
 * raise a banner + browser notification so the triage desk is paged even if
 * the console is in a background tab.
 */
export default function LiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [banner, setBanner] = useState<Alert | null>(null);
  const seen = useRef<Set<string> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { alerts: Alert[] };
      setAlerts(data.alerts);

      const ids = new Set(data.alerts.map((a) => a.sessionId));
      if (seen.current === null) {
        // first load after opening the console: don't toast-storm old items
        seen.current = ids;
        return;
      }

      const fresh = data.alerts.filter((a) => !seen.current!.has(a.sessionId));
      seen.current = ids;
      if (fresh.length) {
        setUnread((u) => u + fresh.length);
        const emergency = fresh.find((a) => a.priority === "emergency");
        if (emergency) {
          setBanner(emergency);
          setTimeout(() => setBanner(null), 20000);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("🚨 EMERGENCY intake at MediKiosk", {
              body: `${emergency.patientName} · ${emergency.tokenNumber ?? ""}\n${emergency.redFlagReasons?.[0] ?? ""}`,
            });
          }
        }
      }
    } catch {
      // offline / serverless cold start — next poll will catch up
    }
  }, []);

  useEffect(() => {
    void poll();
    const iv = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  return (
    <div className="relative">
      {banner && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          <span className="animate-pulse">🚨 EMERGENCY</span>
          <span className="mx-2">
            {banner.patientName} · {banner.tokenNumber} — {banner.redFlagReasons?.[0] ?? "red flag detected"}
          </span>
          <Link href={`/physician/${banner.sessionId}`} className="underline underline-offset-2">
            Review now →
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission();
          }
        }}
        className="relative flex items-center gap-2 rounded-full border border-[#1b1712]/10 bg-white px-3.5 py-2 text-sm font-medium text-[#1b1712] hover:border-[#0f5c61]/40"
        aria-label="Hospital notifications"
      >
        {unread > 0 ? <BellRing className="h-4 w-4 text-[#0f5c61]" /> : <Bell className="h-4 w-4 text-[#4a4338]" />}
        Alerts
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 max-w-[92vw] rounded-2xl border border-[#1b1712]/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#1b1712]/10 px-4 py-3">
            <p className="text-sm font-semibold text-[#1b1712]">Hospital notifications</p>
            <button
              type="button"
              onClick={() => setUnread(0)}
              className="flex items-center gap-1 text-xs text-[#4a4338] hover:text-[#0f5c61]"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {alerts.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-[#4a4338]">
                No submissions in the last hour. New intakes appear here automatically (polled every {POLL_MS / 1000}s).
              </p>
            )}
            {alerts.map((a) => (
              <Link
                key={a.sessionId}
                href={`/physician/${a.sessionId}`}
                onClick={() => setOpen(false)}
                className={`block border-b border-[#1b1712]/5 px-4 py-3 last:border-b-0 hover:bg-[#fffdf7] ${
                  a.priority === "emergency" ? "bg-red-50/40" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[#1b1712]">
                    {a.patientName}
                    <span className="ml-2 text-xs font-normal text-[#4a4338]">
                      {a.patientAge ?? "?"}/{a.patientGender?.[0]?.toUpperCase() ?? "?"} · {a.tokenNumber ?? "token pending"}
                    </span>
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${PRIORITY_STYLE[a.priority]}`}>
                    {a.priority}
                  </span>
                </div>
                {a.redFlagReasons && a.redFlagReasons.length > 0 && (
                  <p className="mt-1 line-clamp-2 text-xs text-red-800">⚑ {a.redFlagReasons[0]}</p>
                )}
                <p className="mt-1 text-[11px] text-[#4a4338]">
                  {a.department.replace(/_/g, " ")} · submitted{" "}
                  {a.minutesAgo === null ? "—" : a.minutesAgo < 1 ? "just now" : `${a.minutesAgo} min ago`}
                </p>
              </Link>
            ))}
          </div>
          <p className="border-t border-[#1b1712]/10 px-4 py-2 text-[10px] text-[#4a4338]">
            Automated alerts · email/WhatsApp also sent to the triage desk · audited in HIS events
          </p>
        </div>
      )}
    </div>
  );
}