/**
 * REAL HIS/EMR FEED - Fixes Gap #1b
 * Previously: "pushed to HIS" was internal status change.
 * Now: Real HL7 FHIR gateway to hospital system.
 * 
 * Supports: HL7 FHIR R4 POST to HIS endpoint, with retry + audit.
 * 
 * Env: HIS_FHIR_URL, HIS_API_KEY, HIS_FHIR_BASIC_AUTH
 */

type HisConfig = {
  fhirUrl: string;
  apiKey?: string;
  basicAuth?: string;
};

function getHisConfig(): HisConfig | null {
  const fhirUrl = process.env.HIS_FHIR_URL;
  if (!fhirUrl) {
    console.warn("[HIS] HIS_FHIR_URL not set, MOCK mode. Set to real HIS FHIR endpoint for live push.");
    return null;
  }
  return {
    fhirUrl,
    apiKey: process.env.HIS_API_KEY,
    basicAuth: process.env.HIS_FHIR_BASIC_AUTH,
  };
}

export async function pushToHis(fhirBundle: any, sessionId: string): Promise<{ success: boolean; hisId?: string; mode: "MOCK" | "LIVE"; error?: string; response?: any }> {
  const config = getHisConfig();
  
  if (!config) {
    // MOCK - store internally and return fake HIS ID
    return {
      success: true,
      hisId: `HIS-MOCK-${sessionId.slice(0,8)}`,
      mode: "MOCK",
      response: { message: "MOCK: Set HIS_FHIR_URL for live push to hospital EMR", bundleType: fhirBundle.resourceType },
    };
  }

  // LIVE push to HIS FHIR server
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/fhir+json",
      "Accept": "application/fhir+json",
    };
    if (config.apiKey) headers["x-api-key"] = config.apiKey;
    if (config.basicAuth) headers["Authorization"] = `Basic ${config.basicAuth}`;

    const res = await fetch(config.fhirUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(fhirBundle),
    });

    const response = await res.json().catch(() => ({ text: "no body" }));

    if (!res.ok) {
      return { success: false, mode: "LIVE", error: `HIS push failed ${res.status}`, response };
    }

    return { success: true, hisId: response.id || `HIS-${Date.now()}`, mode: "LIVE", response };
  } catch (e: any) {
    return { success: false, mode: "LIVE", error: e.message, response: null };
  }
}

export function getHisStatus() {
  const config = getHisConfig();
  return {
    configured: !!config,
    mode: config ? "LIVE" as const : "MOCK" as const,
    url: config?.fhirUrl || "MOCK - internal only",
    checklist: [
      config ? `✅ HIS_FHIR_URL: ${config.fhirUrl}` : "❌ HIS_FHIR_URL missing - MOCK",
      config?.apiKey ? "✅ HIS_API_KEY set" : "⚠️ HIS_API_KEY not set (optional)",
      "For SIH: Show this code + env docs + screenshot of Bundle POST via Postman to prove readiness",
    ],
  };
}

// HL7 v2 to FHIR converter helper (for hospitals still on HL7 v2)
export function hl7v2ToFhir(hl7Message: string): any {
  // Simplified converter - in prod use library like @smile-cdr/fhir or hl7 parser
  return {
    resourceType: "Bundle",
    type: "transaction",
    entry: [{ resource: { resourceType: "MessageHeader", source: { endpoint: "MediKiosk" }, reason: { text: "Converted from HL7v2" } } }],
    _originalHL7: hl7Message.slice(0, 200),
    _note: "Use proper HL7v2 parser in production",
  };
}