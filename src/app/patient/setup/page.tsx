import PatientSetupForm from "@/components/PatientSetupForm";

export default function PatientSetupPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-teal-900">MediKiosk</h1>
          <p className="text-gray-600 mt-1">Rural Healthcare Platform</p>
        </div>

        {/* Form */}
        <PatientSetupForm />
      </div>
    </main>
  );
}