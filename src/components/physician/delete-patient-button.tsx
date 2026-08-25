"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Admin-only: permanently delete a patient and all their sessions. */
export function DeletePatientButton({ patientId, name }: { patientId: string; name?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `Permanently delete ${name ?? "this patient"} and ALL of their submissions? This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Failed to delete patient");
      }
    } catch {
      window.alert("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleDelete}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#b42318] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#8a1710] disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      {busy ? "Deleting…" : "Delete patient"}
    </button>
  );
}