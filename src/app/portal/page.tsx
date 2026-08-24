"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  PlusCircle, Trash2, Calendar, FileText, User, 
  Clock, ShieldCheck, ArrowRight, Activity, ChevronDown, ChevronUp 
} from "lucide-react";

export default function PatientPortalPage() {
  const router = useRouter();
  const [patientProfile, setPatientProfile] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const profileStr = localStorage.getItem("patient_profile");
    if (!profileStr) {
      // If no profile in localStorage, redirect to login
      router.push("/login/patient");
      return;
    }

    const profile = JSON.parse(profileStr);
    setPatientProfile(profile);

    // Fetch previous submissions for this patient
    fetchSubmissions(profile);
  }, []);

  const fetchSubmissions = async (profile: any) => {
    setLoading(true);
    try {
      let url = "/api/sessions";
      if (profile.phoneNumber) {
        url += `?phone=${encodeURIComponent(profile.phoneNumber)}`;
      } else if (profile.abhaId && profile.abhaId !== "N/A") {
        url += `?abhaId=${encodeURIComponent(profile.abhaId)}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to load submissions", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubmission = async (sessionId: string) => {
    if (!confirm("Are you sure you want to delete this submission record?")) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== sessionId));
        alert("Submission deleted successfully.");
      } else {
        alert("Failed to delete submission.");
      }
    } catch (e) {
      alert("Error deleting record.");
    }
  };

  if (!patientProfile) {
    return <div className="min-h-screen bg-[#fffdf7] flex items-center justify-center">Loading portal...</div>;
  }

  return (
    <div className="min-h-screen bg-[#fffdf7] p-4 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* TOP BAR / BRANDING */}
        <div className="flex items-center justify-between border-b border-[#1b1712]/10 pb-4">
          <div>
            <span className="text-xs uppercase tracking-[0.2em] text-[#c9842a]">MediKiosk Patient Portal</span>
            <h1 className="text-3xl font-bold text-[#08363a] mt-1">My Medical Submissions</h1>
          </div>
          <Link
            href="/login/patient"
            className="text-xs text-[#4a4338] underline hover:text-[#0f5c61]"
          >
            Switch Account / Logout
          </Link>
        </div>

        {/* PATIENT CARD */}
        <div className="bg-white rounded-2xl p-6 border border-[#1b1712]/10 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xl">
              <User className="h-7 w-7 text-teal-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#08363a]">{patientProfile.fullName}</h2>
              <p className="text-sm text-[#4a4338] mt-0.5">
                {patientProfile.phoneNumber || "No Phone"} • {patientProfile.email || "No Email"}
              </p>
              {patientProfile.abhaId && patientProfile.abhaId !== "N/A" && (
                <div className="inline-flex items-center gap-1 bg-teal-50 text-teal-800 text-xs px-2.5 py-0.5 rounded-full font-medium mt-2 border border-teal-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                  ABHA: {patientProfile.abhaId}
                </div>
              )}
            </div>
          </div>

          <Link
            href="/kiosk"
            className="inline-flex items-center gap-2 bg-[#0f5c61] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#08363a] transition shadow-md"
          >
            <PlusCircle className="h-5 w-5" /> Start New Kiosk Intake
          </Link>
        </div>

        {/* SUBMISSIONS LIST */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-[#08363a] flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#c9842a]" /> Previous Intakes ({submissions.length})
          </h3>

          {loading ? (
            <div className="bg-white rounded-2xl p-8 text-center text-[#4a4338] border">
              Loading your previous records...
            </div>
          ) : submissions.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border space-y-4">
              <FileText className="h-12 w-12 text-gray-300 mx-auto" />
              <p className="text-[#4a4338] font-medium">No previous submission records found for your account.</p>
              <Link
                href="/kiosk"
                className="inline-block bg-[#0f5c61] text-white px-6 py-2.5 rounded-full text-sm font-semibold"
              >
                Create Your First Clinical History →
              </Link>
            </div>
          ) : (
            submissions.map((item) => {
              const isExpanded = expandedId === item.id;
              const summary = item.summary;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-[#1b1712]/10 shadow-sm overflow-hidden transition"
                >
                  {/* Item Header */}
                  <div className="p-5 flex flex-wrap items-center justify-between gap-4 bg-white">
                    <div className="flex items-start gap-4">
                      <div className="bg-[#f6f0e4] text-[#08363a] px-3 py-2 rounded-xl text-center font-bold min-w-[90px]">
                        <span className="block text-xs text-[#c9842a] uppercase">TOKEN</span>
                        <span className="text-lg">{item.tokenNumber || "OPD"}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#08363a] text-lg">
                            {summary?.chiefComplaint || item.department || "General Consultation"}
                          </span>
                          <span className="text-xs uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                            {item.mode}
                          </span>
                          {item.priority === "emergency" && (
                            <span className="text-xs uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">
                              Emergency
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#4a4338] mt-1 flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          {new Date(item.startedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f5c61] bg-teal-50 px-4 py-2 rounded-full hover:bg-teal-100"
                      >
                        {isExpanded ? "Hide Details" : "View Details"}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      <button
                        onClick={() => handleDeleteSubmission(item.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-full transition"
                        title="Delete Submission"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Summary View */}
                  {isExpanded && (
                    <div className="border-t bg-[#fffdf7] p-5 text-sm space-y-4">
                      {summary ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm">
                          <div>
                            <span className="font-bold text-[#c9842a] uppercase block">Chief Complaint</span>
                            <p className="mt-1 text-gray-800">{summary.chiefComplaint}</p>
                          </div>
                          <div>
                            <span className="font-bold text-[#c9842a] uppercase block">History of Present Illness (HPI)</span>
                            <p className="mt-1 text-gray-800">{summary.hpi}</p>
                          </div>
                          <div>
                            <span className="font-bold text-[#c9842a] uppercase block">Current Medications</span>
                            <p className="mt-1 text-gray-800">{summary.drugs || "None reported"}</p>
                          </div>
                          <div>
                            <span className="font-bold text-[#c9842a] uppercase block">Allergies</span>
                            <p className="mt-1 text-gray-800">{summary.allergies || "No known allergies"}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">No summary details available for this session.</p>
                      )}

                      <div className="pt-2 border-t flex justify-end">
                        <Link
                          href={`/physician/${item.id}`}
                          className="text-xs font-semibold text-teal-800 underline hover:text-teal-900"
                        >
                          View Doctor Consultation Screen →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}