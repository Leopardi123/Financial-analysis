import fs from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../../src/lib/snapshot/runCorporateSnapshot.ts';
import { computeProjectViewMetrics } from '../../src/lib/projectView/computeProjectPreRevenueView.ts';

function arg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function asSeries(raw: unknown): Array<number | null> {
  return Array.isArray(raw) ? raw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : [];
}

async function runCase(rawJson: Record<string, unknown>, label: string) {
  const body = {
    targetCurrency: 'USD',
    discountRate: 0.1,
    projects: [{ projectId: String((rawJson.meta as any)?.projectId ?? label), rawJson }],
    scenario: { mode: 'spot' as const },
    fx: { source: 'manual' as const, anchor: 'today' as const, scenario: { mode: 'spot' as const }, manual_fx_USD_to_TargetCurrency: 1 },
  };

  const result = await runCorporateSnapshotPipeline({ body, debug: true, refresh: false });

  const snapshot = result.ok ? result.snapshot : null;
  const project = (snapshot as any)?.project ?? null;
  const series = (snapshot as any)?.series ?? null;

  const projectView = project && series
    ? computeProjectViewMetrics({
      meta: { projectId: String((rawJson.meta as any)?.projectId ?? label) },
      targetCurrency: 'USD',
      fxUSDToTarget: 1,
      discountRate: 0.1,
      masterN: typeof (rawJson.time as any)?.masterN === 'number' ? (rawJson.time as any).masterN : null,
      sharesCurrent: 1,
      sharesPostFinancingInput: 1,
      priceCurrentTarget: 1,
      cashForNavTarget: 0, cashForEvTarget: 0, cashForEvIsPostFinancing: false,
      debtCurrentTarget: 0,
      enterpriseAdjustmentsTarget: 0,
      fcfUSD: asSeries((series as any).fcfUSD),
      capexUSD: asSeries((series as any).capexUSD),
      grossRevenueUSD: asSeries((series as any).totalRevenue_USD),
      ebitUSD: asSeries((series as any).ebitUSD),
      nopatUSD: asSeries((series as any).nopatUSD),
      effectiveTaxRate: asSeries((series as any).effectiveTaxRate),
      taxUSD: asSeries((series as any).taxUSD),
      federalIncomeTaxUSD: asSeries((series as any).federalIncomeTaxUSD),
      df_now: asSeries((series as any).df_now),
      economicsTaxRate: 0.35,
      payableAuEqOz: asSeries((series as any).payableAuEqOz),
      sustainingCostUSD: asSeries((series as any).sustainingCostUSD),
      productionStartPeriod: typeof (rawJson.time as any)?.productionStartPeriod === 'number' ? (rawJson.time as any).productionStartPeriod : null,
      financing: { equityPct: 100, debtPct: 0, cashUsedInput: 0 },
    })
    : null;

  return {
    label,
    pipelineOk: result.ok,
    diagnostics: result.diagnostics,
    snapshotList2: (project as any)?.lista2Metrics ?? null,
    projectViewList2: projectView?.list2 ?? null,
    projectViewTrace: projectView?.diagnostics.npv10_trace ?? null,
  };
}

async function main() {
  const jsonAPath = arg('--jsonA');
  const jsonBPath = arg('--jsonB');
  if (!jsonAPath || !jsonBPath) {
    throw new Error('Usage: node --experimental-strip-types scripts/debug/generateNpvTraceFromJsonCases.ts --jsonA <path> --jsonB <path>');
  }

  const [rawA, rawB] = await Promise.all([
    fs.readFile(path.resolve(jsonAPath), 'utf8'),
    fs.readFile(path.resolve(jsonBPath), 'utf8'),
  ]);

  const jsonA = JSON.parse(rawA) as Record<string, unknown>;
  const jsonB = JSON.parse(rawB) as Record<string, unknown>;

  const [caseA, caseB] = await Promise.all([
    runCase(jsonA, 'jsonA'),
    runCase(jsonB, 'jsonB'),
  ]);

  const output = {
    label: 'npv-trace-jsonA-vs-jsonB',
    hypothesis: [
      'Kontrollera royaltiesDetail.rateType/rate-skala (0.5 vs 0.005) eftersom feltolkning i procent kontra andel kan multiplicera royalties 100x.',
      'Kontrollera att vissa värden inte räknas dubbelt mellan series.operatingCostsUSD, economicsBreakdown.cogs och siteGandA_USD.',
      'Säkerställ en enda canonical beräkning av NPV/DCF som både UI-kort och snapshot-motor återanvänder (one source of truth).',
    ],
    cases: [caseA, caseB],
  };

  const dir = path.resolve('public/debug');
  await fs.mkdir(dir, { recursive: true });
  const file = `npv-trace-${Date.now()}.json`;
  const filePath = path.join(dir, file);
  await fs.writeFile(filePath, JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, filePath, url: `/debug/${file}` }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
