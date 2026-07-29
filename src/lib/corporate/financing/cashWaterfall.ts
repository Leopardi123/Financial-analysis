export type CashWaterfallProject = { projectId: string; constructionStartPeriod: number; capexNeedByPeriod: number[]; fcffIncludesConstructionCapex: boolean; fcffByPeriod: number[]; debtPercent?: number };
export type CashWaterfallRow = { period: number; year: number | null; openingCash: number; operatingCashGenerated: number; projectCapexNeed: number; internalCashUsed: number; initialCashUsed: number; internallyGeneratedCashUsed: number; remainingExternalFundingNeed: number; debtAdded: number; equityRaised: number; closingCash: number; internalCashUsedByProject: Record<string, number>; debtAddedByProject: Record<string, number>; equityRaisedByProject: Record<string, number> };
export type CashWaterfallResult = { rows: CashWaterfallRow[]; initialCashAvailable: number; totalInitialCashUsed: number; totalInternallyGeneratedCashUsed: number; totalInternalCashUsed: number; remainingExternalFundingNeed: number; debtAdded: number; equityRaised: number; closingCorporateCash: number; debtAddedByProject: Record<string, number>; equityRaisedByProject: Record<string, number> };
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

/** Period waterfall. Same-period projects use construction start, then stable id priority.
 * FCFF containing construction capex is grossed up before capex is paid exactly once here. */
export function computeCorporateCashWaterfall(input: { yearsByPeriod?: number[]; latestQuarterlyCash: number; useLatestQuarterlyCash: boolean; cashUsedPercent: number; minimumCashReserve: number | number[]; debtPercent: number; projects: CashWaterfallProject[] }): CashWaterfallResult {
  const cashPercent = Math.min(1, nonNegative(input.cashUsedPercent));
  const debtPercent = Math.min(1, nonNegative(input.debtPercent));
  const initialReserve = nonNegative(Array.isArray(input.minimumCashReserve) ? input.minimumCashReserve[0] ?? 0 : input.minimumCashReserve);
  const usableInitialCash = input.useLatestQuarterlyCash
    ? Math.max(0, nonNegative(input.latestQuarterlyCash) - initialReserve) * cashPercent
    : 0;
  // Keep the reserve in the roll-forward, but outside the pool that can fund CAPEX.
  const initialCashAvailable = input.useLatestQuarterlyCash ? initialReserve + usableInitialCash : 0;
  const periods = Math.max(input.yearsByPeriod?.length ?? 0, ...input.projects.map((p) => Math.max(p.capexNeedByPeriod.length, p.fcffByPeriod.length)), 0);
  const projects = [...input.projects].sort((a, b) => a.constructionStartPeriod - b.constructionStartPeriod || a.projectId.localeCompare(b.projectId));
  const rows: CashWaterfallRow[] = [];
  let openingCash = initialCashAvailable, initialCashBalance = usableInitialCash;
  for (let period = 0; period < periods; period += 1) {
    const needs = projects.map((project) => ({ project, need: nonNegative(project.capexNeedByPeriod[period] ?? 0) }));
    const projectCapexNeed = needs.reduce((sum, item) => sum + item.need, 0);
    const operatingCashGenerated = projects.reduce((sum, project) => sum + (Number.isFinite(project.fcffByPeriod[period]) ? project.fcffByPeriod[period] : 0) + (project.fcffIncludesConstructionCapex ? nonNegative(project.capexNeedByPeriod[period] ?? 0) : 0), 0);
    const reserve = nonNegative(Array.isArray(input.minimumCashReserve) ? input.minimumCashReserve[period] ?? 0 : input.minimumCashReserve);
    let available = Math.max(0, openingCash + operatingCashGenerated - reserve);
    const internalCashUsedByProject: Record<string, number> = {};
    for (const { project, need } of needs) { const used = Math.min(available, need); internalCashUsedByProject[project.projectId] = used; available -= used; }
    const internalCashUsed = Object.values(internalCashUsedByProject).reduce((a, b) => a + b, 0);
    const initialCashUsed = Math.min(initialCashBalance, internalCashUsed); initialCashBalance -= initialCashUsed;
    const internallyGeneratedCashUsed = internalCashUsed - initialCashUsed;
    const debtAddedByProject: Record<string, number> = {}, equityRaisedByProject: Record<string, number> = {};
    for (const { project, need } of needs) { const external = need - internalCashUsedByProject[project.projectId]; const projectDebt = Math.min(1, nonNegative(project.debtPercent ?? debtPercent)); debtAddedByProject[project.projectId] = external * projectDebt; equityRaisedByProject[project.projectId] = external * (1 - projectDebt); }
    const remainingExternalFundingNeed = Math.max(0, projectCapexNeed - internalCashUsed);
    const debtAdded = Object.values(debtAddedByProject).reduce((a,b)=>a+b,0), equityRaised = Object.values(equityRaisedByProject).reduce((a,b)=>a+b,0);
    const closingCash = openingCash + operatingCashGenerated + debtAdded + equityRaised - projectCapexNeed;
    const tolerance = 1e-8 * Math.max(1, remainingExternalFundingNeed);
    if (Math.abs(debtAdded + equityRaised - remainingExternalFundingNeed) > tolerance) {
      throw new Error(`Corporate financing identity failed in period ${period}`);
    }
    rows.push({ period, year: input.yearsByPeriod?.[period] ?? null, openingCash, operatingCashGenerated, projectCapexNeed, internalCashUsed, initialCashUsed, internallyGeneratedCashUsed, remainingExternalFundingNeed, debtAdded, equityRaised, closingCash, internalCashUsedByProject, debtAddedByProject, equityRaisedByProject }); openingCash = closingCash;
  }
  const sum = (key: 'initialCashUsed'|'internallyGeneratedCashUsed'|'internalCashUsed'|'remainingExternalFundingNeed'|'debtAdded'|'equityRaised') => rows.reduce((total, row) => total + row[key], 0);
  const byProject = (key: 'debtAddedByProject'|'equityRaisedByProject') => Object.fromEntries(projects.map(p => [p.projectId, rows.reduce((n,r)=>n+(r[key][p.projectId]??0),0)]));
  return { rows, initialCashAvailable, totalInitialCashUsed: sum('initialCashUsed'), totalInternallyGeneratedCashUsed: sum('internallyGeneratedCashUsed'), totalInternalCashUsed: sum('internalCashUsed'), remainingExternalFundingNeed: sum('remainingExternalFundingNeed'), debtAdded: sum('debtAdded'), equityRaised: sum('equityRaised'), closingCorporateCash: rows.length ? rows[rows.length - 1].closingCash : initialCashAvailable, debtAddedByProject: byProject('debtAddedByProject'), equityRaisedByProject: byProject('equityRaisedByProject') };
}
