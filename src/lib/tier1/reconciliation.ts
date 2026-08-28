export const MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE = 0.02;

export type ProjectReconciliationAssessment = {
  projectId: string;
  status: 'VERIFIED' | 'NOT_VERIFIED';
  reportSourceId: string | null;
  reportPageOrTable: string | null;
  discountRate: number | null;
  npvCurrency: string | null;
  reportNpv: number | null;
  jsonNpv: number | null;
  npvRelativeDiff: number | null;
  reportIrr: number | null;
  jsonIrr: number | null;
  irrRelativeDiff: number | null;
  toleranceRelative: number;
  reason: string;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseRaw(rawJson: unknown): Record<string, unknown> {
  if (typeof rawJson === 'string') {
    try {
      return record(JSON.parse(rawJson));
    } catch {
      return {};
    }
  }
  return record(rawJson);
}

function relativeDiff(reportValue: number, jsonValue: number): number {
  const denominator = Math.max(Math.abs(reportValue), 1e-12);
  return Math.abs(jsonValue - reportValue) / denominator;
}

function notVerified(projectId: string, reason: string, partial: Partial<ProjectReconciliationAssessment> = {}): ProjectReconciliationAssessment {
  return {
    projectId,
    status: 'NOT_VERIFIED',
    reportSourceId: null,
    reportPageOrTable: null,
    discountRate: null,
    npvCurrency: null,
    reportNpv: null,
    jsonNpv: null,
    npvRelativeDiff: null,
    reportIrr: null,
    jsonIrr: null,
    irrRelativeDiff: null,
    toleranceRelative: MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE,
    reason,
    ...partial,
  };
}

/**
 * Hard evidence contract for saying a project_json has been reconciled to its
 * PEA/PFS/FS economics. The guard derives VERIFIED itself; a user-supplied
 * status flag is deliberately not trusted.
 *
 * Expected raw JSON shape:
 * reconciliation: {
 *   report: {
 *     sourceId, pageOrTable, discountRate, npv, npvCurrency,
 *     irrAfterTax, priceDeckByMetal: { Au: { value, unit }, ... }
 *   },
 *   jsonCheck: { npvAtReportDiscountRate, irrAfterTax },
 *   checks: {
 *     periodMappingVerified,
 *     capexPlacementVerified,
 *     closureWorkingCapitalVerified,
 *     reportPricesAndAssumptionsVerified,
 *     cashFlowDefinitionVerified
 *   },
 *   toleranceRelative?, verifiedAtUtc?
 * }
 */
export function assessProjectReconciliation(rawJson: unknown, projectId: string): ProjectReconciliationAssessment {
  const root = parseRaw(rawJson);
  const reconciliation = record(root.reconciliation);
  if (Object.keys(reconciliation).length === 0) {
    return notVerified(projectId, 'reconciliation saknas i project_json.');
  }

  const report = record(reconciliation.report);
  const jsonCheck = record(reconciliation.jsonCheck);
  const checks = record(reconciliation.checks);

  const sourceId = typeof report.sourceId === 'string' && report.sourceId.trim() ? report.sourceId.trim() : null;
  const pageOrTable = typeof report.pageOrTable === 'string' && report.pageOrTable.trim() ? report.pageOrTable.trim() : null;
  const discountRate = finite(report.discountRate) ? report.discountRate : null;
  const npvCurrency = typeof report.npvCurrency === 'string' && report.npvCurrency.trim() ? report.npvCurrency.trim().toUpperCase() : null;
  const reportNpv = finite(report.npv) ? report.npv : null;
  const jsonNpv = finite(jsonCheck.npvAtReportDiscountRate) ? jsonCheck.npvAtReportDiscountRate : null;
  const reportIrr = finite(report.irrAfterTax) ? report.irrAfterTax : null;
  const jsonIrr = finite(jsonCheck.irrAfterTax) ? jsonCheck.irrAfterTax : null;
  const requestedTolerance = finite(reconciliation.toleranceRelative) ? reconciliation.toleranceRelative : MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE;
  const tolerance = requestedTolerance > 0 && requestedTolerance <= MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE
    ? requestedTolerance
    : MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE;

  const partial = {
    reportSourceId: sourceId,
    reportPageOrTable: pageOrTable,
    discountRate,
    npvCurrency,
    reportNpv,
    jsonNpv,
    reportIrr,
    jsonIrr,
    toleranceRelative: tolerance,
  };

  if (!sourceId || !pageOrTable) {
    return notVerified(projectId, 'Rapportkälla och exakt sida/tabell för ekonomin måste anges.', partial);
  }
  if (discountRate === null || discountRate < 0 || discountRate >= 1) {
    return notVerified(projectId, 'Rapportens diskonteringsränta saknas eller är ogiltig.', partial);
  }
  if (!npvCurrency || reportNpv === null || jsonNpv === null || reportIrr === null || jsonIrr === null) {
    return notVerified(projectId, 'NPV/IRR för rapport och JSON-kontroll måste vara explicita och i samma angivna NPV-valuta.', partial);
  }
  if (finite(reconciliation.toleranceRelative)
    && (reconciliation.toleranceRelative <= 0 || reconciliation.toleranceRelative > MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE)) {
    return notVerified(projectId, `toleranceRelative måste vara >0 och ≤${MAX_PROJECT_RECONCILIATION_RELATIVE_TOLERANCE}.`, partial);
  }

  const priceDeck = record(report.priceDeckByMetal);
  if (Object.keys(priceDeck).length === 0) {
    return notVerified(projectId, 'Rapportens använda metallprisdeck saknas i reconciliation.report.priceDeckByMetal.', partial);
  }
  for (const [metal, rawPrice] of Object.entries(priceDeck)) {
    const price = record(rawPrice);
    if (!finite(price.value) || price.value <= 0 || typeof price.unit !== 'string' || !price.unit.trim()) {
      return notVerified(projectId, `Ogiltigt rapportpris för ${metal}; value och unit måste anges explicit.`, partial);
    }
  }

  const requiredChecks = [
    'periodMappingVerified',
    'capexPlacementVerified',
    'closureWorkingCapitalVerified',
    'reportPricesAndAssumptionsVerified',
    'cashFlowDefinitionVerified',
  ] as const;
  const failedChecks = requiredChecks.filter((key) => checks[key] !== true);
  if (failedChecks.length > 0) {
    return notVerified(projectId, `Reconciliation hard checks saknas/är false: ${failedChecks.join(', ')}.`, partial);
  }

  const npvDiff = relativeDiff(reportNpv, jsonNpv);
  const irrDiff = relativeDiff(reportIrr, jsonIrr);
  const completed = {
    ...partial,
    npvRelativeDiff: npvDiff,
    irrRelativeDiff: irrDiff,
  };
  if (npvDiff > tolerance || irrDiff > tolerance) {
    return notVerified(
      projectId,
      `Kontrollräkningen ligger utanför toleransen ${(tolerance * 100).toFixed(2)} %: NPV ${(npvDiff * 100).toFixed(2)} %, IRR ${(irrDiff * 100).toFixed(2)} %.`,
      completed,
    );
  }

  return {
    projectId,
    status: 'VERIFIED',
    reportSourceId: sourceId,
    reportPageOrTable: pageOrTable,
    discountRate,
    npvCurrency,
    reportNpv,
    jsonNpv,
    npvRelativeDiff: npvDiff,
    reportIrr,
    jsonIrr,
    irrRelativeDiff: irrDiff,
    toleranceRelative: tolerance,
    reason: `Rapportavstämning verifierad inom ${(tolerance * 100).toFixed(2)} % relativ tolerans för både NPV och IRR.`,
  };
}

export function assessCompanyProjectReconciliation(
  projects: Array<{ projectId: string; rawJson: unknown }>,
): { allVerified: boolean; projects: ProjectReconciliationAssessment[]; reason: string } {
  const results = projects.map((project) => assessProjectReconciliation(project.rawJson, project.projectId));
  const unresolved = results.filter((result) => result.status !== 'VERIFIED');
  return {
    allVerified: results.length > 0 && unresolved.length === 0,
    projects: results,
    reason: unresolved.length === 0
      ? 'Samtliga project_json-projekt har verifierad PEA/PFS/FS-avstämning.'
      : `Ej verifierad rapportavstämning för: ${unresolved.map((result) => result.projectId).join(', ')}.`,
  };
}
