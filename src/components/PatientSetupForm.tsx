"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, Building2, CheckCircle2, User, Mail } from "lucide-react";

// Mock list of hospitals for demonstration
const SAMPLE_HOSPITALS = [
  { id: 1, name: "City Care General Hospital", address: "Station Road, Main Circle", distance: "1.2 km" },
  { id: 2, name: "Apollo MediKiosk Hub", address: "Sector 4, Near Metro Gate 2", distance: "3.5 km" },
  { id: 3, name: "District Government Hospital", address: "Civil Lines, Opp. Park", distance: "5.0 km" },
  { id: 4, name: "Sunrise Multi-Specialty Clinic", address: "Ring Road, Phase 1", distance: "7.8 km" },
];

export default function PatientSetupForm() {
  const router = useRouter();
  
  // Form States
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Detect GPS Location
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsDetecting(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setDetectedAddress(`Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)} (Current Location)`);
        setLocationInput("My Current Location");
        setIsDetecting(false);
      },
      (error) => {
        console.error(error);
        alert("Unable to fetch location. Please type your city/place manually.");
        setIsDetecting(false);
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHospitalId) {
      alert("Please select a hospital to proceed.");
      return;
    }

    setSubmitting(true);

    // Save patient profile details to localStorage (or API)
    const patientProfile = {
      fullName,
      email,
      location: locationInput || detectedAddress,
      selectedHospital: SAMPLE_HOSPITALS.find(h => h.id === selectedHospitalId),
    };

    localStorage.setItem("patient_profile", JSON.stringify(patientProfile));

    setTimeout(() => {
      // Redirect to main Kiosk application
      router.push("/kiosk");
    }, 1000);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
      <div className="mb-6 border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">Complete Patient Profile</h2>
        <p className="text-sm text-gray-500 mt-1">
          Provide your details to connect with the nearest MediKiosk center.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Full Name *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                required
                placeholder="e.g. Ramesh Kumar"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email Address *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="email"
                required
                placeholder="ramesh@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Location Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Your Location / Area
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Enter city, town, or pincode"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-black focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleDetectLocation}
              disabled={isDetecting}
              className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-lg border border-teal-200 font-medium hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              <Navigation className="h-4 w-4" />
              {isDetecting ? "Detecting..." : "GPS Detect"}
            </button>
          </div>
          {detectedAddress && (
            <p className="text-xs text-teal-600 mt-1">{detectedAddress}</p>
          )}
        </div>

        {/* Hospital Finder */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Select Nearest Hospital / Kiosk Unit *
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SAMPLE_HOSPITALS.map((hospital) => {
              const isSelected = selectedHospitalId === hospital.id;
              return (
                <div
                  key={hospital.id}
                  onClick={() => setSelectedHospitalId(hospital.id)}
                  className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start justify-between ${
                    isSelected
                      ? "border-teal-600 bg-teal-50/50 shadow-sm"
                      : "border-gray-200 hover:border-teal-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Building2 className={`h-5 w-5 mt-0.5 ${isSelected ? "text-teal-600" : "text-gray-400"}`} />
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm">{hospital.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{hospital.address}</p>
                      <span className="inline-block mt-2 text-[11px] font-medium text-teal-700 bg-teal-100/60 px-2 py-0.5 rounded">
                        {hospital.distance} away
                      </span>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-5 w-5 text-teal-600 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-teal-700 text-white font-semibold py-3 rounded-xl hover:bg-teal-800 transition-colors disabled:bg-gray-400"
        >
          {submitting ? "Saving Profile..." : "Proceed to MediKiosk Portal →"}
        </button>
      </form>
    </div>
  );
}