export interface PatientSummaryData {
  patientName: string;
  abhaId: string;
  phoneNumber: string;
  chiefComplaint: string;
  hpi: string;
  ayushParams?: Record<string, string>;
  medications?: string[];
  hospitalName: string;
}

export function generateABDM_FHIR_Bundle(data: PatientSummaryData) {
  return {
    resourceType: "Bundle",
    type: "document",
    timestamp: new Date().toISOString(),
    entry: [
      {
        resource: {
          resourceType: "Composition",
          status: "final",
          type: {
            coding: [
              {
                system: "http://snomed.info/sct",
                code: "371531000",
                display: "Clinical consultation report",
              },
            ],
          },
          subject: {
            reference: `Patient/${data.abhaId}`,
            display: data.patientName,
          },
          title: "MediKiosk AI Clinical History Summary",
          section: [
            {
              title: "Chief Complaint & History of Present Illness",
              text: {
                status: "generated",
                div: `<div><h3>${data.chiefComplaint}</h3><p>${data.hpi}</p></div>`,
              },
            },
            {
              title: "Hospital & Facility",
              text: {
                status: "generated",
                div: `<div><p>Enrolled at: ${data.hospitalName}</p></div>`,
              },
            },
          ],
        },
      },
    ],
  };
}