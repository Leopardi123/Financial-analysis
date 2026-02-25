export type Severity = 'error' | 'warn';

export type PeriodIssue = {
  severity: Severity;
  code: string;
  message: string;
  path: string;
  t?: number;
  metal?: string;
};

export type ValidationReport = {
  ok: boolean;
  errors: PeriodIssue[];
  warnings: PeriodIssue[];
  masterN: number;
  tp: number;
  metals: string[];
  missingMetalsInSpotPrice: string[];
  missingMetalsInPayableQty: string[];
  lengthMismatches: Array<{ path: string; expected: number; actual: number }>;
  perPeriod: Array<{
    t: number;
    issues: PeriodIssue[];
  }>;
};
