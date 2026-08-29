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
  reportStartYear: number | null;
  reportEndYear: number | null;
  jsonStartYear: number | null;
  jsonEndYear: number | null;
  productionStartPeriod: number | null;
  reportProductionStartYear: number | null;
  jsonProductionStartYear: number | null;
  calendarShiftYears: number | null;
  reason: string;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function integer(value: unknown): value is number {
  return finite(value) && Number.isInteger(value);
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
    reportStartYear: null,
    reportEndYear: null,
    jsonStartYear: null,
    jsonEndYear: null,
    productionStartPeriod: null,
    reportProductionStartYear: null,
    jsonProductionStartYear: null,
    calendarShiftYears: null,
    reason,
    ...partial,
  };
}

type TimelineAssessment = {
  ok: boolean;
  reason: string;
  reportStartYear: number | null;
  reportEndYear: number | null;
  jsonStartYear: number | null;
  jsonEndYear: number | null;
  productionStartPeriod: number | null;
  reportProductionStartYear: number | null;
  jsonProductionStartYear: number | null;
  calendarShiftYears: number | null;
};

function assessTimeline(root: Record<string, unknown>, reconciliation: Record<string, unknown>, report: Record<string, unknown>): TimelineAssessment {
  const time = record(root.time);
  const reportTimeline = record(report.timeline);
  const jsonMasterN = integer(time.masterN) ? time.masterN : null;
  const jsonProductionStartPeriod = integer(time.productionStartPeriod) ? time.productionStartPeriod : null;
  const jsonProductionStartYear = integer(time.productionStartYear) ? time.productionStartYear : null;
  const declaredShift = integer(reconciliation.calendarShiftYears) ? reconciliation.calendarShiftYears : null;
  const rawReportYears = reportTimeline.periodYears;
  const reportProductionStartPeriod = integer(reportTimeline.productionStartPeriod) ? reportTimeline.productionStartPeriod : null;

  const empty = {
    reportStartYear: null,
    reportEndYear: null,
    jsonStartYear: null,
    jsonEndYear: null,
    productionStartPeriod: jsonProductionStartPeriod,
    reportProductionStartYear: null,
    jsonProductionStartYear,
    calendarShiftYears: declaredShift,
  };

  if (jsonMasterN === null || jsonMasterN < 0 || jsonProductionStartPeriod === null || jsonProductionStartYear === null) {
    return { ok: false, reason: 'project_json.time saknas eller är ogiltig för timeline-reconciliation.', ...empty };
  }
  if (jsonProductionStartPeriod < 0 || jsonProductionStartPeriod > jsonMasterN) {
    return { ok: false, reason: 'project_json.time.productionStartPeriod ligger utanför 0..masterN.', ...empty };
  }
  if (!Array.isArray(rawReportYears) || rawReportYears.length !== jsonMasterN + 1) {
    return {
      ok: false,
      reason: `Rapportens timeline måste ange periodYears med exakt masterN+1 (${jsonMasterN + 1}) perioder.`,
      ...empty,
    };
  }
  if (!rawReportYears.every(integer)) {
    return { ok: false, reason: 'Rapportens timeline.periodYears måste bestå av explicita heltalsår.', ...empty };
  }
  const reportYears = rawReportYears as number[];
  for (let t = 1; t < reportYears.length; t += 1) {
    if (reportYears[t] !== reportYears[t - 1] + 1) {
      return {
        ok: false,
        reason: `Rapportens periodYears är inte en sammanhängande årsaxel vid t=${t}; annual project_json kan inte reconcileras genom en enkel kalenderförskjutning.`,
        ...empty,
        reportStartYear: reportYears[0],
        reportEndYear: reportYears[reportYears.length - 1],
      };
    }
  }
  if (reportProductionStartPeriod === null || reportProductionStartPeriod < 0 || reportProductionStartPeriod > jsonMasterN) {
    return {
      ok: false,
      reason: 'Rapportens timeline.productionStartPeriod saknas eller är ogiltig.',
      ...empty,
      reportStartYear: reportYears[0],
      reportEndYear: reportYears[reportYears.length - 1],
    };
  }
  if (reportProductionStartPeriod !== jsonProductionStartPeriod) {
    return {
      ok: false,
      reason: `productionStartPeriod mismatch: rapport=${reportProductionStartPeriod}, project_json=${jsonProductionStartPeriod}. En kalenderförskjutning får inte ändra relativ projektfas.`,
      ...empty,
      reportStartYear: reportYears[0],
      reportEndYear: reportYears[reportYears.length - 1],
      reportProductionStartYear: reportYears[reportProductionStartPeriod],
    };
  }
  if (declaredShift === null) {
    return {
      ok: false,
      reason: 'reconciliation.calendarShiftYears måste anges explicit, även när förskjutningen är 0 år.',
      ...empty,
      reportStartYear: reportYears[0],
      reportEndYear: reportYears[reportYears.length - 1],
      reportProductionStartYear: reportYears[reportProductionStartPeriod],
    };
  }

  const jsonYears = Array.from(
    { length: jsonMasterN + 1 },
    (_, t) => jsonProductionStartYear + (t - jsonProductionStartPeriod),
  );
  const mismatchedPeriod = jsonYears.findIndex((year, t) => year - reportYears[t] !== declaredShift);
  const completed = {
    reportStartYear: reportYears[0],
    reportEndYear: reportYears[reportYears.length - 1],
    jsonStartYear: jsonYears[0],
    jsonEndYear: jsonYears[jsonYears.length - 1],
    productionStartPeriod: jsonProductionStartPeriod,
    reportProductionStartYear: reportYears[reportProductionStartPeriod],
    jsonProductionStartYear,
    calendarShiftYears: declaredShift,
  };
  if (mismatchedPeriod >= 0) {
    return {
      ok: false,
      reason: `Timeline är inte en uniform kalenderförskjutning vid t=${mismatchedPeriod}: rapport=${reportYears[mismatchedPeriod]}, project_json=${jsonYears[mismatchedPeriod]}, deklarerad shift=${declaredShift}.`,
      ...completed,
    };
  }

  return {
    ok: true,
    reason: declaredShift === 0
      ? 'Rapport- och project_json-timeline har identiska kalenderår och samma relativa projektfaser.'
      : `Rapportens timeline är bevarad exakt relativt och project_json är uniformt kalenderförskjuten ${declaredShift > 0 ? '+' : ''}${declaredShift} år.`,
    ...completed,
  };
}

/**
 * Hard evidence contract for saying a project_json has been reconciled to its
 * PEA/PFS/FS economics. The report timeline is stored explicitly and may be
 * shifted uniformly in the planning model, but masterN, period order and
 * productionStartPeriod must remain identical.
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
  const timeline = assessTimeline(root, reconciliation, report);

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
    reportStartYear: timeline.reportStartYear,
    reportEndYear: timeline.reportEndYear,
    jsonStartYear: timeline.jsonStartYear,
    jsonEndYear: timeline.jsonEndYear,
    productionStartPeriod: timeline.productionStartPeriod,
    reportProductionStartYear: timeline.reportProductionStartYear,
    jsonProductionStartYear: timeline.jsonProductionStartYear,
    calendarShiftYears: timeline.calendarShiftYears,
  };

  if (!sourceId || !pageOrTable) {
    return notVerified(projectId, 'Rapportkälla och exakt sida/tabell för ekonomin måste anges.', partial);
  }
  if (!timeline.ok) {
    return notVerified(projectId, timeline.reason, partial);
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
    reportStartYear: timeline.reportStartYear,
    reportEndYear: timeline.reportEndYear,
    jsonStartYear: timeline.jsonStartYear,
    jsonEndYear: timeline.jsonEndYear,
    productionStartPeriod: timeline.productionStartPeriod,
    reportProductionStartYear: timeline.reportProductionStartYear,
    jsonProductionStartYear: timeline.jsonProductionStartYear,
    calendarShiftYears: timeline.calendarShiftYears,
    reason: `${timeline.reason} Rapportavstämning verifierad inom ${(tolerance * 100).toFixed(2)} % relativ tolerans för både NPV och IRR.`,
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
