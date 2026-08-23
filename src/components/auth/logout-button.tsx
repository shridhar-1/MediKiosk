"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton({
  kind,
  className = "",
  label = "Sign out",
}: {
  kind: "patient" | "staff";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/auth/logout?kind=${kind}`, { method: "POST" });
        router.replace(kind === "patient" ? "/login/patient" : "/login/staff");
        router.refresh();
      }}
      className={`inline-flex items-center gap-1.5 text-sm text-[#4a4338] hover:text-[#b42318] disabled:opacity-60 ${className}`}
    >
      <LogOut className="h-4 w-4" />
      {busy ? "…" : label}
    </button>
  );
}
