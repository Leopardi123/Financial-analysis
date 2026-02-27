import type { StreamMVIConfig } from './types.ts';

type ApplyStreamsMVIArgs = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  spotPriceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal: Record<string, StreamMVIConfig> | null | undefined;
};

type ApplyStreamsMVIResult = {
  effectivePayableQtyByMetal: Record<string, (number | null)[]>;
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamPurchasePriceUSDByMetal: Record<string, (number | null)[]>;
  streamCostToProjectUSDByMetal: Record<string, (number | null)[]>;
  diagnostics: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePurchaseRule(config: StreamMVIConfig):
  | { kind: 'FIXED_USD_PER_UNIT'; fixedUSDPerUnit: number }
  | { kind: 'PCT_OF_SPOT'; pctOfSpot: number }
  | null {
  if (config.purchasePrice?.kind === 'FIXED_USD_PER_UNIT') {
    return { kind: 'FIXED_USD_PER_UNIT', fixedUSDPerUnit: config.purchasePrice.value };
  }
  if (config.purchasePrice?.kind === 'PCT_OF_SPOT') {
    return { kind: 'PCT_OF_SPOT', pctOfSpot: config.purchasePrice.value };
  }

  if (config.purchasePriceRule === 'FIXED_USD_PER_UNIT') {
    return { kind: 'FIXED_USD_PER_UNIT', fixedUSDPerUnit: config.fixedPriceUSDPerUnit as number };
  }
  if (config.purchasePriceRule === 'PCT_OF_SPOT') {
    return { kind: 'PCT_OF_SPOT', pctOfSpot: config.pctOfSpot as number };
  }

  return null;
}

export function applyStreamsMVI(args: ApplyStreamsMVIArgs): ApplyStreamsMVIResult {
  const expectedLength = args.masterN + 1;
  const diagnostics: string[] = [];
  const streams = args.streamsByMetal ?? {};

  const effectivePayableQtyByMetal: Record<string, (number | null)[]> = {};
  const deliveredQtyByMetal: Record<string, (number | null)[]> = {};
  const streamPurchasePriceUSDByMetal: Record<string, (number | null)[]> = {};
  const streamCostToProjectUSDByMetal: Record<string, (number | null)[]> = {};

  for (const metal of Object.keys(args.payableQtyByMetal)) {
    const payableSeries = args.payableQtyByMetal[metal];
    const spotSeries = args.spotPriceUSDByMetal[metal] ?? [];
    const cfg = streams[metal];

    effectivePayableQtyByMetal[metal] = new Array<number | null>(expectedLength).fill(null);
    deliveredQtyByMetal[metal] = new Array<number | null>(expectedLength).fill(0);
    streamPurchasePriceUSDByMetal[metal] = new Array<number | null>(expectedLength).fill(null);
    streamCostToProjectUSDByMetal[metal] = new Array<number | null>(expectedLength).fill(0);

    if (!cfg) {
      for (let t = 0; t < expectedLength; t += 1) {
        effectivePayableQtyByMetal[metal][t] = payableSeries[t] ?? null;
      }
      continue;
    }

    if (!isFiniteNumber(cfg.streamPctOfPayable) || cfg.streamPctOfPayable < 0 || cfg.streamPctOfPayable > 1) {
      diagnostics.push(`stream metal=${metal}: ignored invalid streamPctOfPayable=${String(cfg.streamPctOfPayable)}`);
      for (let t = 0; t < expectedLength; t += 1) {
        effectivePayableQtyByMetal[metal][t] = payableSeries[t] ?? null;
      }
      continue;
    }

    const rule = parsePurchaseRule(cfg);
    if (!rule) {
      diagnostics.push(`stream metal=${metal}: ignored missing purchasePriceRule`);
      for (let t = 0; t < expectedLength; t += 1) {
        effectivePayableQtyByMetal[metal][t] = payableSeries[t] ?? null;
      }
      continue;
    }

    if (rule.kind === 'FIXED_USD_PER_UNIT' && (!isFiniteNumber(rule.fixedUSDPerUnit) || rule.fixedUSDPerUnit < 0)) {
      diagnostics.push(`stream metal=${metal}: ignored invalid fixedUSDPerUnit=${String(rule.fixedUSDPerUnit)}`);
      for (let t = 0; t < expectedLength; t += 1) {
        effectivePayableQtyByMetal[metal][t] = payableSeries[t] ?? null;
      }
      continue;
    }

    if (rule.kind === 'PCT_OF_SPOT' && (!isFiniteNumber(rule.pctOfSpot) || rule.pctOfSpot < 0 || rule.pctOfSpot > 1)) {
      diagnostics.push(`stream metal=${metal}: ignored invalid pctOfSpot=${String(rule.pctOfSpot)}`);
      for (let t = 0; t < expectedLength; t += 1) {
        effectivePayableQtyByMetal[metal][t] = payableSeries[t] ?? null;
      }
      continue;
    }

    diagnostics.push(
      rule.kind === 'FIXED_USD_PER_UNIT'
        ? `stream metal=${metal} pct=${cfg.streamPctOfPayable.toFixed(2)} rule=${rule.kind} fixed=${rule.fixedUSDPerUnit}`
        : `stream metal=${metal} pct=${cfg.streamPctOfPayable.toFixed(2)} rule=${rule.kind} pctOfSpot=${rule.pctOfSpot}`,
    );

    let emittedBeneficialDiagnostic = false;
    for (let t = 0; t < expectedLength; t += 1) {
      const payable = payableSeries[t];
      const spot = spotSeries[t];

      if (!isFiniteNumber(payable) || payable < 0) {
        deliveredQtyByMetal[metal][t] = null;
        effectivePayableQtyByMetal[metal][t] = null;
        streamPurchasePriceUSDByMetal[metal][t] = null;
        streamCostToProjectUSDByMetal[metal][t] = null;
        continue;
      }

      const deliveredQty = payable * cfg.streamPctOfPayable;
      deliveredQtyByMetal[metal][t] = deliveredQty;
      effectivePayableQtyByMetal[metal][t] = payable - deliveredQty;

      const purchasePriceUSD = rule.kind === 'FIXED_USD_PER_UNIT'
        ? rule.fixedUSDPerUnit
        : isFiniteNumber(spot)
          ? spot * rule.pctOfSpot
          : null;

      streamPurchasePriceUSDByMetal[metal][t] = purchasePriceUSD;

      if (!isFiniteNumber(spot) || spot < 0 || !isFiniteNumber(purchasePriceUSD)) {
        streamCostToProjectUSDByMetal[metal][t] = null;
        continue;
      }

      const delta = spot - purchasePriceUSD;
      if (delta < 0 && !emittedBeneficialDiagnostic) {
        diagnostics.push(`stream metal=${metal}: purchasePrice exceeds spot in at least one period`);
        emittedBeneficialDiagnostic = true;
      }

      streamCostToProjectUSDByMetal[metal][t] = delta * deliveredQty;
    }
  }

  return {
    effectivePayableQtyByMetal,
    deliveredQtyByMetal,
    streamPurchasePriceUSDByMetal,
    streamCostToProjectUSDByMetal,
    diagnostics,
  };
}
