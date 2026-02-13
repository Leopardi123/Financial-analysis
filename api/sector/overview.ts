import { execute, query } from "../_db.js";
import { ensureSchema, tables } from "../_migrate.js";

function normalizeName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function ensureSector(name: string) {
  const now = new Date().toISOString();
  await execute(
    `INSERT OR IGNORE INTO ${tables.sectors} (name, created_at) VALUES (?, ?)`,
    [name, now]
  );
  const rows = await query(`SELECT id, name FROM ${tables.sectors} WHERE name = ?`, [name]);
  return rows[0] as { id: number; name: string } | undefined;
}

async function ensureSubsector(sectorId: number, name: string) {
  const now = new Date().toISOString();
  await execute(
    `INSERT OR IGNORE INTO ${tables.subsectors} (sector_id, name, created_at) VALUES (?, ?, ?)`,
    [sectorId, name, now]
  );
  const rows = await query(
    `SELECT id, name FROM ${tables.subsectors} WHERE sector_id = ? AND name = ?`,
    [sectorId, name]
  );
  return rows[0] as { id: number; name: string } | undefined;
}

const REQUIRED_METRICS = [
  "revenue_growth",
  "ebitda_margin",
  "fcf_margin",
  "net_debt_to_ebitda",
  "capex_to_operating_cf",
];

const FMP_SUGGESTED_ENDPOINTS = [
  "income-statement",
  "balance-sheet-statement",
  "cash-flow-statement",
  "historical-price-full",
  "enterprise-values",
];

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function safeNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value;
}

async function computeSectorMetrics(
  companyIds: number[],
  sectorId: number,
  subsectorId: number | null
) {
  if (companyIds.length === 0) {
    return { metrics: [], missing: REQUIRED_METRICS };
  }

  const rows = await query(
    `SELECT company_id, fiscal_date, field, value
     FROM ${tables.financialPoints}
     WHERE company_id IN (${companyIds.map(() => "?").join(",")})
       AND period = 'fy'
       AND statement IN ('income','balance','cashflow')`,
    companyIds
  );

  const perCompany = new Map<number, Record<string, Record<string, number>>>();

  for (const row of rows) {
    const companyId = Number(row.company_id);
    const fiscalDate = String(row.fiscal_date ?? "");
    const field = String(row.field ?? "");
    const value = safeNumber(row.value);
    if (!companyId || !field || value === null || !fiscalDate) {
      continue;
    }
    if (!perCompany.has(companyId)) {
      perCompany.set(companyId, {});
    }
    const companyData = perCompany.get(companyId)!;
    if (!companyData[fiscalDate]) {
      companyData[fiscalDate] = {};
    }
    companyData[fiscalDate][field] = value;
  }

  const revenueGrowth: number[] = [];
  const ebitdaMargin: number[] = [];
  const fcfMargin: number[] = [];
  const netDebtToEbitda: number[] = [];
  const capexToOpCf: number[] = [];

  for (const companyData of perCompany.values()) {
    const dates = Object.keys(companyData).sort();
    if (dates.length === 0) {
      continue;
    }
    const latest = companyData[dates[dates.length - 1]];
    const previous = dates.length > 1 ? companyData[dates[dates.length - 2]] : null;

    const revenue = safeNumber(latest.revenue);
    const prevRevenue = previous ? safeNumber(previous.revenue) : null;
    const ebitda = safeNumber(latest.ebitda);
    const freeCashFlow = safeNumber(latest.freeCashFlow);
    const operatingCashFlow = safeNumber(latest.operatingCashFlow);
    const capex = safeNumber(latest.capitalExpenditure);
    const totalDebt = safeNumber(latest.totalDebt);
    const cash = safeNumber(latest.cashAndShortTermInvestments);

    if (revenue !== null && prevRevenue !== null && prevRevenue !== 0) {
      revenueGrowth.push(revenue / prevRevenue - 1);
    }
    if (revenue !== null && ebitda !== null && revenue !== 0) {
      ebitdaMargin.push(ebitda / revenue);
    }
    if (revenue !== null && freeCashFlow !== null && revenue !== 0) {
      fcfMargin.push(freeCashFlow / revenue);
    }
    if (ebitda !== null && ebitda !== 0 && totalDebt !== null && cash !== null) {
      netDebtToEbitda.push((totalDebt - cash) / ebitda);
    }
    if (operatingCashFlow !== null && operatingCashFlow !== 0 && capex !== null) {
      capexToOpCf.push(Math.abs(capex) / operatingCashFlow);
    }
  }

  const computed = [
    { metric: "revenue_growth", values: revenueGrowth },
    { metric: "ebitda_margin", values: ebitdaMargin },
    { metric: "fcf_margin", values: fcfMargin },
    { metric: "net_debt_to_ebitda", values: netDebtToEbitda },
    { metric: "capex_to_operating_cf", values: capexToOpCf },
  ];

  const metrics = computed
    .filter((item) => item.values.length > 0)
    .flatMap((item) => {
      const median = percentile(item.values, 0.5);
      const p25 = percentile(item.values, 0.25);
      const p75 = percentile(item.values, 0.75);
      const stats = [
        { stat: "median", value: median },
        { stat: "p25", value: p25 },
        { stat: "p75", value: p75 },
      ].filter((stat) => stat.value !== null);

      return stats.map((stat) => ({
        metric: `${item.metric}:${stat.stat}`,
        value: stat.value,
        sampleSize: item.values.length,
      }));
    });

  if (metrics.length > 0) {
    const now = new Date().toISOString();
    for (const metric of metrics) {
      await execute(
        `INSERT INTO ${tables.sectorMetrics}
         (sector_id, subsector_id, metric, period, value, source, as_of)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          sectorId,
          subsectorId ?? null,
          metric.metric,
          "fy_latest",
          metric.value,
          "computed_from_financial_points",
          now,
        ]
      );
    }
  }

  const missing = REQUIRED_METRICS.filter((metric) =>
    !metrics.some((item) => item.metric.startsWith(metric))
  );

  return { metrics, missing };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    const sectorName = normalizeName(req.query?.sector);
    const subsectorName = normalizeName(req.query?.subsector);

    if (!sectorName) {
      const sectors = await query(`SELECT id, name, description FROM ${tables.sectors} ORDER BY name ASC`);
      const subsectors = await query(
        `SELECT id, sector_id, name, description FROM ${tables.subsectors} ORDER BY name ASC`
      );
      res.status(200).json({ ok: true, sectors, subsectors });
      return;
    }

    const sector = await ensureSector(sectorName);
    if (!sector?.id) {
      res.status(500).json({ ok: false, error: "Failed to resolve sector" });
      return;
    }

    const subsector = subsectorName ? await ensureSubsector(sector.id, subsectorName) : null;

    const companyRows = await query(
      `SELECT company_id
       FROM ${tables.companySectorMap}
       WHERE sector_id = ? AND (subsector_id IS ? OR subsector_id = ?)`,
      [sector.id, subsector?.id ?? null, subsector?.id ?? null]
    );
    const companyIds = companyRows.map((row: any) => Number(row.company_id)).filter(Boolean);
    const computed = await computeSectorMetrics(companyIds, sector.id, subsector?.id ?? null);

    const metrics = await query(
      `SELECT metric, period, value, source, as_of
       FROM ${tables.sectorMetrics}
       WHERE sector_id = ? AND (subsector_id IS ? OR subsector_id = ?)
       ORDER BY as_of DESC`,
      [sector.id, subsector?.id ?? null, subsector?.id ?? null]
    );

    res.status(200).json({
      ok: true,
      sector,
      subsector,
      metrics,
      computedMetrics: computed.metrics,
      missingMetrics: computed.missing,
      suggestedFmpEndpoints: FMP_SUGGESTED_ENDPOINTS,
      todo: [
        "Missing automated sector metrics for EV/EBITDA, FCF yield, ROIC (requires market cap / EV sources).",
        "Missing sector/company mapping for any unmapped tickers.",
      ],
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
