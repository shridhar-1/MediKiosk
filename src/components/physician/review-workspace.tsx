"use client";

import type { AyushAssessment, ClinicalSummary, Consent, Document, HistoryResponse, HisEvent, Patient, Session } from "@/db/schema";
import { DEPARTMENTS } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Bundle = {
  session: Session;
  patient: Patient;
  answers: HistoryResponse[];
  documents: Document[];
  summary: ClinicalSummary | null;
  consents: Consent[];
  events: HisEvent[];
};

const FIELDS: { key: keyof ClinicalSummary; label: string }[] = [
  { key: "chiefComplaint", label: "Chief complaint" },
  { key: "hpi", label: "History of present illness" },
  { key: "pastMedical", label: "Past medical history" },
  { key: "pastSurgical", label: "Past surgical history" },
  { key: "drugs", label: "Drug history" },
  { key: "allergies", label: "Allergies" },
  { key: "familyHistory", label: "Family history" },
  { key: "personalHistory", label: "Personal history" },
  { key: "reviewOfSystems", label: "Review of systems" },
  { key: "investigationsSummary", label: "Prior investigations" },
  { key: "medicationsExtracted", label: "Medicines on papers" },
];

export function ReviewWorkspace({ bundle, reviewer }: { bundle: Bundle; reviewer?: string }) {
  const router = useRouter();
  const { session, patient, documents, summary, consents, events } = bundle;
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (summary) {
      for (const f of FIELDS) {
        const v = summary[f.key];
        if (typeof v === "string") init[f.key] = v;
      }
    }
    return init;
  });
  const [notes, setNotes] = useState(session.physicianNotes ?? "");
  const [reviewedBy, setReviewedBy] = useState(session.reviewedBy ?? reviewer ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const labs = useMemo(() => {
    return documents.flatMap((d) =>
      (d.extractedJson?.labs ?? []).map((lab) => ({
        ...lab,
        when: d.documentDate,
        facility: d.facilityName,
      })),
    );
  }, [documents]);

  const timeline = useMemo(() => {
    return [...documents].sort((a, b) => (a.documentDate ?? "").localeCompare(b.documentDate ?? ""));
  }, [documents]);

  async function save(confirm: boolean) {
    if (!summary) return;
    setBusy(true);
    setMessage("");
    try {
      await fetch(`/api/sessions/${session.id}/summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          status: confirm ? "confirmed" : "draft",
          reviewedBy,
          physicianNotes: notes,
        }),
      });
      setMessage(confirm ? "Confirmed and filed to HIS / ABHA." : "Draft amendments saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const dept = DEPARTMENTS.find((d) => d.id === session.department)?.label ?? session.department;
  const ayush = summary?.ayushAssessment as AyushAssessment | null;

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#c9842a]">
              {dept} · {session.mode}
            </p>
            <h1 className="serif mt-1 text-4xl">{patient.fullName}</h1>
            <p className="mt-2 text-sm text-[#4a4338]">
              {patient.age} years · {patient.gender} · {patient.phone ?? "no phone"} ·{" "}
              {patient.abhaId ? `ABHA ${patient.abhaId}` : "ABHA not linked"}
            </p>
          </div>
          <div className="ticket rounded-3xl px-6 py-4 text-center">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#4a4338]">Token</p>
            <p className="serif text-3xl text-[#08363a]">{session.tokenNumber}</p>
            <p className="mt-1 text-xs uppercase">{session.priority}</p>
          </div>
        </div>

        {session.redFlagTriggered && (
          <aside className="mt-6 rounded-3xl bg-[#b42318] px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">Red flags from kiosk</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {(session.redFlagReasons ?? []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </aside>
        )}

        {!summary && (
          <p className="mt-8 rounded-3xl bg-[#fffdf7] p-6 text-sm">No summary generated yet for this session.</p>
        )}

        {summary && (
          <div className="mt-8 space-y-5">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="text-xs uppercase tracking-[0.16em] text-[#c9842a]">{f.label}</span>
                <textarea
                  value={fields[f.key] ?? ""}
                  onChange={(e) => setFields((curr) => ({ ...curr, [f.key]: e.target.value }))}
                  rows={f.key === "hpi" || f.key === "investigationsSummary" ? 5 : 2}
                  className="mt-1.5 w-full rounded-2xl border border-[#1b1712]/10 bg-[#fffdf7] px-4 py-3 text-[15px] leading-relaxed"
                />
              </label>
            ))}

            {ayush && (
              <section className="rounded-[28px] bg-[#08363a] p-6 text-[#f6f0e4]">
                <p className="text-xs uppercase tracking-[0.18em] text-[#e8d5a3]">Dashavidha Pariksha</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {Object.entries(ayush)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[11px] uppercase tracking-wider text-[#e8d5a3]/80">{k}</p>
                        <p className="mt-0.5 text-sm">{v}</p>
                      </div>
                    ))}
                </div>
              </section>
            )}

            <label className="block">
              <span className="text-xs uppercase tracking-[0.16em] text-[#c9842a]">Physician note (not shown to patient)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="mt-1.5 w-full rounded-2xl border border-[#1b1712]/10 bg-[#fffdf7] px-4 py-3"
                placeholder="Plan, differentials, orders…"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <input
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                className="h-12 rounded-full border border-[#1b1712]/10 bg-white px-4"
                placeholder="Your name"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(false)}
                className="h-12 rounded-full bg-[#f6f0e4] px-5 font-medium"
              >
                Save amendments
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(true)}
                className="h-12 rounded-full bg-[#0f5c61] px-6 font-semibold text-white"
              >
                Confirm to HIS / ABHA
              </button>
            </div>
            {message && <p className="text-sm text-[#1f6b45]">{message}</p>}
            {summary.status === "confirmed" && (
              <p className="text-sm text-[#4a4338]">
                Confirmed {summary.confirmedAt ? new Date(summary.confirmedAt).toLocaleString("en-IN") : ""} by{" "}
                {session.reviewedBy ?? "physician"}.
              </p>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-5">
        <section className="rounded-[28px] bg-[#fffdf7] p-5 ring-1 ring-[#1b1712]/8">
          <h2 className="text-xs uppercase tracking-[0.16em] text-[#c9842a]">Consent ledger</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {consents.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="capitalize">{c.consentType.replace(/_/g, " ")}</span>
                <span className={c.granted ? "text-[#1f6b45]" : "text-[#b42318]"}>{c.granted ? "granted" : "denied"}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[28px] bg-[#fffdf7] p-5 ring-1 ring-[#1b1712]/8">
          <h2 className="text-xs uppercase tracking-[0.16em] text-[#c9842a]">Abnormal labs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {labs.filter((l) => l.abnormal).map((l) => (
              <li key={`${l.name}-${l.when}`} className="flex justify-between gap-2">
                <span>
                  {l.name}{" "}
                  <span className="text-[#b42318]">
                    {l.value}
                    {l.flag === "high" ? " ↑" : " ↓"}
                  </span>
                </span>
                <span className="text-xs text-[#4a4338]">{l.when}</span>
              </li>
            ))}
            {labs.filter((l) => l.abnormal).length === 0 && <li className="text-[#4a4338]">None flagged</li>}
          </ul>
        </section>

        <section className="rounded-[28px] bg-[#fffdf7] p-5 ring-1 ring-[#1b1712]/8">
          <h2 className="text-xs uppercase tracking-[0.16em] text-[#c9842a]">Document timeline</h2>
          <ol className="mt-3 space-y-3">
            {timeline.map((d) => (
              <li key={d.id} className="border-l-2 border-[#c9842a]/50 pl-3">
                <p className="text-xs text-[#4a4338]">{d.documentDate}</p>
                <p className="text-sm font-medium">{d.fileName}</p>
                <p className="text-xs text-[#4a4338]">{d.facilityName}</p>
                {d.extractedJson?.diagnoses?.length ? (
                  <p className="mt-1 text-xs">{d.extractedJson.diagnoses.join(" · ")}</p>
                ) : null}
              </li>
            ))}
            {timeline.length === 0 && <p className="text-sm text-[#4a4338]">No papers attached.</p>}
          </ol>
        </section>

        <section className="rounded-[28px] bg-[#08363a] p-5 text-[#f6f0e4]">
          <h2 className="text-xs uppercase tracking-[0.16em] text-[#e8d5a3]">HIS / FHIR events</h2>
          <ul className="mt-3 space-y-2 text-xs">
            {events.map((e) => (
              <li key={e.id}>
                <p className="font-medium">{e.eventType}</p>
                <p className="text-[#f6f0e4]/70">{new Date(e.createdAt).toLocaleString("en-IN")}</p>
              </li>
            ))}
            {events.length === 0 && <li>Nothing pushed yet — confirm to file.</li>}
          </ul>
        </section>
      </aside>
    </main>
  );
}
