// src/utils/documentProcessor.ts
export interface ExtractedInvestigation {
  testName: string;
  observedValue: number;
  unit: string;
  referenceRange: [number, number];
  status: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
  documentDate: string;
}

export interface ExtractedMedication {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface StructuredDocTimeline {
  id: string;
  date: string;
  docType: 'Prescription' | 'Lab Report' | 'Discharge Summary';
  prescriberHospital: string;
  diagnoses: string[];
  medications: ExtractedMedication[];
  investigations: ExtractedInvestigation[];
}

export const processRawLabText = (rawOcrText: string, docDate: string): ExtractedInvestigation[] => {
  // Deterministic medical extraction pipeline logic
  const labRefDb: Record<string, { min: number; max: number; unit: string }> = {
    'HbA1c': { min: 4.0, max: 5.7, unit: '%' },
    'Fasting Blood Sugar': { min: 70, max: 100, unit: 'mg/dL' },
    'Serum Creatinine': { min: 0.6, max: 1.2, unit: 'mg/dL' },
    'Hemoglobin': { min: 12.0, max: 16.0, unit: 'g/dL' },
    'Platelet Count': { min: 150000, max: 450000, unit: '/mcL' },
    'Total Bilirubin': { min: 0.2, max: 1.2, unit: 'mg/dL' },
    'Blood Urea': { min: 15, max: 40, unit: 'mg/dL' }
  };

  const results: ExtractedInvestigation[] = [];

  Object.entries(labRefDb).forEach(([test, ref]) => {
    if (rawOcrText.toLowerCase().includes(test.toLowerCase())) {
      // Mock extracted value based on clinical scenarios for demo
      const observed = test === 'HbA1c' ? 8.4 : test === 'Serum Creatinine' ? 1.8 : 95;
      let status: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL' = 'NORMAL';

      if (observed > ref.max) status = observed > ref.max * 1.4 ? 'CRITICAL' : 'HIGH';
      if (observed < ref.min) status = observed < ref.min * 0.7 ? 'CRITICAL' : 'LOW';

      results.push({
        testName: test,
        observedValue: observed,
        unit: ref.unit,
        referenceRange: [ref.min, ref.max],
        status,
        documentDate: docDate
      });
    }
  });

  return results;
};