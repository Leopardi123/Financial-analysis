export const CORPORATE_OPERATIONAL_FUNDING_KEY = '__CORPORATE__';

export type CashWaterfallProject = {
  projectId: string;
  constructionStartPeriod: number;
  capexNeedByPeriod: Array<number | null>;
  fcffIncludesConstructionCapex: boolean;
  fcffByPeriod: Array<number | null>;
  debtPercent?: number;
  equityRaisePriceTargetCurrency?: number | null;
};

export type CashWaterfallRowStatus = 'COMPUTABLE' | 'NOT_COMPUTABLE';

export type CashWaterfallRow = {
  period: number;
  year: number | null;
  openingCash: number;
  operatingCashGenerated: number | null;
  projectCapexNeed: number | null;
  constructionCapex: number | null;
  preFinancingCash: number | null;
  minimumCashReserve: number;
  constructionFundingNeed: number | null;
  operationalFundingNeed: number | null;
  totalExternalFundingNeed: number | null;
  internalCashUsed: number | null;
  initialCashUsed: number | null;
  internallyGeneratedCashUsed: number | null;
  /** Legacy alias for totalExternalFundingNeed. */
  remainingExternalFundingNeed: number | null;
  debtAdded: number | null;
  equityRaised: number | null;
  constructionDebtAdded: number | null;
  constructionEquityRaised: number | null;
  operationalDebtAdded: number | null;
  operationalEquityRaised: number | null;
  unfundedGap: number | null;
  closingCash: number | null;
  newShares: number | null;
  operationalNewShares: number | null;
  cumulativeNewShares: number | null;
  cumulativeCanonicalShares: number | null;
  status: CashWaterfallRowStatus;
  diagnostics: string[];
  internalCashUsedByProject: Record<string, number>;
  debtAddedByProject: Record<string, number>;
  equityRaisedByProject: Record<string, number>;
  newSharesByProject: Record<string, number | null>;
  operatingCashGeneratedByProject: Record<string, number>;
  constructionCapexByProject: Record<string, number>;
};

export type CashWaterfallResult = {
  rows: CashWaterfallRow[];
  initialCashAvailable: number;
  totalInitialCashUsed: number | null;
  totalInternallyGeneratedCashUsed: number | null;
  totalInternalCashUsed: number | null;
  remainingExternalFundingNeed: number | null;
  constructionFundingNeed: number | null;
  operationalFundingNeed: number | null;
  totalExternalFundingNeed: number | null;
  debtAdded: number | null;
  equityRaised: number | null;
  unfundedGap: number | null;
  closingCorporateCash: number | null;
  totalNewShares: number | null;
  newSharesByPeriod: Array<number | null>;
  cumulativeNewSharesByPeriod: Array<number | null>;
  cumulativeCanonicalSharesByPeriod: Array<number | null>;
  debtAddedByProject: Record<string, number>;
  equityRaisedByProject: Record<string, number>;
  newSharesByProject: Record<string, number | null>;
  status: CashWaterfallRowStatus;
  diagnostics: string[];
};

export type CashWaterfallInput = {
  yearsByPeriod?: number[];
  latestQuarterlyCash: number;
  useLatestQuarterlyCash: boolean;
  cashUsedPercent: number;
  minimumCashReserve: number | number[];
  debtPercent: number;
  projects: CashWaterfallProject[];
  fxUSDToTargetCurrency?: number | null;
  equityRaisePriceTargetCurrency?: number | null;
  sharesCurrent?: number | null;
  fdExtraShares?: number;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonNegative = (value: number) => Math.max(0, value);
const clampedFraction = (value: number) => Math.min(1, nonNegative(value));
const sumRecord = (values: Record<string, number>) => Object.values(values).reduce((sum, value) => sum + value, 0);

function nullableSum(rows: CashWaterfallRow[], key: keyof CashWaterfallRow): number | null {
  let total = 0;
  for (const row of rows) {
    const value = row[key];
    if (!isFiniteNumber(value)) return null;
    total += value;
  }
  return total;
}

/**
 * Chronological Corporate cash waterfall.
 *
 * Project FCFF that contains construction CAPEX is grossed up once before the
 * same CAPEX is deducted once below. External financing restores closing cash
 * to the applicable minimum reserve after both operations and construction.
 */
export function computeCorporateCashWaterfall(input: CashWaterfallInput): CashWaterfallResult {
  const cashPercent = clampedFraction(input.cashUsedPercent);
  const debtPercent = clampedFraction(input.debtPercent);
  const initialReserve = nonNegative(Array.isArray(input.minimumCashReserve) ? input.minimumCashReserve[0] ?? 0 : input.minimumCashReserve);
  const usableInitialCash = input.useLatestQuarterlyCash
    ? Math.max(0, nonNegative(input.latestQuarterlyCash) - initialReserve) * cashPercent
    : 0;
  // Preserve the historical cash-first contract: disabling cash-first excludes
  // reported cash from this modeled funding pool; enabling it introduces it once.
  const initialCashAvailable = input.useLatestQuarterlyCash ? initialReserve + usableInitialCash : 0;
  const periods = Math.max(input.yearsByPeriod?.length ?? 0, ...input.projects.map((project) => Math.max(project.capexNeedByPeriod.length, project.fcffByPeriod.length)), 0);
  const projects = [...input.projects].sort((left, right) => left.constructionStartPeriod - right.constructionStartPeriod || left.projectId.localeCompare(right.projectId));
  const rows: CashWaterfallRow[] = [];
  const diagnostics: string[] = [];
  let openingCash = initialCashAvailable;
  let initialCashBalance = usableInitialCash;
  let cumulativeNewShares = 0;
  let cumulativeSharesComputable = true;

  for (let period = 0; period < periods; period += 1) {
    const rowDiagnostics: string[] = [];
    const reserve = nonNegative(Array.isArray(input.minimumCashReserve) ? input.minimumCashReserve[period] ?? 0 : input.minimumCashReserve);
    const projectValues = projects.map((project) => ({
      project,
      capex: project.capexNeedByPeriod[period] ?? null,
      fcff: project.fcffByPeriod[period] ?? null,
    }));
    const invalidProjects = projectValues.filter(({ capex, fcff }) => !isFiniteNumber(capex) || capex < 0 || !isFiniteNumber(fcff));

    if (invalidProjects.length > 0 || !isFiniteNumber(openingCash)) {
      for (const { project, capex, fcff } of invalidProjects) {
        if (!isFiniteNumber(capex) || capex < 0) rowDiagnostics.push(`[${project.projectId}] invalid construction CAPEX in period ${period}.`);
        if (!isFiniteNumber(fcff)) rowDiagnostics.push(`[${project.projectId}] invalid FCFF in period ${period}.`);
      }
      if (!isFiniteNumber(openingCash)) rowDiagnostics.push(`Invalid opening cash in period ${period}.`);
      diagnostics.push(...rowDiagnostics);
      rows.push({
        period, year: input.yearsByPeriod?.[period] ?? null, openingCash,
        operatingCashGenerated: null, projectCapexNeed: null, constructionCapex: null,
        preFinancingCash: null, minimumCashReserve: reserve, constructionFundingNeed: null,
        operationalFundingNeed: null, totalExternalFundingNeed: null, internalCashUsed: null,
        initialCashUsed: null, internallyGeneratedCashUsed: null, remainingExternalFundingNeed: null,
        debtAdded: null, equityRaised: null, constructionDebtAdded: null, constructionEquityRaised: null,
        operationalDebtAdded: null, operationalEquityRaised: null, unfundedGap: null, closingCash: null,
        newShares: null, operationalNewShares: null, cumulativeNewShares: null, cumulativeCanonicalShares: null,
        status: 'NOT_COMPUTABLE', diagnostics: rowDiagnostics, internalCashUsedByProject: {},
        debtAddedByProject: {}, equityRaisedByProject: {}, newSharesByProject: {},
        operatingCashGeneratedByProject: {}, constructionCapexByProject: {},
      });
      openingCash = Number.NaN;
      continue;
    }

    const needs = projectValues.map(({ project, capex }) => ({ project, need: capex as number }));
    const projectCapexNeed = needs.reduce((sum, item) => sum + item.need, 0);
    const operatingByProject = Object.fromEntries(projectValues.map(({ project, fcff, capex }) => [
      project.projectId,
      (fcff as number) + (project.fcffIncludesConstructionCapex ? capex as number : 0),
    ]));
    const operatingCashGenerated = sumRecord(operatingByProject);

    // Internal cash is allocated chronologically to construction while preserving reserve.
    let availableForConstruction = Math.max(0, openingCash + operatingCashGenerated - reserve);
    const internalCashUsedByProject: Record<string, number> = {};
    for (const { project, need } of needs) {
      const used = Math.min(availableForConstruction, need);
      internalCashUsedByProject[project.projectId] = used;
      availableForConstruction -= used;
    }
    const internalCashUsed = sumRecord(internalCashUsedByProject);
    const initialCashUsed = Math.min(initialCashBalance, internalCashUsed);
    initialCashBalance -= initialCashUsed;
    const internallyGeneratedCashUsed = internalCashUsed - initialCashUsed;
    const constructionFundingNeed = Math.max(0, projectCapexNeed - internalCashUsed);

    const preFinancingCash = openingCash + operatingCashGenerated - projectCapexNeed;
    const totalExternalFundingNeed = Math.max(0, reserve - preFinancingCash);
    const operationalFundingNeed = Math.max(0, totalExternalFundingNeed - constructionFundingNeed);

    const constructionExternalByProject = Object.fromEntries(needs.map(({ project, need }) => [
      project.projectId,
      Math.max(0, need - (internalCashUsedByProject[project.projectId] ?? 0)),
    ]));
    const negativeOperatingEntries = Object.entries(operatingByProject).filter(([, value]) => value < 0);
    const negativeOperatingTotal = negativeOperatingEntries.reduce((sum, [, value]) => sum + Math.abs(value), 0);
    const operationalExternalByProject: Record<string, number> = {};
    if (operationalFundingNeed > 0 && negativeOperatingTotal > 0) {
      for (const [projectId, value] of negativeOperatingEntries) {
        operationalExternalByProject[projectId] = operationalFundingNeed * Math.abs(value) / negativeOperatingTotal;
      }
    } else if (operationalFundingNeed > 0) {
      // A deficit caused by negative opening cash or a reserve step-up has no
      // project operating-loss provenance and is therefore Corporate-attributed.
      operationalExternalByProject[CORPORATE_OPERATIONAL_FUNDING_KEY] = operationalFundingNeed;
    }

    const fundingByAttribution: Record<string, number> = { ...constructionExternalByProject };
    for (const [key, amount] of Object.entries(operationalExternalByProject)) {
      fundingByAttribution[key] = (fundingByAttribution[key] ?? 0) + amount;
    }
    const projectById = new Map(projects.map((project) => [project.projectId, project]));
    const debtAddedByProject: Record<string, number> = {};
    const equityRaisedByProject: Record<string, number> = {};
    const debtFractionByAttribution: Record<string, number> = {};
    let constructionDebtAdded = 0; let constructionEquityRaised = 0;
    let operationalDebtAdded = 0; let operationalEquityRaised = 0;
    for (const [key, external] of Object.entries(fundingByAttribution)) {
      const projectDebt = key === CORPORATE_OPERATIONAL_FUNDING_KEY
        ? debtPercent
        : clampedFraction(projectById.get(key)?.debtPercent ?? debtPercent);
      debtFractionByAttribution[key] = projectDebt;
      debtAddedByProject[key] = external * projectDebt;
      equityRaisedByProject[key] = external * (1 - projectDebt);
      const constructionExternal = constructionExternalByProject[key] ?? 0;
      const operationalExternal = operationalExternalByProject[key] ?? 0;
      constructionDebtAdded += constructionExternal * projectDebt;
      constructionEquityRaised += constructionExternal * (1 - projectDebt);
      operationalDebtAdded += operationalExternal * projectDebt;
      operationalEquityRaised += operationalExternal * (1 - projectDebt);
    }
    const debtAdded = sumRecord(debtAddedByProject);
    const equityRaised = sumRecord(equityRaisedByProject);
    const unfundedGap = Math.max(0, totalExternalFundingNeed - debtAdded - equityRaised);
    const closingCash = preFinancingCash + debtAdded + equityRaised;

    const newSharesByProject: Record<string, number | null> = {};
    let newShares: number | null = 0;
    let operationalNewShares: number | null = 0;
    for (const [key, equityUSD] of Object.entries(equityRaisedByProject)) {
      if (equityUSD === 0) {
        newSharesByProject[key] = 0;
        continue;
      }
      const issuePrice = key === CORPORATE_OPERATIONAL_FUNDING_KEY
        ? input.equityRaisePriceTargetCurrency
        : projectById.get(key)?.equityRaisePriceTargetCurrency ?? input.equityRaisePriceTargetCurrency;
      if (!isFiniteNumber(input.fxUSDToTargetCurrency) || input.fxUSDToTargetCurrency <= 0 || !isFiniteNumber(issuePrice) || issuePrice <= 0) {
        newSharesByProject[key] = null;
        newShares = null;
        if ((operationalExternalByProject[key] ?? 0) > 0) operationalNewShares = null;
        rowDiagnostics.push(`New shares not computable for ${key}: positive equity requires finite FX and issue price > 0.`);
      } else if (newShares !== null) {
        const projectNewShares = equityUSD * input.fxUSDToTargetCurrency / issuePrice;
        newSharesByProject[key] = projectNewShares;
        newShares += projectNewShares;
        if (operationalNewShares !== null) {
          const operationalEquityUSD = (operationalExternalByProject[key] ?? 0) * (1 - (debtFractionByAttribution[key] ?? debtPercent));
          operationalNewShares += operationalEquityUSD * input.fxUSDToTargetCurrency / issuePrice;
        }
      }
    }
    if (newShares === null) cumulativeSharesComputable = false;
    else cumulativeNewShares += newShares;
    const cumulativeNewSharesValue = cumulativeSharesComputable ? cumulativeNewShares : null;
    const cumulativeCanonicalShares = cumulativeNewSharesValue !== null && isFiniteNumber(input.sharesCurrent)
      ? input.sharesCurrent + cumulativeNewSharesValue + nonNegative(input.fdExtraShares ?? 0)
      : null;
    const tolerance = 1e-8 * Math.max(1, totalExternalFundingNeed, reserve);
    if (Math.abs(debtAdded + equityRaised + unfundedGap - totalExternalFundingNeed) > tolerance) {
      throw new Error(`Corporate financing identity failed in period ${period}`);
    }
    if (unfundedGap <= tolerance && closingCash + tolerance < reserve) {
      throw new Error(`Corporate minimum cash reserve identity failed in period ${period}`);
    }
    const status: CashWaterfallRowStatus = rowDiagnostics.length > 0 ? 'NOT_COMPUTABLE' : 'COMPUTABLE';
    diagnostics.push(...rowDiagnostics);
    rows.push({
      period, year: input.yearsByPeriod?.[period] ?? null, openingCash, operatingCashGenerated,
      projectCapexNeed, constructionCapex: projectCapexNeed, preFinancingCash,
      minimumCashReserve: reserve, constructionFundingNeed, operationalFundingNeed,
      totalExternalFundingNeed, internalCashUsed, initialCashUsed, internallyGeneratedCashUsed,
      remainingExternalFundingNeed: totalExternalFundingNeed, debtAdded, equityRaised,
      constructionDebtAdded, constructionEquityRaised, operationalDebtAdded, operationalEquityRaised,
      unfundedGap, closingCash, newShares, cumulativeNewShares: cumulativeNewSharesValue,
      operationalNewShares,
      cumulativeCanonicalShares, status, diagnostics: rowDiagnostics, internalCashUsedByProject,
      debtAddedByProject, equityRaisedByProject, newSharesByProject,
      operatingCashGeneratedByProject: operatingByProject,
      constructionCapexByProject: Object.fromEntries(needs.map(({ project, need }) => [project.projectId, need])),
    });
    openingCash = closingCash;
  }

  const byAttribution = (key: 'debtAddedByProject' | 'equityRaisedByProject') => {
    const keys = new Set(rows.flatMap((row) => Object.keys(row[key])));
    return Object.fromEntries([...keys].map((attribution) => [attribution, rows.reduce((sum, row) => sum + (row[key][attribution] ?? 0), 0)]));
  };
  const newSharesByProject: Record<string, number | null> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.newSharesByProject)) {
      newSharesByProject[key] = value === null || newSharesByProject[key] === null ? null : (newSharesByProject[key] ?? 0) + value;
    }
  }
  const status: CashWaterfallRowStatus = rows.some((row) => row.status === 'NOT_COMPUTABLE') ? 'NOT_COMPUTABLE' : 'COMPUTABLE';
  return {
    rows, initialCashAvailable,
    totalInitialCashUsed: nullableSum(rows, 'initialCashUsed'),
    totalInternallyGeneratedCashUsed: nullableSum(rows, 'internallyGeneratedCashUsed'),
    totalInternalCashUsed: nullableSum(rows, 'internalCashUsed'),
    remainingExternalFundingNeed: nullableSum(rows, 'totalExternalFundingNeed'),
    constructionFundingNeed: nullableSum(rows, 'constructionFundingNeed'),
    operationalFundingNeed: nullableSum(rows, 'operationalFundingNeed'),
    totalExternalFundingNeed: nullableSum(rows, 'totalExternalFundingNeed'),
    debtAdded: nullableSum(rows, 'debtAdded'), equityRaised: nullableSum(rows, 'equityRaised'),
    unfundedGap: nullableSum(rows, 'unfundedGap'),
    closingCorporateCash: rows.length ? rows[rows.length - 1].closingCash : initialCashAvailable,
    totalNewShares: nullableSum(rows, 'newShares'),
    newSharesByPeriod: rows.map((row) => row.newShares),
    cumulativeNewSharesByPeriod: rows.map((row) => row.cumulativeNewShares),
    cumulativeCanonicalSharesByPeriod: rows.map((row) => row.cumulativeCanonicalShares),
    debtAddedByProject: byAttribution('debtAddedByProject'),
    equityRaisedByProject: byAttribution('equityRaisedByProject'), newSharesByProject,
    status, diagnostics,
  };
}
