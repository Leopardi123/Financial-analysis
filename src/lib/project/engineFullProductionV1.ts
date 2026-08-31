import { computeProjectAisc } from './aisc/engine.ts';
import { computeFiscalTake } from './fiscal/engine.ts';
import type { FiscalLedgerLine } from './fiscal/types.ts';
import { computeNationalTake } from './nationalTake/engine.ts';
import { computeProjectPhase2 } from './phase2.ts';
import { computeProjectRevenue } from './revenue/engine.ts';
import { applyStreamsByMetal } from './streams/applyByMetal.ts';
import type { ProjectEngineFullProductionV1Input, ProjectEngineFullProductionV1Output } from './types.ts';

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function zeroSeries(length: number): number[] { return new Array(length).fill(0); }
function sumSeriesStrict(seriesList: Array<Array<number | null>>, length: number): Array<number | null> {
  if (seriesList.length === 0) return zeroSeries(length);
  return Array.from({ length }, (_, t) => {
    let total = 0;
    for (const series of seriesList) { const value = series[t]; if (!finite(value)) return null; total += value; }
    return total;
  });
}
function addSeries(left: Array<number | null> | null | undefined, right: Array<number | null> | null | undefined, length: number): Array<number | null> {
  const a = left ?? zeroSeries(length); const b = right ?? zeroSeries(length);
  if (a.length !== length || b.length !== length) throw new Error('Series length must equal masterN+1.');
  return Array.from({ length }, (_, t) => finite(a[t]) && finite(b[t]) ? (a[t] as number) + (b[t] as number) : null);
}
function subtractSeries(left: Array<number | null>, right: Array<number | null>, length: number): Array<number | null> {
  if (left.length !== length || right.length !== length) throw new Error('Series length must equal masterN+1.');
  return Array.from({ length }, (_, t) => finite(left[t]) && finite(right[t]) ? (left[t] as number) - (right[t] as number) : null);
}
function deriveRevenueQtyByMetal(
  payableQtyByMetal: Record<string, Array<number | null>>,
  factors: Record<string, Array<number | null>> | null | undefined,
  masterN: number,
): Record<string, Array<number | null>> {
  const length = masterN + 1;
  const out: Record<string, Array<number | null>> = {};
  for (const [metal, payable] of Object.entries(payableQtyByMetal)) {
    if (payable.length !== length) throw new Error(`payableQtyByMetal[${metal}] length must equal masterN+1.`);
    const factor = factors?.[metal];
    if (!factor) { out[metal] = [...payable]; continue; }
    if (factor.length !== length) throw new Error(`payabilityFactorByMetal[${metal}] length must equal masterN+1.`);
    out[metal] = Array.from({ length }, (_, t) => {
      const q = payable[t]; const f = factor[t];
      if (!finite(q) || !finite(f)) return null;
      if (q < 0 || f < 0 || f > 1 + 1e-9) throw new Error(`Invalid payable/payability input for ${metal} at t=${t}.`);
      if (f === 0) {
        throw new Error(`Cannot reconstruct gross commercial quantity from zero payability factor for ${metal} at t=${t}; preserve a representable source-backed commercial basis or leave unverified.`);
      }
      return q / Math.min(1, f);
    });
  }
  return out;
}
function grossRevenueByMetal(qtyByMetal: Record<string, Array<number | null>>, priceByMetal: Record<string, Array<number | null>>, masterN: number): Record<string, Array<number | null>> {
  const length = masterN + 1; const out: Record<string, Array<number | null>> = {};
  for (const [metal, qty] of Object.entries(qtyByMetal)) {
    const price = priceByMetal[metal];
    if (!price) throw new Error(`Missing price series for metal ${metal}.`);
    if (qty.length !== length || price.length !== length) throw new Error(`Quantity/price series for ${metal} must equal masterN+1.`);
    out[metal] = Array.from({ length }, (_, t) => {
      const q = qty[t]; const p = price[t];
      if (!finite(q) || !finite(p)) return null;
      if (q < 0 || p < 0) throw new Error(`Negative quantity/price for ${metal} at t=${t}.`);
      return q * p;
    });
  }
  return out;
}
function payabilityDeductions(grossByMetalUSD: Record<string, Array<number | null>>, factors: Record<string, Array<number | null>> | null | undefined, length: number): Record<string, Array<number | null>> {
  const out: Record<string, Array<number | null>> = {};
  for (const [metal, gross] of Object.entries(grossByMetalUSD)) {
    const factor = factors?.[metal];
    if (!factor) { out[metal] = zeroSeries(length); continue; }
    if (factor.length !== length) throw new Error(`payabilityFactorByMetal[${metal}] length must equal masterN+1.`);
    out[metal] = Array.from({ length }, (_, t) => {
      if (!finite(gross[t]) || !finite(factor[t])) return null;
      const f = factor[t] as number;
      if (f < 0 || f > 1 + 1e-9) throw new Error(`payabilityFactorByMetal[${metal}][${t}] must be within [0,1].`);
      return (gross[t] as number) * (1 - Math.min(1, f));
    });
  }
  return out;
}
function buildFiscalLedger(args: { input: ProjectEngineFullProductionV1Input; grossMetalValueUSD: Array<number | null>; revenueAfterStreamUSD: Array<number | null>; payabilityDeductionUSD: Array<number | null>; baseSellingCostsUSD: Array<number | null>; streamTakeUSD: Array<number | null> }): Partial<Record<FiscalLedgerLine, Array<number | null>>> {
  const { input, grossMetalValueUSD, revenueAfterStreamUSD, payabilityDeductionUSD, baseSellingCostsUSD, streamTakeUSD } = args;
  const length = input.masterN + 1; const supplied = input.phase1.fiscalLedgerUSD ?? {};
  const op = input.phase1.operatingCostsUSD; const ga = input.phase1.siteGandA_USD; const sustaining = input.phase1.sustainingCapexUSD; const reclamation = input.phase1.reclamationUSD;
  const dep = input.phase1.depreciationUSD ?? zeroSeries(length); const bp = input.phase1.byproductCreditsUSD ?? zeroSeries(length);
  const revenueAfterPayability = subtractSeries(grossMetalValueUSD, payabilityDeductionUSD, length);
  const netSmelterReturn = subtractSeries(subtractSeries(revenueAfterPayability, streamTakeUSD, length), baseSellingCostsUSD, length);
  const ebitdaBeforeFiscal = Array.from({ length }, (_, t) => {
    const values = [revenueAfterStreamUSD[t], payabilityDeductionUSD[t], op[t], baseSellingCostsUSD[t], ga[t], reclamation[t], bp[t]];
    if (!values.every(finite)) return null;
    return (values[0] as number) - (values[1] as number) - (values[2] as number) - (values[3] as number) - (values[4] as number) - (values[5] as number) + (values[6] as number);
  });
  const ebitBeforeFiscal = Array.from({ length }, (_, t) => {
    const values = [ebitdaBeforeFiscal[t], sustaining[t], dep[t]];
    if (!values.every(finite)) return null;
    return (values[0] as number) - (values[1] as number) - (values[2] as number);
  });
  return {
    ...supplied,
    GROSS_METAL_VALUE: grossMetalValueUSD,
    PAYABILITY_DEDUCTION: payabilityDeductionUSD,
    REVENUE_AFTER_PAYABILITY: revenueAfterPayability,
    STREAM_TAKE: streamTakeUSD,
    OFFSITE_TOTAL: baseSellingCostsUSD,
    NET_SMELTER_RETURN: netSmelterReturn,
    SITE_OPEX_TOTAL: op,
    SITE_GA: ga,
    EBITDA_BEFORE_FISCAL: ebitdaBeforeFiscal,
    DEPRECIATION: dep,
    EBIT_BEFORE_FISCAL: ebitBeforeFiscal,
    INITIAL_CAPEX: input.phase1.capexUSD,
    SUSTAINING_CAPEX: sustaining,
    RECLAMATION: reclamation,
  };
}

export function computeProjectEngineFullProductionV1(input: ProjectEngineFullProductionV1Input): ProjectEngineFullProductionV1Output {
  if (input.phase1.masterN !== input.masterN) throw new Error('phase1.masterN must match masterN');
  if (input.aisc.auPriceUSDPerOz.length !== input.masterN + 1) throw new Error('aisc.auPriceUSDPerOz length must equal masterN+1');
  const length = input.masterN + 1;
  const revenueQtyByMetal = deriveRevenueQtyByMetal(input.payableQtyByMetal, input.phase1.payabilityFactorByMetal, input.masterN);
  const hasNonPayableRevenueBasis = Object.values(input.phase1.payabilityFactorByMetal ?? {}).some((series) => series.some((value) => finite(value) && Math.abs((value as number) - 1) > 1e-12));
  const hasStreams = Boolean(input.streamsByMetal && Object.keys(input.streamsByMetal).length > 0);
  if (hasStreams && hasNonPayableRevenueBasis) throw new Error('Streams with non-payable revenue basis are ambiguous and must fail closed.');

  const streamsOut = hasStreams ? applyStreamsByMetal({ masterN: input.masterN, payableQtyByMetal: input.payableQtyByMetal, spotPriceUSDByMetal: input.spotPriceUSDByMetal, streamsByMetal: input.streamsByMetal ?? {} }) : null;
  const grossPreStreamByMetal = grossRevenueByMetal(revenueQtyByMetal, input.spotPriceUSDByMetal, input.masterN);
  const grossPreStreamUSD = sumSeriesStrict(Object.values(grossPreStreamByMetal), length);
  const payabilityDeductionUSDByMetal = payabilityDeductions(grossPreStreamByMetal, input.phase1.payabilityFactorByMetal, length);
  const payabilityDeductionUSDTotal = sumSeriesStrict(Object.values(payabilityDeductionUSDByMetal), length);
  const revenueOut = computeProjectRevenue({ masterN: input.masterN, payableQtyByMetal: revenueQtyByMetal, priceUSDByMetal: input.spotPriceUSDByMetal, streamsByMetal: input.streamsByMetal });

  const baseSellingCostsUSD = input.phase1.sellingCostsUSD ?? zeroSeries(length);
  const sellingAfterPayability = addSeries(baseSellingCostsUSD, payabilityDeductionUSDTotal, length);
  const streamTakeUSD = subtractSeries(grossPreStreamUSD, revenueOut.grossRevenueUSD, length);
  const fiscalRules = input.phase1.fiscalTakeRules ?? [];
  const fiscalTake = fiscalRules.length > 0 ? computeFiscalTake({
    masterN: input.masterN,
    rules: fiscalRules,
    ledgerUSD: buildFiscalLedger({ input, grossMetalValueUSD: grossPreStreamUSD, revenueAfterStreamUSD: revenueOut.grossRevenueUSD, payabilityDeductionUSD: payabilityDeductionUSDTotal, baseSellingCostsUSD, streamTakeUSD }),
    priceSeriesByKey: input.priceSeriesByKey ?? null,
  }) : null;

  const phase1ForTake = {
    ...input.phase1,
    sellingCostsUSD: addSeries(sellingAfterPayability, fiscalTake?.revenueDeductionUSD, length),
    preTaxChargesUSD: addSeries(input.phase1.preTaxChargesUSD, fiscalTake?.preTaxChargeUSD, length),
    postTaxChargesUSD: addSeries(input.phase1.postTaxChargesUSD, fiscalTake?.postTaxChargeUSD, length),
  };
  const nationalTakeOut = computeNationalTake({
    masterN: input.masterN,
    grossRevenueUSD: revenueOut.grossRevenueUSD,
    byMetalRevenueUSD: revenueOut.byMetalRevenueUSD,
    spotPriceUSDByMetal: input.spotPriceUSDByMetal,
    priceSeriesByKey: input.priceSeriesByKey ?? null,
    priceKeyByMetal: input.priceKeyByMetal ?? null,
    auPriceKey: input.auPriceKey ?? null,
    items: input.takeItems,
    royaltiesDetail: input.royaltiesDetail,
    phase1: phase1ForTake,
    extraRoyaltiesUSD: fiscalTake?.operatingExpenseUSD ?? zeroSeries(length),
  });
  const phase2Out = computeProjectPhase2({ masterN: input.masterN, productionStartPeriod: input.phase1.productionStartPeriod, discountRate: input.phase2.discountRate, fcffUSD: nationalTakeOut.phase1.fcffUSD });
  const aiscOut = computeProjectAisc({ masterN: input.masterN, productionStartPeriod: input.phase1.productionStartPeriod, grossRevenueUSD: revenueOut.grossRevenueUSD, auPriceUSDPerOz: input.aisc.auPriceUSDPerOz, sustainingCostUSD: nationalTakeOut.phase1.sustainingCostUSD });
  return {
    streams: streamsOut,
    revenue: revenueOut,
    nationalTake: nationalTakeOut,
    fiscalTake,
    payabilityDeductionUSDByMetal,
    payabilityDeductionUSDTotal,
    totalTakeUSD: nationalTakeOut.totalTakeUSD,
    itemTakeUSDById: nationalTakeOut.itemTakeUSDById,
    phase1: nationalTakeOut.phase1,
    phase2: phase2Out,
    aisc: aiscOut,
    capexUSD_used: input.phase1.capexUSD,
  };
}
