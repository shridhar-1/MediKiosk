/**
 * src/utils/clinicalTriage.ts
 * ───────────────────────────────────────────────────────────────────────────
 * DEPRECATED as a separate implementation — now a thin compatibility wrapper
 * around the canonical engine in src/lib/redflags.ts so there is exactly ONE
 * definition of "what is an emergency" in the codebase.
 *
 * Keeps the original exported signature used by callers:
 *   evaluateRedFlags(transcript: string, symptoms: string[]): RedFlagAlert
 */
import { evaluateRedFlagsFromText } from "@/lib/redflags";

export interface RedFlagAlert {
  isCritical: boolean;
  alertType: 'CARDIAC_CRITICAL' | 'STROKE_FAST' | 'ACUTE_RESPIRATORY' | 'ANAPHYLAXIS' | 'NONE';
  message: string;
  recommendedAction: string;
}

const TYPE_BY_RULE: Record<string, RedFlagAlert['alertType']> = {
  'RF-ACS-01': 'CARDIAC_CRITICAL',
  'RF-STROKE-04': 'STROKE_FAST',
  'RF-RESP-03': 'ACUTE_RESPIRATORY',
};

export const evaluateRedFlags = (transcript: string, symptoms: string[] = []): RedFlagAlert => {
  const result = evaluateRedFlagsFromText([transcript, ...symptoms].join(' '));

  if (!result.triggered || result.priority !== 'emergency') {
    return {
      isCritical: false,
      alertType: 'NONE',
      message: 'Standard OPD Priority.',
      recommendedAction: 'Proceed with routine queue routing.',
    };
  }

  const top = result.fired[0];
  return {
    isCritical: true,
    alertType: TYPE_BY_RULE[top?.id ?? ''] ?? 'ANAPHYLAXIS',
    message: `🚨 CRITICAL: ${top?.name ?? 'Emergency red flag'} detected.`,
    recommendedAction: top?.action ?? 'Immediate triage bypass to Emergency.',
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