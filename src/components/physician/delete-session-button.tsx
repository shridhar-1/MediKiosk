"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Permanently deletes a submission. Used by hospital staff on the queue and
 * records screens. State is kept in the parent so the list can be refreshed.
 */
export function DeleteSessionButton({
  sessionId,
  label = "Delete",
  onDeleted,
}: {
  sessionId: string;
  label?: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm("Permanently delete this submission? This cannot be undone.");
    if (!ok) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        if (onDeleted) {
          onDeleted();
        } else {
          router.refresh();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete");
      }
    } catch {
      setError("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={handleDelete}
        title="Delete submission"
        className="inline-flex items-center gap-1.5 rounded-full border border-[#b42318]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#b42318] transition hover:bg-[#b42318] hover:text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {label}
      </button>
      {error && <span className="text-[11px] text-[#b42318]">{error}</span>}
    </span>
  );
}