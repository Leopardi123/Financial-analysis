import { useEffect, useMemo, useState } from 'react';
import { postCorporateSnapshot } from '../lib/client/snapshotClient.ts';
import { getCompanyProject, listCompanyProjects, type CompanyProjectRecord, type CompanyProjectSummary } from '../lib/client/companyProjectsClient.ts';
import type { SnapshotRequest } from '../lib/api/validateSnapshotRequest.ts';
import { buildTransposedTable } from '../lib/ui/tables/buildTransposedTable.ts';
import { resolveCommonSharesCurrent } from '../lib/market/resolveSharesCurrent.ts';
import { parseProjectJsonV1WithContext } from '../lib/project/jsonv1/parse.ts';
import { buildOperationsGridModel } from './projectOperationsGrid.ts';
import { resolveV2TimeAxis } from '../lib/time/resolveV2TimeAxis.ts';
import { buildProjectGridPnl } from './projectGridPnl.ts';
import '../styles/projects-view.css';

const DEFAULT_SYMBOL = 'AAPL';

type SeriesShape = {
  periodIndex?: number[];
  oreMinedTonnes?: Array<number | null>;
  oreMilledTonnes?: Array<number | null>;
  nameplateThroughput?: number | null;
  throughputUnit?: string | null;
  utilizationPct?: number | null;
  payableQtyByMetal?: Record<string, Array<number | null>>;
  payableQtyUnitByMetal?: Record<string, string>;
  revenueByMetal_USD?: Record<string, Array<number | null>>;
  totalRevenue_USD?: Array<number | null>;
  operatingCostsUSD?: Array<number | null>;
  sustainingCapexUSD?: Array<number | null>;
  siteGandA_USD?: Array<number | null>;
  royaltiesUSD?: Array<number | null>;
  royaltiesDetail?: Array<{
    id: string;
    label: string;
    royaltyUSD?: Array<number | null>;
  }>;
  reclamationUSD?: Array<number | null>;
  byproductCreditsUSD?: Array<number | null>;
  sustainingCostUSD?: Array<number | null>;
  ebitdaUSD?: Array<number | null>;
  depreciationUSD?: Array<number | null>;
  ebitUSD?: Array<number | null>;
  taxableIncomeUSD?: Array<number | null>;
  effectiveTaxRate?: Array<number | null>;
  taxUSD?: Array<number | null>;
  workingCapitalDeltaUSD?: Array<number | null>;
  fcffUSD?: Array<number | null>;
  capexUSD?: Array<number | null>;
  totalCapexUSD?: Array<number | null>;
  unitAudit?: {
    metals: Record<string, {
      qtyUnit: string;
      canonicalQtyUnit: string;
      priceUnit: string;
      canonicalPriceUnit: string;
      warnings: string[];
    }>;
  };
};

function getRouteProjectId(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getSymbolFromQuery(search: string): string {
  const params = new URLSearchParams(search);
  const symbol = params.get('symbol')?.trim().toUpperCase();
  return symbol || DEFAULT_SYMBOL;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}




function numbersMatch(left: number | null | undefined, right: number | null | undefined, epsilon = 1e-6): boolean {
  if (left === null || left === undefined || !Number.isFinite(left)) return right === null || right === undefined || !Number.isFinite(right as number);
  if (right === null || right === undefined || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= epsilon;
}

function firstNonZeroIndex(values: Array<number | null> | undefined): number | null {
  if (!Array.isArray(values)) return null;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
      return i;
    }
  }
  return null;
}

function resolveProfileTargetCurrency(profile: Record<string, unknown> | null): string {
  const profileCurrency = typeof profile?.currency === 'string' ? profile.currency.trim().toUpperCase() : '';
  return profileCurrency || 'USD';
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return '—';
}

function formatTableValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function RenderSeriesTable(props: { title: string; columns: string[]; rows: Array<{ label: string; unit?: string; values: Array<number | null> }> }) {
  const table = useMemo(() => buildTransposedTable({ columns: props.columns, rows: props.rows }), [props.columns, props.rows]);

  return (
    <section className="projects-series-section">
      <h2>{props.title}</h2>
      {table.rows.length === 0 ? (
        <p className="projects-muted">No series data available yet for this project.</p>
      ) : (
        <div className="projects-table-wrap">
          <table className="projects-table">
            <thead>
              <tr>
                <th>Metric</th>
                {table.columns.map((column) => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => {
                const label = row.unit ? `${row.label} (${row.unit})` : row.label;
                return (
                  <tr key={label}>
                    <th>{label}</th>
                    {row.cells.map((cell, idx) => <td key={`${label}-${idx}`}>{formatTableValue(cell)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ProjectsPage() {
  const projectId = useMemo(() => getRouteProjectId(window.location.pathname), []);
  const [symbol] = useState(() => getSymbolFromQuery(window.location.search));
  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const [projects, setProjects] = useState<CompanyProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const [selectedProject, setSelectedProject] = useState<CompanyProjectRecord | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotWarnings, setSnapshotWarnings] = useState<string[]>([]);
  const [snapshotDiagnosticsErrors, setSnapshotDiagnosticsErrors] = useState<string[]>([]);
  const [snapshotData, setSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [profileDefaults, setProfileDefaults] = useState<Record<string, unknown> | null>(null);
  const [companyStatements, setCompanyStatements] = useState<{ balance?: Record<string, Array<number | null>>; income?: Record<string, Array<number | null>> } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      setLoadingProjects(true);
      setProjectsError(null);
      try {
        const list = await listCompanyProjects(symbol);
        if (isMounted) {
          setProjects(list);
        }
      } catch (error) {
        if (isMounted) {
          setProjects([]);
          setProjectsError((error as Error).message);
        }
      } finally {
        if (isMounted) {
          setLoadingProjects(false);
        }
      }
    }

    void loadProjects();
    return () => {
      isMounted = false;
    };
  }, [symbol]);


  useEffect(() => {
    let isMounted = true;

    async function loadCompanyStatements() {
      try {
        const response = await fetch(`/api/company?ticker=${encodeURIComponent(symbol)}`);
        const payload = (await response.json()) as {
          balance?: Record<string, Array<number | null>>;
          income?: Record<string, Array<number | null>>;
        };
        if (!isMounted) return;
        setCompanyStatements({
          balance: payload?.balance,
          income: payload?.income,
        });
      } catch {
        if (!isMounted) return;
        setCompanyStatements(null);
      }
    }

    void loadCompanyStatements();
    return () => {
      isMounted = false;
    };
  }, [symbol]);

  useEffect(() => {
    let isMounted = true;

    async function loadProfileDefaults() {
      try {
        const response = await fetch(`/api/company/profile?ticker=${encodeURIComponent(symbol)}`);
        const payload = (await response.json()) as { profile?: Record<string, unknown> };
        if (!isMounted) return;
        setProfileDefaults(payload?.profile ?? null);
      } catch {
        if (!isMounted) return;
      }
    }

    void loadProfileDefaults();
    return () => {
      isMounted = false;
    };
  }, [symbol]);

  const lockedTargetCurrency = useMemo(() => resolveProfileTargetCurrency(profileDefaults), [profileDefaults]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let isMounted = true;

    async function loadProjectAndSnapshot() {
      const currentProjectId = projectId;
      if (!currentProjectId) return;
      setSnapshotLoading(true);
      setSnapshotError(null);
      setSnapshotWarnings([]);
      setSnapshotDiagnosticsErrors([]);
      try {
        const project = await getCompanyProject(symbol, currentProjectId);
        if (!isMounted) return;
        setSelectedProject(project);

        const sharesCurrent = resolveCommonSharesCurrent({
          balance: companyStatements?.balance,
          income: companyStatements?.income,
        });
        const priceCurrent = readFiniteNumber(profileDefaults?.price);
        const marketWarnings: string[] = [];
        const market =
          sharesCurrent !== null && sharesCurrent > 0 && priceCurrent !== null && priceCurrent > 0
            ? {
                shares_current: sharesCurrent,
                price_current_TargetCurrency: priceCurrent,
              }
            : undefined;
        if (!market) {
          if (!(sharesCurrent !== null && sharesCurrent > 0)) {
            marketWarnings.push('market.shares_current missing (resolved from statements); EV/multiples will be null.');
          }
          if (!(priceCurrent !== null && priceCurrent > 0)) {
            marketWarnings.push('market.price_current_TargetCurrency missing from profile.price; EV/multiples may be null.');
          }
        }

        const payload: SnapshotRequest = {
          symbol,
          targetCurrency: lockedTargetCurrency,
          discountRate: 0.1,
          market,
          balanceSheet: {
            cash_t0_TargetCurrency: 0,
            debt_t0_TargetCurrency: 0,
          },
          scenario: { mode: 'spot' },
          fx: {
            source: lockedTargetCurrency === 'USD' ? 'manual' : 'auto',
            anchor: 'today',
            scenario: { mode: 'spot' },
            manual_fx_USD_to_TargetCurrency: lockedTargetCurrency === 'USD' ? 1 : undefined,
          },
          projects: [
            {
              projectId: project.project_id,
              rawJson: project.raw_json,
            },
          ],
        };

        const result = await postCorporateSnapshot(payload, { refresh: lockedTargetCurrency !== 'USD' });
        if (!isMounted) return;

        setSnapshotWarnings([...marketWarnings, ...(result.diagnostics?.warnings ?? [])]);
        setSnapshotDiagnosticsErrors(result.diagnostics?.errors ?? []);
        if (!result.ok || !result.snapshot) {
          setSnapshotData(null);
          setSnapshotError('Snapshot request failed. Check diagnostics for details.');
          return;
        }

        setSnapshotData(result.snapshot as unknown as Record<string, unknown>);
      } catch (error) {
        if (!isMounted) return;
        setSelectedProject(null);
        setSnapshotData(null);
        setSnapshotError((error as Error).message);
      } finally {
        if (isMounted) {
          setSnapshotLoading(false);
        }
      }
    }

    void loadProjectAndSnapshot();
    return () => {
      isMounted = false;
    };
  }, [lockedTargetCurrency, companyStatements, profileDefaults, projectId, symbol]);

  const metrics = useMemo(() => {
    if (!snapshotData) return [] as Array<{ label: string; value: unknown }>;
    const aggregation = (snapshotData.aggregation ?? {}) as Record<string, unknown>;

    return [
      { label: 'price_current_TargetCurrency', value: readFiniteNumber(profileDefaults?.price) },
      { label: 'targetCurrency (locked from profile)', value: lockedTargetCurrency },
      { label: 'MarketCap_TargetCurrency', value: snapshotData.MarketCap_TargetCurrency },
      { label: 'EV_TargetCurrency', value: snapshotData.EV_TargetCurrency },
      { label: 'NPV_today_TargetCurrency', value: snapshotData.NPV_today_TargetCurrency },
      { label: 'NAV_today_TargetCurrency', value: snapshotData.NAV_today_TargetCurrency },
      { label: 'EV_over_NPV', value: snapshotData.EV_over_NPV },
      { label: 'EV_over_NAV', value: snapshotData.EV_over_NAV },
      { label: 'P_over_NAV', value: snapshotData.P_over_NAV },
      { label: 'CF_LOM_TargetCurrency', value: snapshotData.CF_LOM_TargetCurrency },
      { label: 'DCF_prodStart_present_TargetCurrency', value: snapshotData.DCF_prodStart_present_TargetCurrency },
      { label: 'NPV_over_ETLV', value: snapshotData.NPV_over_ETLV },
      { label: 'DCF_present_over_ETLV', value: snapshotData.DCF_present_over_ETLV },
      { label: 'Payback_approx_years', value: snapshotData.Payback_approx_years },
      { label: 'Payback_real_years', value: snapshotData.Payback_real_years },
      { label: 'ROI_10Y_pct', value: snapshotData.ROI_10Y_pct },
      { label: 'LOM_average_EBIT_ROCE_pct', value: snapshotData.LOM_average_EBIT_ROCE_pct },
      { label: 'LOM_discounted_EBIT_ROCE_pct', value: snapshotData.LOM_discounted_EBIT_ROCE_pct },
      { label: 'Revenue_10Y_TargetCurrency', value: snapshotData.Revenue_10Y_TargetCurrency },
      { label: 'FCFF_10Y_TargetCurrency', value: snapshotData.FCFF_10Y_TargetCurrency },
      { label: 'InSituValue_10Y_TargetCurrency', value: snapshotData.InSituValue_10Y_TargetCurrency },
      { label: 'EV_over_Revenue_10Y', value: snapshotData.EV_over_Revenue_10Y },
      { label: 'AuEq_Oz_10Y', value: snapshotData.AuEq_Oz_10Y },
      { label: 'AISC (corp)', value: aggregation.aiscAuEqUSDPerOz_LOM ?? null },
    ];
  }, [lockedTargetCurrency, snapshotData, profileDefaults]);

  const series = (snapshotData?.series ?? null) as SeriesShape | null;
  const parsedProject = useMemo(() => {
    if (!selectedProject?.raw_json) return null;
    try {
      return parseProjectJsonV1WithContext(selectedProject.raw_json);
    } catch {
      return null;
    }
  }, [selectedProject]);

  const seriesColumns = useMemo(() => {
    if (!series) return [] as string[];
    const idx = Array.isArray(series.periodIndex) ? series.periodIndex : [];
    return idx.map((value) => `t${value}`);
  }, [series]);

  const operationsGridInput = useMemo(() => {
    const raw = parsedProject;
    if (!raw) return null;
    const rawJson = (selectedProject?.raw_json ?? null) as Record<string, unknown> | null;
    const rawTime = rawJson && typeof rawJson.time === 'object' && rawJson.time !== null && !Array.isArray(rawJson.time)
      ? rawJson.time as Record<string, unknown>
      : null;
    let resolvedTime;
    try {
      resolvedTime = resolveV2TimeAxis({
        masterN: rawTime?.masterN as number,
        productionStartPeriod: rawTime?.productionStartPeriod as number,
        productionStartYear: rawTime?.productionStartYear as number,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const projectLabel = selectedProject?.project_id ?? 'unknown';
      throw new Error(
        `Invalid project time in ProjectsPage for projectId=${projectLabel}: ${message}; masterN=${String(rawTime?.masterN)}, productionStartPeriod=${String(rawTime?.productionStartPeriod)}, productionStartYear=${String(rawTime?.productionStartYear)}`,
      );
    }
    return {
      masterN: resolvedTime.masterN,
      productionStartPeriod: resolvedTime.productionStartPeriod,
      yearsByPeriod: resolvedTime.yearsByPeriod,
      operations: {
        oreMilledTonnes: raw.context.operations?.oreMilledTonnes,
        oreMinedTonnes: raw.context.operations?.oreMinedTonnes,
        oreTonnageUnit: raw.context.operations?.oreTonnageUnit,
        capacity: {
          throughputUnit: raw.context.operations?.capacity?.throughputUnit,
          nameplateThroughput: raw.context.operations?.capacity?.nameplateThroughput,
          utilizationPct: raw.context.operations?.capacity?.utilizationPct,
        },
      },
      metals: {
        payableQtyByMetal: raw.engineInputWithoutPrices.payableQtyByMetal,
        payableQtyUnitByMetal: raw.engineInputWithoutPrices.payableQtyUnitByMetal,
      },
      economics: {
        priceUSDByMetal: series?.revenueByMetal_USD
          ? Object.fromEntries(
            Object.entries(series.revenueByMetal_USD).map(([metal, revenueSeries]) => {
              const qty = raw.engineInputWithoutPrices.payableQtyByMetal[metal] ?? [];
              const derivedPrices = revenueSeries.map((revenue, t) => {
                const quantity = qty[t];
                if (revenue === null || quantity === null || !Number.isFinite(revenue) || !Number.isFinite(quantity) || quantity === 0) return null;
                return revenue / quantity;
              });
              return [metal, derivedPrices];
            }),
          )
          : undefined,
        operatingCostsUSD: series?.operatingCostsUSD,
        royaltiesUSD: series?.royaltiesUSD,
        royaltiesDetail: raw.engineInputWithoutPrices.royaltiesDetail,
        ebitdaUSD: series?.ebitdaUSD,
        ebitUSD: series?.ebitUSD,
        depreciationUSD: series?.depreciationUSD,
        taxableIncomeUSD: series?.taxableIncomeUSD,
        taxUSD: series?.taxUSD,
        effectiveTaxRate: series?.effectiveTaxRate,
      },
    };
  }, [parsedProject, selectedProject, series]);

  const operationsGrid = useMemo(() => {
    if (!operationsGridInput) return null;
    return buildOperationsGridModel(operationsGridInput);
  }, [operationsGridInput]);

  const projectMountDebug = useMemo(() => {
    const rawJson = (selectedProject?.raw_json ?? null) as Record<string, unknown> | null;
    const rawTime = rawJson && typeof rawJson.time === 'object' && rawJson.time !== null && !Array.isArray(rawJson.time)
      ? rawJson.time as Record<string, unknown>
      : null;
    const tp = Number.isInteger(operationsGridInput?.productionStartPeriod)
      ? operationsGridInput?.productionStartPeriod as number
      : null;
    const yearsByPeriod = Array.isArray(operationsGridInput?.yearsByPeriod)
      ? operationsGridInput.yearsByPeriod
      : [];

    const alignmentSources: Record<string, Array<number | null> | undefined> = {
      operations_oreMinedTonnes: operationsGridInput?.operations?.oreMinedTonnes,
      operations_oreMilledTonnes: operationsGridInput?.operations?.oreMilledTonnes,
      series_capexUSD: parsedProject?.engineInputWithoutPrices.phase1.capexUSD,
      metals_payableQtyByMetal_Au: operationsGridInput?.metals?.payableQtyByMetal?.Au,
      metals_payableQtyByMetal_Ag: operationsGridInput?.metals?.payableQtyByMetal?.Ag,
      metals_payableQtyByMetal_Cu: operationsGridInput?.metals?.payableQtyByMetal?.Cu,
    };

    const alignmentCheck = Object.fromEntries(Object.entries(alignmentSources).map(([key, values]) => {
      const nonZero = firstNonZeroIndex(values);
      const valueAtTp = tp === null ? null : (values?.[tp] ?? null);
      const valueAtTpPlus1 = tp === null ? null : (values?.[tp + 1] ?? null);
      return [key, {
        valueAtTp,
        valueAtTpPlus1,
        firstNonZeroIndex: nonZero,
        doesFirstNonZeroEqualTp: tp === null || nonZero === null ? null : nonZero === tp,
      }];
    }));

    const yearAtT0 = Number.isInteger(yearsByPeriod[0]) ? yearsByPeriod[0] : null;
    const yearAtTp = tp === null ? null : (Number.isInteger(yearsByPeriod[tp]) ? yearsByPeriod[tp] : null);
    const expectedYearAtTp = rawTime && Number.isInteger(rawTime.productionStartYear)
      ? rawTime.productionStartYear
      : null;

    return {
      raw: {
        version: rawJson?.version ?? null,
        time: {
          masterN: rawTime?.masterN ?? null,
          productionStartPeriod: rawTime?.productionStartPeriod ?? null,
          productionStartYear: rawTime?.productionStartYear ?? null,
          yearsByPeriod_first8: Array.isArray(yearsByPeriod)
            ? yearsByPeriod.slice(0, 8)
            : null,
        },
      },
      engine: {
        masterN: operationsGridInput?.masterN ?? null,
        productionStartPeriod: operationsGridInput?.productionStartPeriod ?? null,
        productionStartYear: expectedYearAtTp,
        yearsByPeriod_first8: yearsByPeriod.slice(0, 8),
      },
      alignmentCheck,
      yearCheck: {
        yearAtT0,
        yearAtTp,
        expectedYearAtTp,
        doesYearMatchTp: yearAtTp === null || expectedYearAtTp === null ? null : yearAtTp === expectedYearAtTp,
      },
    };
  }, [operationsGridInput, parsedProject, selectedProject]);

  const economicsPnl = useMemo(() => {
    if (!series || seriesColumns.length === 0) return null;
    return buildProjectGridPnl(series, seriesColumns.length);
  }, [series, seriesColumns.length]);

  const economicsRows = useMemo(() => {
    if (!series || seriesColumns.length === 0 || !economicsPnl) return [] as Array<{ label: string; unit?: string; values: Array<number | null> }>;
    const rows: Array<{ label: string; unit?: string; values: Array<number | null> }> = [];
    const pnl = economicsPnl;

    if (Array.isArray(series.totalRevenue_USD)) rows.push({ label: 'Revenue total', unit: 'USD', values: series.totalRevenue_USD });
    for (const metal of Object.keys(pnl.revenueByMetal).sort((a, b) => a.localeCompare(b))) {
      const values = pnl.revenueByMetal[metal];
      if (Array.isArray(values)) {
        rows.push({ label: `Revenue ${metal}`, unit: 'USD', values });
      }
    }

    const definitions: Array<{ label: string; values: Array<number | null> | undefined; unit?: string }> = [
      { label: 'Gross revenue', values: pnl.grossRevenue },
      { label: 'Operating costs', values: pnl.operatingCosts },
      { label: 'Royalties', values: pnl.royalties },
      { label: 'Gross profit', values: pnl.grossProfit },
      { label: 'Site G&A', values: pnl.siteGandA },
      { label: 'EBIT', values: pnl.ebit },
      { label: 'Taxable income', values: pnl.taxableIncome },
      { label: 'Tax', values: pnl.tax },
      { label: 'Effective tax rate', values: pnl.effectiveTaxRate, unit: '' },
      { label: 'Sustaining capex', values: pnl.sustainingCapex },
      { label: 'Reclamation', values: pnl.reclamation },
      { label: 'Working capital delta', values: pnl.workingCapitalDelta },
      { label: 'Byproduct credits', values: pnl.byproductCredits },
      { label: 'Capex', values: pnl.capex },
      { label: 'FCFF', values: pnl.fcff },
      { label: 'Sustaining cost', values: series.sustainingCostUSD },
      { label: 'Total Capex', values: series.totalCapexUSD },
    ];

    for (const definition of definitions) {
      if (Array.isArray(definition.values)) rows.push({ label: definition.label, unit: definition.unit ?? 'USD', values: definition.values });
    }

    return rows;
  }, [economicsPnl, series, seriesColumns.length]);

  const projectGridDebug = useMemo(() => {
    if (!debugMode || !operationsGridInput || !operationsGrid || !series || !economicsPnl) return null;

    const rowValuesByLabel = new Map(economicsRows.map((row) => [row.label, row.values]));
    const operationsRowByLabel = new Map(operationsGrid.rows.map((row) => [row.label, row.values]));
    const pricesByMetal = operationsGridInput.economics?.priceUSDByMetal ?? {};
    const payablesByMetal = operationsGridInput.metals?.payableQtyByMetal ?? {};
    const tp = Number.isInteger(operationsGridInput.productionStartPeriod) ? operationsGridInput.productionStartPeriod as number : null;
    const yearsByPeriod = Array.isArray(operationsGridInput.yearsByPeriod) ? operationsGridInput.yearsByPeriod : [];
    const rawJson = (selectedProject?.raw_json ?? null) as Record<string, unknown> | null;
    const rawTime = rawJson && typeof rawJson.time === 'object' && rawJson.time !== null && !Array.isArray(rawJson.time)
      ? rawJson.time as Record<string, unknown>
      : null;
    const lastPeriod = Math.max(0, operationsGrid.columnCount - 1);
    const keyPeriodCandidates = [0, 1, tp, tp === null ? null : tp + 1, lastPeriod];
    const keyPeriods = Array.from(new Set(keyPeriodCandidates.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= lastPeriod))).sort((a, b) => a - b);
    const selectedPeriods = Array.from({ length: operationsGrid.columnCount }, (_, t) => t).map((t) => {
      const displayRevenueAu = rowValuesByLabel.get('Revenue Au')?.[t] ?? null;
      const displayRevenueAg = rowValuesByLabel.get('Revenue Ag')?.[t] ?? null;
      const displayRevenueCu = rowValuesByLabel.get('Revenue Cu')?.[t] ?? null;
      const displayRevenuePb = rowValuesByLabel.get('Revenue Pb')?.[t] ?? null;
      const displayRevenueZn = rowValuesByLabel.get('Revenue Zn')?.[t] ?? null;
      const displayGrossRevenue = rowValuesByLabel.get('Gross revenue')?.[t] ?? null;
      const displayEbit = rowValuesByLabel.get('EBIT')?.[t] ?? null;
      const displayTaxableIncome = rowValuesByLabel.get('Taxable income')?.[t] ?? null;
      const displayTax = rowValuesByLabel.get('Tax')?.[t] ?? null;
      const displayFcff = rowValuesByLabel.get('FCFF')?.[t] ?? null;

      return {
        t,
        year: yearsByPeriod[t] ?? null,
        isKeyPeriod: keyPeriods.includes(t),
        rawInputs: {
          capexUSD: series.capexUSD?.[t] ?? null,
          operatingCostsUSD: series.operatingCostsUSD?.[t] ?? null,
          siteGandA_USD: series.siteGandA_USD?.[t] ?? null,
          sustainingCapexUSD: series.sustainingCapexUSD?.[t] ?? null,
          royaltiesUSD: series.royaltiesUSD?.[t] ?? null,
          reclamationUSD: series.reclamationUSD?.[t] ?? null,
          workingCapitalDeltaUSD: series.workingCapitalDeltaUSD?.[t] ?? null,
          byproductCreditsUSD: series.byproductCreditsUSD?.[t] ?? null,
          depreciationUSD: series.depreciationUSD?.[t] ?? null,
        },
        payables: {
          Au: payablesByMetal.Au?.[t] ?? null,
          Ag: payablesByMetal.Ag?.[t] ?? null,
          Cu: payablesByMetal.Cu?.[t] ?? null,
          Pb: payablesByMetal.Pb?.[t] ?? null,
          Zn: payablesByMetal.Zn?.[t] ?? null,
        },
        prices: {
          Au: pricesByMetal.Au?.[t] ?? null,
          Ag: pricesByMetal.Ag?.[t] ?? null,
          Cu: pricesByMetal.Cu?.[t] ?? null,
          Pb: pricesByMetal.Pb?.[t] ?? null,
          Zn: pricesByMetal.Zn?.[t] ?? null,
        },
        displayRowsSource: {
          revenueAu_display: displayRevenueAu,
          revenueAg_display: displayRevenueAg,
          revenueCu_display: displayRevenueCu,
          revenuePb_display: displayRevenuePb,
          revenueZn_display: displayRevenueZn,
          grossRevenue_display: displayGrossRevenue,
          grossProfit_display: rowValuesByLabel.get('Gross profit')?.[t] ?? null,
          ebit_display: displayEbit,
          taxableIncome_display: displayTaxableIncome,
          tax_display: displayTax,
          fcff_display: displayFcff,
        },
        snapshotSource: {
          grossRevenue_snapshot: series.totalRevenue_USD?.[t] ?? null,
          ebit_snapshot: series.ebitUSD?.[t] ?? null,
          taxableIncome_snapshot: series.taxableIncomeUSD?.[t] ?? null,
          tax_snapshot: series.taxUSD?.[t] ?? null,
          fcff_snapshot: series.fcffUSD?.[t] ?? null,
        },
        recomputedPnl: {
          revenueAu: economicsPnl.revenueByMetal.Au?.[t] ?? null,
          revenueAg: economicsPnl.revenueByMetal.Ag?.[t] ?? null,
          revenueCu: economicsPnl.revenueByMetal.Cu?.[t] ?? null,
          revenuePb: economicsPnl.revenueByMetal.Pb?.[t] ?? null,
          revenueZn: economicsPnl.revenueByMetal.Zn?.[t] ?? null,
          grossRevenue: economicsPnl.grossRevenue[t] ?? null,
          grossProfit: economicsPnl.grossProfit[t] ?? null,
          ebit: economicsPnl.ebit[t] ?? null,
          taxableIncome: economicsPnl.taxableIncome[t] ?? null,
          tax: economicsPnl.tax[t] ?? null,
          fcff: economicsPnl.fcff[t] ?? null,
        },
        comparison: {
          displayVsRecomputed: {
            grossRevenue_match: numbersMatch(displayGrossRevenue, economicsPnl.grossRevenue[t]),
            ebit_match: numbersMatch(displayEbit, economicsPnl.ebit[t]),
            taxableIncome_match: numbersMatch(displayTaxableIncome, economicsPnl.taxableIncome[t]),
            tax_match: numbersMatch(displayTax, economicsPnl.tax[t]),
            fcff_match: numbersMatch(displayFcff, economicsPnl.fcff[t]),
          },
          displayVsSnapshot: {
            grossRevenue_match: numbersMatch(displayGrossRevenue, series.totalRevenue_USD?.[t] ?? null),
            ebit_match: numbersMatch(displayEbit, series.ebitUSD?.[t] ?? null),
            taxableIncome_match: numbersMatch(displayTaxableIncome, series.taxableIncomeUSD?.[t] ?? null),
            tax_match: numbersMatch(displayTax, series.taxUSD?.[t] ?? null),
            fcff_match: numbersMatch(displayFcff, series.fcffUSD?.[t] ?? null),
          },
        },
        cellRenderRaw: {
          gradeAu_raw: operationsRowByLabel.get('Grade Au (gpt)')?.[t] ?? operationsRowByLabel.get('Grade Au (—)')?.[t] ?? null,
          payableAu_raw: operationsRowByLabel.get('Payable Au (toz)')?.[t] ?? null,
          revenueAu_raw: operationsRowByLabel.get('Revenue Au (USD)')?.[t] ?? displayRevenueAu,
          ebit_raw: displayEbit,
        },
        cellRenderFormatted: {
          revenueAu_cell: formatTableValue(displayRevenueAu),
          ebit_cell: formatTableValue(displayEbit),
        },
      };
    });

    const summary = {
      revenueRowsFrom: 'economicsRows -> buildProjectGridPnl(...).revenueByMetal',
      ebitRowFrom: 'economicsRows -> buildProjectGridPnl(...).ebit',
      fcffRowFrom: 'economicsRows -> buildProjectGridPnl(...).fcff',
      isMixedSource: false,
      mixedSourceNotes: [],
    };

    return {
      sourceOfTruthSummary: summary,
      projectId: selectedProject?.project_id ?? projectId ?? null,
      tp,
      productionStartYear: Number.isInteger(rawTime?.productionStartYear) ? rawTime?.productionStartYear : (tp === null ? null : yearsByPeriod[tp] ?? null),
      yearsByPeriod,
      keyPeriods,
      selectedPeriods,
    };
  }, [debugMode, economicsPnl, economicsRows, operationsGrid, operationsGridInput, projectId, selectedProject, series]);

  const projectTitle = (() => {
    const meta = (selectedProject?.raw_json?.meta ?? {}) as Record<string, unknown>;
    const projectName = typeof meta.projectName === 'string' && meta.projectName.trim() ? meta.projectName : null;
    return projectName ?? selectedProject?.project_id ?? projectId ?? 'Project';
  })();

  if (!projectId) {
    return (
      <div className="projects-shell">
        <main className="projects-card">
          <h1>Project</h1>
          <p>Choose a project to view its metrics, operations, and economics.</p>
          <p className="projects-muted">Symbol: <strong>{symbol}</strong></p>

          <div className="projects-actions">
            <button type="button" onClick={() => setSelectorOpen((prev) => !prev)}>
              Select project
            </button>
            <a className="button-link" href={`/company/${encodeURIComponent(symbol)}/projects?action=new`}>
              Add project
            </a>
          </div>

          <p className="projects-muted">To add a brand-new project, use “New from template” in the editor.</p>

          {selectorOpen && (
            <section className="projects-selector">
              <h2>Select project</h2>
              {loadingProjects && <p>Loading stored projects…</p>}
              {projectsError && <p className="status error">{projectsError}</p>}
              {!loadingProjects && !projectsError && projects.length === 0 && <p className="status empty">No stored projects found for {symbol}.</p>}
              {!loadingProjects && !projectsError && projects.length > 0 && (
                <ul>
                  {projects.map((project) => (
                    <li key={project.project_id}>
                      <a href={`/projects/${encodeURIComponent(project.project_id)}?symbol=${encodeURIComponent(symbol)}`}>
                        {project.project_id} — {project.project_name || 'Unnamed project'}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="projects-shell">
      <main className="projects-card">
        <header className="projects-header">
          <div>
            <h1>{projectTitle}</h1>
            <p className="projects-muted">{selectedProject?.project_id ?? projectId} • {symbol}</p>
            <p className="projects-muted">Target currency: {lockedTargetCurrency} (from profile)</p>
          </div>
          <div className="projects-actions">
            <a className="button-link" href={`/company/${encodeURIComponent(symbol)}/projects?projectId=${encodeURIComponent(projectId)}`}>Edit project</a>
            <a className="button-link" href={`/projects?symbol=${encodeURIComponent(symbol)}`}>Back to projects</a>
          </div>
        </header>

        {snapshotLoading && <p>Running snapshot…</p>}
        {snapshotError && <p className="status error">{snapshotError}</p>}

        <section className="projects-metrics" aria-label="Key metrics">
          {metrics.map((metric) => (
            <article key={metric.label} className="producer-card">
              <h3>{metric.label}</h3>
              <p>{formatMetricValue(metric.value)}</p>
            </article>
          ))}
        </section>

        <section className="projects-series-section">
          <h2>Operations</h2>
          {!operationsGrid ? (
            <p className="projects-muted">No series data available yet for this project.</p>
          ) : (
            <>
              {operationsGrid.notes.map((note) => <p key={note} className="projects-warning-note">{note}</p>)}
              {operationsGrid.warnings.map((warning) => <p key={warning} className="projects-warning-note">{warning}</p>)}

              <div className="projects-capacity-block">
                <div><strong>Nameplate throughput:</strong> {formatTableValue(operationsGrid.capacity.nameplateThroughput)} {operationsGrid.capacity.throughputUnit ?? ''}</div>
                <div><strong>Utilization:</strong> {operationsGrid.capacity.utilizationPct === null ? '—' : `${formatTableValue(operationsGrid.capacity.utilizationPct * 100)}%`}</div>
                <div><strong>Effective throughput:</strong> {formatTableValue(operationsGrid.capacity.effectiveThroughput)} {operationsGrid.capacity.throughputUnit ?? ''}</div>
              </div>

              <div className="projects-table-wrap">
                <table className="projects-table projects-table-tight">
                  <thead>
                    <tr>
                      <th>Year</th>
                      {operationsGrid.years.map((value, idx) => <th key={`year-${idx}`}>{value}</th>)}
                    </tr>
                    <tr>
                      <th>t</th>
                      {operationsGrid.tIndex.map((value, idx) => <th key={`t-${idx}`}>{value}</th>)}
                    </tr>
                    <tr>
                      <th>t - tp</th>
                      {operationsGrid.tMinusTp.map((value, idx) => <th key={`dt-${idx}`}>{value}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {operationsGrid.rows.map((row) => (
                      <tr key={row.label}>
                        <th>{row.label}</th>
                        {Array.from({ length: operationsGrid.columnCount }, (_, t) => <td key={`${row.label}-${t}`}>{formatTableValue(row.values[t] ?? null)}</td>)}
                      </tr>
                    ))}

                    {operationsGrid.totals.length > 0 && (
                      <tr>
                        <th colSpan={operationsGrid.columnCount + 1} className="projects-subheader-cell">Totals (t &gt;= tp)</th>
                      </tr>
                    )}
                    {operationsGrid.totals.map((total) => (
                      <tr key={total.label}>
                        <th>{total.label}</th>
                        <td colSpan={operationsGrid.columnCount}>{formatTableValue(total.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <RenderSeriesTable title="Economics" columns={seriesColumns} rows={economicsRows} />

        {debugMode && (
          <details>
            <summary>PROJECT GRID DEBUG</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(projectGridDebug, null, 2)}</pre>
          </details>
        )}

        <details>
          <summary>Diagnostics</summary>
          {(snapshotDiagnosticsErrors.length === 0 && snapshotWarnings.length === 0) && <p>No diagnostics.</p>}
          {snapshotDiagnosticsErrors.length > 0 && (
            <div>
              <h3>Errors</h3>
              <ul>{snapshotDiagnosticsErrors.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {snapshotWarnings.length > 0 && (
            <div>
              <h3>Warnings</h3>
              <ul>{snapshotWarnings.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          <h3>---- PROJECT MOUNT DEBUG ----</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(projectMountDebug, null, 2)}</pre>
        </details>

        <details>
          <summary>Unit Audit</summary>
          {!series?.unitAudit || Object.keys(series.unitAudit.metals ?? {}).length === 0 ? (
            <p>No unit audit data.</p>
          ) : (
            <div>
              {Object.entries(series.unitAudit.metals)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([metal, audit]) => (
                  <div key={metal} style={{ marginBottom: '0.75rem' }}>
                    <h3>{metal}</h3>
                    <ul>
                      <li>qty unit: {audit.qtyUnit}</li>
                      <li>price unit: {audit.priceUnit}</li>
                      <li>canonical unit: {audit.canonicalQtyUnit}</li>
                    </ul>
                    {audit.warnings.length > 0 && (
                      <>
                        <h4>Warnings</h4>
                        <ul>{audit.warnings.map((warning) => <li key={`${metal}-${warning}`}>{warning}</li>)}</ul>
                      </>
                    )}
                  </div>
                ))}
            </div>
          )}
        </details>

        <details>
          <summary>Snapshot JSON</summary>
          <pre>{snapshotData ? JSON.stringify(snapshotData, null, 2) : 'No snapshot loaded.'}</pre>
        </details>
      </main>
    </div>
  );
}
