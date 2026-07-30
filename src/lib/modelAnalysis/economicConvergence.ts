import type { CorporateSnapshotSeries } from '../corporate/snapshot/types.ts';
import { relativeGapPct } from './convergence.ts';

export type EconomicStatus = 'Fullt beräkningsbart' | 'Delvis gapstängande' | 'Matematiskt lösbart – utanför modellintervall' | 'Kräver användarindata' | 'Ej beräkningsbart';
export type EconomicScenario = {
  id: string; name: string; status: EconomicStatus; changePct: number | null; changeLabel: string;
  dcfBefore: number; dcfAfter: number; evBefore: number; evAfter: number;
  startGapPct: number; residualGapPct: number; gapClosedPct: number;
  effects: Array<{ label: string; before: number; after: number; unit: string }>;
  missingRelation?: string; neutralRoyaltyBuybackUSD?: number; convergenceRoyaltyBuybackUSD?: number | null;
};
export type EconomicModelInput = {
  series: CorporateSnapshotSeries; discountRate: number; fx: number; shares: number; netCashTarget: number;
  referencePeriod: number; referenceMultiple?: number; dcfPerShare: number; evPerShare: number;
  hasRoyaltyRules: boolean; tolerancePct?: number;
};

type Driver = 'price' | 'opex' | 'sustaining' | 'royalty';
type Run = { dcf: number; ev: number; npvUSD: number; ebitda: number; fcff: number[]; revenue: number[]; opex: number[]; sustaining: number[]; royalty: number[] };
const n = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function taxRateAt(series: CorporateSnapshotSeries, t: number): number | null {
  const taxable = n(series.taxableIncomeUSD?.[t]);
  const tax = n(series.taxUSD[t]);
  if (taxable > 0) return tax / taxable;
  const rates = (series.effectiveTaxRate ?? []).filter((value): value is number => typeof value === 'number' && value > 0 && Number.isFinite(value));
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

/** Re-runs the existing phase-1 identities period by period; no output valuation or EBITDA is directly scaled. */
export function rerunEconomicModel(input: EconomicModelInput, driver?: Driver, factor = 1, discountRate = input.discountRate): Run | null {
  const s = input.series;
  const length = s.yearsByPeriod.length;
  if (!length || input.shares <= 0 || !Number.isInteger(input.referencePeriod) || input.referencePeriod < 0 || input.referencePeriod >= length) return null;
  const revenue: number[] = [], opex: number[] = [], sustaining: number[] = [], royalty: number[] = [], ebitda: number[] = [], fcff: number[] = [];
  for (let t = 0; t < length; t += 1) {
    revenue[t] = n(s.totalRevenue_USD[t]) * (driver === 'price' ? factor : 1);
    opex[t] = n(s.operatingCostsUSD[t]) * (driver === 'opex' ? factor : 1);
    sustaining[t] = n(s.sustainingCapexUSD[t]) * (driver === 'sustaining' ? factor : 1);
    royalty[t] = n(s.royaltiesUSD[t]) * (driver === 'royalty' ? factor : driver === 'price' && input.hasRoyaltyRules ? factor : 1);
    ebitda[t] = revenue[t] - opex[t] - sustaining[t] - n(s.siteGandA_USD[t]) - royalty[t] - n(s.reclamationUSD[t]) + n(s.byproductCreditsUSD[t]);
    const depreciation = n(s.depreciationUSD?.[t]);
    const taxable = Math.max(0, ebitda[t] - depreciation);
    const rate = taxRateAt(s, t);
    if (rate === null) return null;
    const nopat = ebitda[t] - depreciation - taxable * rate;
    fcff[t] = nopat + depreciation - n(s.capexUSD[t]) - sustaining[t] - n(s.workingCapitalDeltaUSD?.[t]);
  }
  let baseNpv = 0;
  for (let t = 0; t < s.fcffUSD.length; t += 1) baseNpv += n(s.fcffUSD[t]) / ((1 + input.discountRate) ** t);
  const npvUSD = fcff.reduce((total, value, t) => total + value / ((1 + discountRate) ** t), 0);
  const dcf = input.dcfPerShare + (npvUSD - baseNpv) * input.fx / input.shares;
  const baseEbitda = n(s.ebitdaUSD?.[input.referencePeriod]);
  const ev = input.evPerShare + (ebitda[input.referencePeriod] - baseEbitda) * input.fx * (input.referenceMultiple ?? 6) / input.shares;
  return { dcf, ev, npvUSD, ebitda: ebitda[input.referencePeriod], fcff, revenue, opex, sustaining, royalty };
}

function solve(input: EconomicModelInput, driver: Driver, normal: [number, number], mathematical: [number, number]): { factor: number; run: Run; outside: boolean } | null {
  const objective = (factor: number) => { const run = rerunEconomicModel(input, driver, factor); return run ? run.dcf - run.ev : null; };
  const samples = 800;
  let previousFactor = mathematical[0], previous = objective(previousFactor);
  if (previous === null) return null;
  for (let index = 1; index <= samples; index += 1) {
    const factor = mathematical[0] + (mathematical[1] - mathematical[0]) * index / samples;
    const value = objective(factor); if (value === null) return null;
    if (value === 0 || previous === 0 || Math.sign(value) !== Math.sign(previous)) {
      let lo = previousFactor, hi = factor;
      for (let iteration = 0; iteration < 80; iteration += 1) { const mid = (lo + hi) / 2; const m = objective(mid) as number; if (Math.sign(m) === Math.sign(objective(lo) as number)) lo = mid; else hi = mid; }
      const solvedFactor = (lo + hi) / 2; const run = rerunEconomicModel(input, driver, solvedFactor) as Run;
      return { factor: solvedFactor, run, outside: solvedFactor < normal[0] || solvedFactor > normal[1] };
    }
    previousFactor = factor; previous = value;
  }
  return null;
}

function effect(label: string, before: number, after: number, unit = 'USD') { return { label, before, after, unit }; }
function makeScenario(input: EconomicModelInput, driver: Driver, name: string, normal: [number, number], mathematical: [number, number]): EconomicScenario | null {
  const base = rerunEconomicModel(input); if (!base) return null;
  const solved = solve(input, driver, normal, mathematical);
  const startGap = relativeGapPct(base.dcf, base.ev);
  if (!solved) {
    const candidates = normal.map((factor) => ({ factor, run: rerunEconomicModel(input, driver, factor) as Run })).sort((a, b) => relativeGapPct(a.run.dcf, a.run.ev) - relativeGapPct(b.run.dcf, b.run.ev));
    const best = candidates[0]; const residual = relativeGapPct(best.run.dcf, best.run.ev);
    if (residual >= startGap) return null;
    return scenarioFrom(input, driver, name, base, best.run, best.factor, 'Delvis gapstängande');
  }
  return scenarioFrom(input, driver, name, base, solved.run, solved.factor, solved.outside ? 'Matematiskt lösbart – utanför modellintervall' : 'Fullt beräkningsbart');
}
function scenarioFrom(input: EconomicModelInput, driver: Driver, name: string, base: Run, run: Run, factor: number, status: EconomicStatus): EconomicScenario {
  const start = relativeGapPct(base.dcf, base.ev), residual = relativeGapPct(run.dcf, run.ev);
  const effects = [effect('EBITDA (referensperiod)', base.ebitda, run.ebitda), effect('FCFF över LOM', sum(base.fcff), sum(run.fcff))];
  if (driver === 'price') effects.unshift(effect('Metallintäkter över LOM', sum(base.revenue), sum(run.revenue)));
  if (driver === 'price') Object.entries(input.series.priceUsedByMetal_USD).sort(([a], [b]) => a.localeCompare(b)).forEach(([metal, values]) => {
    const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (finite.length) effects.unshift(effect(`Genomsnittspris ${metal}`, sum(finite) / finite.length, sum(finite) / finite.length * factor, 'USD'));
  });
  if (driver === 'opex') effects.unshift(effect('Operating costs över LOM', sum(base.opex), sum(run.opex)));
  if (driver === 'sustaining') effects.unshift(effect('Sustaining CAPEX över LOM', sum(base.sustaining), sum(run.sustaining)));
  if (driver === 'royalty') effects.unshift(effect('Royalty över LOM', sum(base.royalty), sum(run.royalty)));
  const result: EconomicScenario = { id: driver, name, status, changePct: (factor - 1) * 100, changeLabel: `${(factor - 1) * 100 >= 0 ? '+' : ''}${((factor - 1) * 100).toFixed(2)} %`, dcfBefore: base.dcf, dcfAfter: run.dcf, evBefore: base.ev, evAfter: run.ev, startGapPct: start, residualGapPct: residual, gapClosedPct: start === 0 ? 100 : Math.max(0, (start - residual) / start * 100), effects };
  if (driver === 'royalty') {
    const removedAfterTax = base.fcff.map((value, t) => run.fcff[t] - value);
    result.neutralRoyaltyBuybackUSD = removedAfterTax.reduce((total, value, t) => total + value / ((1 + input.discountRate) ** t), 0);
    result.convergenceRoyaltyBuybackUSD = Math.max(0, result.neutralRoyaltyBuybackUSD - Math.abs(run.dcf - run.ev) * input.shares / input.fx);
  }
  return result;
}

export function buildEconomicConvergence(input: EconomicModelInput): EconomicScenario[] {
  const scenarios: EconomicScenario[] = [];
  const royaltyTotal = sum(input.series.royaltiesUSD.map(n));
  if (Object.keys(input.series.priceUsedByMetal_USD).length && (royaltyTotal === 0 || input.hasRoyaltyRules)) { const value = makeScenario(input, 'price', 'Metallprispaket', [0.75, 1.25], [0.05, 4]); if (value) scenarios.push(value); }
  const opex = makeScenario(input, 'opex', 'Operating-cost-paket', [0.75, 1.25], [0, 4]); if (opex && sum(input.series.operatingCostsUSD.map(n)) > 0) scenarios.push(opex);
  const sustaining = makeScenario(input, 'sustaining', 'Sustaining-CAPEX-paket', [0.5, 1.5], [0, 5]); if (sustaining && sum(input.series.sustainingCapexUSD.map(n)) > 0) scenarios.push(sustaining);
  if (input.hasRoyaltyRules && royaltyTotal > 0) { const royalty = makeScenario(input, 'royalty', 'Royaltyreduktion', [0, 1], [0, 1]); if (royalty) scenarios.push(royalty); }
  const rank: Record<EconomicStatus, number> = { 'Fullt beräkningsbart': 0, 'Delvis gapstängande': 1, 'Matematiskt lösbart – utanför modellintervall': 2, 'Kräver användarindata': 3, 'Ej beräkningsbart': 4 };
  return scenarios.sort((a, b) => rank[a.status] - rank[b.status] || a.id.localeCompare(b.id));
}

export function solveDiscountRate(input: EconomicModelInput, normal: [number, number] = [0, .30], mathematical: [number, number] = [-.95, 2]): EconomicScenario | null {
  const base = rerunEconomicModel(input); if (!base) return null;
  const target = input.evPerShare;
  let lo = mathematical[0], hi = mathematical[1];
  const value = (rate: number) => (rerunEconomicModel(input, undefined, 1, rate)?.dcf ?? NaN) - target;
  if (Math.sign(value(lo)) === Math.sign(value(hi))) return null;
  for (let i = 0; i < 100; i += 1) { const mid = (lo + hi) / 2; if (Math.sign(value(mid)) === Math.sign(value(lo))) lo = mid; else hi = mid; }
  const rate = (lo + hi) / 2, run = rerunEconomicModel(input, undefined, 1, rate) as Run;
  const scenario = scenarioFrom(input, 'price', 'Diskonteringsräntepaket', base, run, 1 + rate - input.discountRate, rate < normal[0] || rate > normal[1] ? 'Matematiskt lösbart – utanför modellintervall' : 'Fullt beräkningsbart');
  scenario.changePct = (rate - input.discountRate) * 100;
  scenario.changeLabel = `${(rate * 100).toFixed(2)} % (modellintervall ${(normal[0] * 100).toFixed(0)}–${(normal[1] * 100).toFixed(0)} %)`;
  scenario.effects = [effect('FCFF över LOM', sum(base.fcff), sum(run.fcff))];
  return scenario;
}

export type ThroughputAcceleration = { payableQtyByMetal: Record<string, number[]>; operatingCostsUSD: number[]; sustainingCapexUSD: number[]; reclamationUSD: number[]; workingCapitalDeltaUSD: number[]; newLastPeriod: number };

/** Compresses complete annual production buckets; it deliberately refuses fractional bucket splitting. */
export function accelerateThroughput(series: CorporateSnapshotSeries, productionStartPeriod: number, factor: number): ThroughputAcceleration | null {
  if (!Number.isInteger(factor) || factor < 2 || !Number.isInteger(productionStartPeriod)) return null;
  const metals = Object.entries(series.payableQtyByMetal);
  if (!metals.length || metals.some(([, values]) => values.some((value) => value === null))) return null;
  const productionPeriods = series.oreMilledTonnes.map((value, t) => t >= productionStartPeriod && n(value) > 0 ? t : -1).filter((t) => t >= 0);
  if (!productionPeriods.length) return null;
  const last = productionStartPeriod + Math.ceil(productionPeriods.length / factor) - 1;
  const length = series.yearsByPeriod.length;
  const compress = (values: Array<number | null>) => {
    const output = new Array<number>(length).fill(0);
    productionPeriods.forEach((source, index) => { output[productionStartPeriod + Math.floor(index / factor)] += n(values[source]); });
    return output;
  };
  const reclamation = new Array<number>(length).fill(0), wc = new Array<number>(length).fill(0);
  reclamation[last] = sum(series.reclamationUSD.map(n));
  wc[last] = sum((series.workingCapitalDeltaUSD ?? []).map(n));
  return { payableQtyByMetal: Object.fromEntries(metals.map(([metal, values]) => [metal, compress(values)])), operatingCostsUSD: compress(series.operatingCostsUSD), sustainingCapexUSD: compress(series.sustainingCapexUSD), reclamationUSD: reclamation, workingCapitalDeltaUSD: wc, newLastPeriod: last };
}
