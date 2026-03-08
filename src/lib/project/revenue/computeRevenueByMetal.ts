import { applyStreamsMVI } from '../streams/applyStreamsMvi.ts';
import type { StreamMVIConfig } from '../streams/types.ts';

export type ComputeRevenueByMetalUSDArgs = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  priceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal?: Record<string, StreamMVIConfig> | null;
};

export type ComputeRevenueByMetalUSDResult = {
  revenueByMetalUSD: Record<string, (number | null)[]>;
  grossRevenueUSD: (number | null)[];
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamCostToProjectUSDByMetal: Record<string, (number | null)[]>;
  diagnostics: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function summarizePeriods(periods: number[], limit: number): string {
  if (periods.length === 0) {
    return 'none';
  }
  const head = periods.slice(0, limit).join(',');
  return periods.length > limit ? `${head},...` : head;
}

export function computeRevenueByMetalUSD(args: ComputeRevenueByMetalUSDArgs): ComputeRevenueByMetalUSDResult {
  const expectedLength = args.masterN + 1;
  const diagnostics: string[] = [];
  const revenueByMetalUSD: Record<string, (number | null)[]> = {};
  const deliveredQtyByMetal: Record<string, (number | null)[]> = {};
  const streamCostToProjectUSDByMetal: Record<string, (number | null)[]> = {};

  const qtyMetals = Object.keys(args.payableQtyByMetal);
  const priceMetals = new Set(Object.keys(args.priceUSDByMetal));
  const metals = qtyMetals.filter((metal) => priceMetals.has(metal));

  for (const metal of qtyMetals) {
    if (!(metal in args.priceUSDByMetal)) {
      diagnostics.push(`revenueByMetal: missing price series for metal=${metal}`);
    }
  }
  for (const metal of Object.keys(args.priceUSDByMetal)) {
    if (!(metal in args.payableQtyByMetal)) {
      diagnostics.push(`revenueByMetal: missing payable quantity series for metal=${metal}`);
    }
  }

  for (const metal of metals) {
    revenueByMetalUSD[metal] = new Array<number | null>(expectedLength).fill(null);
  }

  if (metals.length === 0) {
    diagnostics.push('revenueByMetal: no overlapping metals in payableQtyByMetal and priceUSDByMetal');
    return {
      revenueByMetalUSD,
      grossRevenueUSD: new Array<number | null>(expectedLength).fill(null),
      deliveredQtyByMetal,
      streamCostToProjectUSDByMetal,
      diagnostics,
    };
  }

  const streamsApplied = applyStreamsMVI({
    masterN: args.masterN,
    payableQtyByMetal: args.payableQtyByMetal,
    spotPriceUSDByMetal: args.priceUSDByMetal,
    streamsByMetal: args.streamsByMetal,
  });
  diagnostics.push(...streamsApplied.diagnostics);

  for (const metal of metals) {
    const qtySeries = args.payableQtyByMetal[metal];
    const effectiveQtySeries = streamsApplied.effectivePayableQtyByMetal[metal] ?? [];
    const deliveredQtySeries = streamsApplied.deliveredQtyByMetal[metal] ?? [];
    const purchasePriceSeries = streamsApplied.streamPurchasePriceUSDByMetal[metal] ?? [];
    const priceSeries = args.priceUSDByMetal[metal];

    deliveredQtyByMetal[metal] = [...deliveredQtySeries];
    streamCostToProjectUSDByMetal[metal] = [...(streamsApplied.streamCostToProjectUSDByMetal[metal] ?? [])];

    if (qtySeries.length !== expectedLength) {
      diagnostics.push(`revenueByMetal: payableQtyByMetal[${metal}] length=${qtySeries.length} expected=${expectedLength}`);
    }
    if (priceSeries.length !== expectedLength) {
      diagnostics.push(`revenueByMetal: priceUSDByMetal[${metal}] length=${priceSeries.length} expected=${expectedLength}`);
    }

    const nullPeriods: number[] = [];
    for (let t = 0; t < expectedLength; t += 1) {
      const qty = effectiveQtySeries[t];
      const deliveredQty = deliveredQtySeries[t];
      const purchasePrice = purchasePriceSeries[t];
      const price = priceSeries[t];

      if (!isFiniteNumber(qty) || !isFiniteNumber(price)) {
        revenueByMetalUSD[metal][t] = null;
        nullPeriods.push(t);
        continue;
      }

      if (qty < 0 || price < 0) {
        revenueByMetalUSD[metal][t] = null;
        diagnostics.push(`revenueByMetal: metal=${metal} t=${t} negativeInput qty=${qty} price=${price}`);
        nullPeriods.push(t);
        continue;
      }

      const streamCash = isFiniteNumber(deliveredQty) && isFiniteNumber(purchasePrice)
        ? deliveredQty * purchasePrice
        : 0;

      revenueByMetalUSD[metal][t] = (qty * price) + streamCash;
    }

    if (nullPeriods.length > 0) {
      diagnostics.push(`revenueByMetal: metal=${metal} nullPeriods=[${summarizePeriods(nullPeriods, 5)}]`);
    }
  }

  const metalHasStartedByPeriod: Record<string, boolean[]> = {};
  for (const metal of metals) {
    let started = false;
    metalHasStartedByPeriod[metal] = new Array<boolean>(expectedLength).fill(false);
    for (let t = 0; t < expectedLength; t += 1) {
      const qty = args.payableQtyByMetal[metal]?.[t] ?? null;
      if (isFiniteNumber(qty) && qty > 0) started = true;
      metalHasStartedByPeriod[metal][t] = started;
    }
  }

  const grossRevenueUSD = new Array<number | null>(expectedLength).fill(null);
  for (let t = 0; t < expectedLength; t += 1) {
    let total = 0;
    let hasFiniteRevenue = false;
    let hasHardMissingInput = false;
    for (const metal of metals) {
      const revenue = revenueByMetalUSD[metal][t];
      if (isFiniteNumber(revenue)) {
        hasFiniteRevenue = true;
        total += revenue;
        continue;
      }

      const qty = args.payableQtyByMetal[metal]?.[t] ?? null;
      const price = args.priceUSDByMetal[metal]?.[t] ?? null;
      const qtyIsZero = isFiniteNumber(qty) && qty === 0;
      const qtyIsPreStartNull = qty === null && metalHasStartedByPeriod[metal]?.[t] === false;

      if (qtyIsPreStartNull || qtyIsZero) {
        continue;
      }

      if (!isFiniteNumber(price)) {
        hasHardMissingInput = true;
        diagnostics.push(`grossRevenue: t=${t} metal=${metal} missing price for finite payable quantity`);
        break;
      }

      hasHardMissingInput = true;
      diagnostics.push(`grossRevenue: t=${t} metal=${metal} missing payable quantity for finite price`);
      break;
    }

    if (hasHardMissingInput) {
      grossRevenueUSD[t] = null;
      continue;
    }

    grossRevenueUSD[t] = hasFiniteRevenue ? total : 0;
  }

  return {
    revenueByMetalUSD,
    grossRevenueUSD,
    deliveredQtyByMetal,
    streamCostToProjectUSDByMetal,
    diagnostics,
  };
}
