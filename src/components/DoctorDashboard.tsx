// src/components/DoctorDashboard.tsx
import React, { useState } from 'react';
import { RedFlagAlert } from '../utils/clinicalTriage';
import { StructuredDocTimeline } from '../utils/documentProcessor';

interface Props {
  patient: {
    name: string;
    abhaId: string;
    age: number;
    gender: string;
    tokenNo: string;
    redFlag: RedFlagAlert;
    summary: {
      chiefComplaint: string;
      hpi: string;
      pastMedicalHistory: string;
      drugAllergies: string[];
      currentMedications: string[];
      reviewOfSystems: string;
    };
    timelines: StructuredDocTimeline[];
  };
  onApproveAndPrescribe: (finalSummary: any) => void;
}

export const DoctorDashboard: React.FC<Props> = ({ patient, onApproveAndPrescribe }) => {
  const [editableSummary, setEditableSummary] = useState(patient.summary);
  const [physicianNotes, setPhysicianNotes] = useState('');
  const [selectedTab, setSelectedTab] = useState<'timeline' | 'investigations' | 'ayush'>('timeline');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      {/* Header bar */}
      <header className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6 shadow-md">
        <div className="flex items-center gap-4">
          <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-lg px-3 py-1 rounded-lg font-mono font-bold">
            TOKEN #{patient.tokenNo}
          </span>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              {patient.name} ({patient.age}y / {patient.gender})
              <span className="text-xs font-mono font-normal text-slate-400">ABHA: {patient.abhaId}</span>
            </h1>
          </div>
        </div>

        {patient.redFlag.isCritical && (
          <div className="flex items-center gap-2 bg-rose-500/20 border border-rose-500 px-4 py-2 rounded-lg text-rose-300 animate-pulse text-sm font-bold">
            <span>🚨 {patient.redFlag.alertType}</span>
            <span className="text-xs bg-rose-600 text-white px-2 py-0.5 rounded">STAT TRIAGE</span>
          </div>
        )}

        <button
          onClick={() => onApproveAndPrescribe({ ...editableSummary, physicianNotes })}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2 rounded-lg shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 text-sm"
        >
          ✓ Confirm & Push to ABDM PHR
        </button>
      </header>

      {/* Main Dual-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Pane: AI Structured Intake Draft (Editable) */}
        <div className="lg:col-span-7 bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-slate-700 pb-3">
            <h2 className="text-base font-bold text-cyan-400 flex items-center gap-2">
              📋 AI Pre-Consultation Intake Draft
              <span className="text-xs bg-slate-700 text-slate-300 font-normal px-2 py-0.5 rounded">Physician Verified</span>
            </h2>
            <span className="text-xs text-slate-400">Click any field to edit</span>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Chief Complaint</label>
            <input
              type="text"
              value={editableSummary.chiefComplaint}
              onChange={(e) => setEditableSummary({ ...editableSummary, chiefComplaint: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 mt-1 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">History of Present Illness (SOCRATES)</label>
            <textarea
              rows={3}
              value={editableSummary.hpi}
              onChange={(e) => setEditableSummary({ ...editableSummary, hpi: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 mt-1 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-400 font-bold">Past Medical History</label>
              <textarea
                rows={2}
                value={editableSummary.pastMedicalHistory}
                onChange={(e) => setEditableSummary({ ...editableSummary, pastMedicalHistory: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-cyan-500 mt-1 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-rose-400 font-bold">Allergies & Adverse Reactions</label>
              <textarea
                rows={2}
                value={editableSummary.drugAllergies.join(', ')}
                onChange={(e) => setEditableSummary({ ...editableSummary, drugAllergies: e.target.value.split(',') })}
                className="w-full bg-slate-900 border border-rose-900/50 rounded-lg p-2 text-sm text-rose-200 focus:border-rose-500 mt-1 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-amber-400 font-bold">Physician Final Clinical Impression & Rx</label>
            <textarea
              rows={3}
              placeholder="Enter clinical decision, investigations ordered, or prescription modifications..."
              value={physicianNotes}
              onChange={(e) => setPhysicianNotes(e.target.value)}
              className="w-full bg-slate-900 border border-amber-500/40 rounded-lg p-2.5 text-sm text-white focus:border-amber-500 mt-1 focus:outline-none"
            />
          </div>
        </div>

        {/* Right Pane: Scanned Docs, Timeline & Abnormal Value Highlighting */}
        <div className="lg:col-span-5 bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col">
          <div className="flex gap-2 border-b border-slate-700 pb-3 mb-4">
            {(['timeline', 'investigations'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg capitalize transition ${
                  selectedTab === tab ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'timeline' ? '📅 Chronological Timeline' : '🧪 Flagged Labs'}
              </button>
            ))}
          </div>

          {selectedTab === 'timeline' && (
            <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
              {patient.timelines.map((doc) => (
                <div key={doc.id} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-cyan-400">{doc.docType}</span>
                    <span className="text-xs text-slate-500 font-mono">{doc.date}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium">{doc.prescriberHospital}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {doc.diagnoses.map((d, i) => (
                      <span key={i} className="text-[10px] bg-slate-800 text-slate-300 border border-slate-600 px-2 py-0.5 rounded">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedTab === 'investigations' && (
            <div className="space-y-3 overflow-y-auto max-h-[500px]">
              {patient.timelines.flatMap((t) => t.investigations).map((inv, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border flex justify-between items-center ${
                    inv.status === 'CRITICAL' || inv.status === 'HIGH'
                      ? 'bg-rose-950/40 border-rose-700 text-rose-200'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold">{inv.testName}</p>
                    <p className="text-[10px] opacity-75">
                      Ref: {inv.referenceRange[0]} - {inv.referenceRange[1]} {inv.unit}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold">
                      {inv.observedValue} {inv.unit}
                    </span>
                    <span className="block text-[10px] uppercase font-bold tracking-wider">{inv.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};