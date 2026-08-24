// src/utils/fhirMapper.ts
export const generateAbdmFhirBundle = (sessionData: {
  abhaId: string;
  patientName: string;
  gender: 'male' | 'female' | 'other';
  age: number;
  chiefComplaints: string[];
  diagnoses: string[];
  medications: string[];
  allergies: string[];
  vitalSigns?: { bp?: string; pulse?: string; spo2?: string };
}) => {
  const patientId = `pat-${sessionData.abhaId.replace(/[^a-zA-Z0-9]/g, '') || 'demo'}`;
  const timestamp = new Date().toISOString();

  return {
    resourceType: 'Bundle',
    id: `medi-kiosk-bundle-${Date.now()}`,
    meta: {
      versionId: '1',
      lastUpdated: timestamp,
      profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle'],
    },
    identifier: {
      system: 'https://ndhm.in/phr',
      value: `REC-${Date.now()}`,
    },
    type: 'document',
    timestamp: timestamp,
    entry: [
      {
        fullUrl: `urn:uuid:${patientId}`,
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: [
            {
              system: 'https://healthid.ndhm.gov.in',
              value: sessionData.abhaId || '91-0000-0000-0000',
            },
          ],
          name: [{ text: sessionData.patientName || 'Anonymous Patient' }],
          gender: sessionData.gender,
        },
      },
      ...sessionData.chiefComplaints.map((cc, idx) => ({
        fullUrl: `urn:uuid:cond-${idx}`,
        resource: {
          resourceType: 'Condition',
          id: `cond-${idx}`,
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
          },
          category: [{ coding: [{ system: 'http://snomed.info/sct', code: '439401001', display: 'Chief complaint' }] }],
          code: { text: cc },
          subject: { reference: `urn:uuid:${patientId}` },
        },
      })),
      ...sessionData.allergies.map((allergy, idx) => ({
        fullUrl: `urn:uuid:allergy-${idx}`,
        resource: {
          resourceType: 'AllergyIntolerance',
          id: `allergy-${idx}`,
          clinicalStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
          },
          verificationStatus: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' }],
          },
          code: { text: allergy },
          patient: { reference: `urn:uuid:${patientId}` },
        },
      })),
      ...sessionData.medications.map((med, idx) => ({
        fullUrl: `urn:uuid:med-${idx}`,
        resource: {
          resourceType: 'MedicationStatement',
          id: `med-${idx}`,
          status: 'active',
          medicationCodeableConcept: { text: med },
          subject: { reference: `urn:uuid:${patientId}` },
          dateAsserted: timestamp,
        },
      })),
    ],
  };
};