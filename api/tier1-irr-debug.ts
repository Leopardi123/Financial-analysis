import { loadProjectsForSymbol } from '../src/lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../src/lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../src/lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../src/lib/project/engineFullProductionV1.ts';
import { computeIrr } from '../src/lib/metrics/lista3.ts';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function aggregateByCalendarYear(projects: Array<{ years: number[]; fcff: Array<number | null> }>) {
  if (projects.length === 0) return null;
  const allYears = projects.flatMap((project) => project.years);
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  const byYear = new Map<number, number>();
  for (const project of projects) {
    for (let t = 0; t < project.years.length; t += 1) {
      const value = project.fcff[t];
      if (!finite(value)) return null;
      const year = project.years[t];
      byYear.set(year, (byYear.get(year) ?? 0) + value);
    }
  }
  return { years, fcff: years.map((year) => byYear.get(year) ?? 0) };
}

function summarizeIrr(fcff: Array<number | null>) {
  const result = computeIrr(fcff, 0.10);
  const finiteCashflows = fcff.filter((value): value is number => finite(value));
  return {
    selectedRoot: result.selectedRoot,
    roots: result.roots,
    signChangeCount: result.signChangeCount,
    reason: result.reason,
    selectionReason: result.selectionReason,
    residual: result.residual,
    minFcff: finiteCashflows.length ? Math.min(...finiteCashflows) : null,
    maxFcff: finiteCashflows.length ? Math.max(...finiteCashflows) : null,
    negativePeriods: finiteCashflows.filter((value) => value < 0).length,
    positivePeriods: finiteCashflows.filter((value) => value > 0).length,
    zeroPeriods: finiteCashflows.filter((value) => value === 0).length,
  };
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const symbol = String(req.query?.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'symbol is required' });
    return;
  }

  try {
    const loaded = await loadProjectsForSymbol(symbol);
    const projects: Array<{ projectId: string; years: number[]; fcff: Array<number | null>; irr: ReturnType<typeof summarizeIrr> }> = [];
    for (const project of loaded) {
      const parsed = parseProjectJsonV1(project.rawJson);
      const input = await resolveProjectPricesToEngineInput({
        parsed,
        scenario: { mode: 'spot' },
        allowRefresh: true,
        projectId: project.projectId,
      });
      const output = computeProjectEngineFullProductionV1(input);
      projects.push({
        projectId: project.projectId,
        years: parsed.engineInputWithoutPrices.yearsByPeriod,
        fcff: output.phase1.fcffUSD,
        irr: summarizeIrr(output.phase1.fcffUSD),
      });
    }

    const aggregate = aggregateByCalendarYear(projects);
    res.status(200).json({
      ok: true,
      symbol,
      projects: projects.map(({ projectId, years, fcff, irr }) => ({ projectId, firstYear: years[0], lastYear: years[years.length - 1], irr, fcff })),
      aggregate: aggregate ? { years: aggregate.years, fcff: aggregate.fcff, irr: summarizeIrr(aggregate.fcff) } : null,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
