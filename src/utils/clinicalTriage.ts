// src/utils/clinicalTriage.ts
export interface RedFlagAlert {
  isCritical: boolean;
  alertType: 'CARDIAC_CRITICAL' | 'STROKE_FAST' | 'ACUTE_RESPIRATORY' | 'ANAPHYLAXIS' | 'NONE';
  message: string;
  recommendedAction: string;
}

export const evaluateRedFlags = (transcript: string, symptoms: string[]): RedFlagAlert => {
  const normalized = (transcript + ' ' + symptoms.join(' ')).toLowerCase();

  // Cardiac Emergency
  if (
    (normalized.includes('chest pain') || normalized.includes('छाती में दर्द') || normalized.includes('seene me dard')) &&
    (normalized.includes('left arm') || normalized.includes('sweating') || normalized.includes('breathless') || normalized.includes('jaw pain'))
  ) {
    return {
      isCritical: true,
      alertType: 'CARDIAC_CRITICAL',
      message: '🚨 CRITICAL: Potential Acute Coronary Syndrome (ACS) detected.',
      recommendedAction: 'Immediate triage bypass to Emergency/Crash Cart. Stat 12-lead ECG required.',
    };
  }

  // Stroke / FAST protocol
  if (
    normalized.includes('slurred speech') ||
    normalized.includes('face drooping') ||
    normalized.includes('arm weakness') ||
    normalized.includes('ek taraf kamzori')
  ) {
    return {
      isCritical: true,
      alertType: 'STROKE_FAST',
      message: '🚨 CRITICAL: Potential Acute Ischemic Stroke detected.',
      recommendedAction: 'Code Stroke Protocol. Transfer to CT/Emergency immediately.',
    };
  }

  // Severe Respiratory Distress
  if (normalized.includes('unable to speak full sentences') || normalized.includes('gasping for air') || normalized.includes('stridor')) {
    return {
      isCritical: true,
      alertType: 'ACUTE_RESPIRATORY',
      message: '🚨 CRITICAL: Acute Respiratory Compromise.',
      recommendedAction: 'Immediate SpO2 check and high-flow oxygen support triage.',
    };
  }

  return {
    isCritical: false,
    alertType: 'NONE',
    message: 'Standard OPD Priority.',
    recommendedAction: 'Proceed with routine queue routing.',
  };
};

export interface SocratesHPI {
  site: string;
  onset: string;
  character: string;
  radiation: string;
  associatedSymptoms: string[];
  timing: string;
  exacerbatingRelievingFactors: string;
  severityScale: number; // 1-10
}