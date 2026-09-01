import type { StreamMVIInput, StreamMVIOutput, StreamPurchasePriceRule } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toValidPeriodIndex(value: number | null | undefined, name: string, masterN: number): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer when provided`);
  if (value < 0 || value > masterN) throw new Error(`${name} must be within 0..masterN`);
  return value;
}

function resolvePurchaseRule(config: StreamMVIInput['config']): StreamPurchasePriceRule {
  if (config.purchasePrice) return config.purchasePrice;
  if (config.purchasePriceRule === 'FIXED_USD_PER_UNIT') {
    return { kind: 'FIXED_USD_PER_UNIT', value: config.fixedPriceUSDPerUnit as number };
  }
  if (config.purchasePriceRule === 'PCT_OF_SPOT') {
    return { kind: 'PCT_OF_SPOT', value: config.pctOfSpot as number };
  }
  throw new Error('purchase price configuration is required');
}

function validatePurchaseRule(rule: StreamPurchasePriceRule): void {
  if (rule.kind === 'FIXED_USD_PER_UNIT') {
    if (!isFiniteNumber(rule.value) || rule.value < 0) throw new Error('fixedPriceUSDPerUnit must be finite and >= 0');
    return;
  }
  if (rule.kind === 'PCT_OF_SPOT') {
    if (!isFiniteNumber(rule.value) || rule.value < 0 || rule.value > 1) throw new Error('pctOfSpot must be finite and within [0, 1]');
    return;
  }
  if (!Array.isArray(rule.tiers) || rule.tiers.length === 0) throw new Error('tiered stream purchase rule requires at least one tier');
  let previous = 0;
  let sawOpenEnded = false;
  rule.tiers.forEach((tier, index) => {
    if (!isFiniteNumber(tier.value) || tier.value < 0 || tier.value > 1) throw new Error(`tiered stream purchase pct at index ${index} must be within [0,1]`);
    if (tier.upToCumulativeQty === null) {
      if (index !== rule.tiers.length - 1) throw new Error('open-ended stream purchase tier must be last');
      sawOpenEnded = true;
      return;
    }
    if (!isFiniteNumber(tier.upToCumulativeQty) || tier.upToCumulativeQty <= previous) throw new Error('stream purchase tier cumulative quantities must be strictly increasing');
    previous = tier.upToCumulativeQty;
  });
  if (!sawOpenEnded) throw new Error('tiered stream purchase rule must end with an open-ended tier');
}

function tieredPurchaseRevenue(args: {
  deliveredQty: number;
  spotPrice: number;
  cumulativeBefore: number;
  rule: Extract<StreamPurchasePriceRule, { kind: 'CUMULATIVE_QTY_TIERED_PCT_OF_SPOT' }>;
}): number {
  let remaining = args.deliveredQty;
  let cursor = args.cumulativeBefore;
  let revenue = 0;
  for (const tier of args.rule.tiers) {
    if (remaining <= 0) break;
    const tierEnd = tier.upToCumulativeQty ?? Number.POSITIVE_INFINITY;
    if (cursor >= tierEnd) continue;
    const capacity = tierEnd - cursor;
    const segment = Math.min(remaining, capacity);
    revenue += segment * args.spotPrice * tier.value;
    cursor += segment;
    remaining -= segment;
  }
  if (remaining > 1e-9) throw new Error('tiered stream purchase rule did not cover full delivered quantity');
  return revenue;
}

export function applyStreamMVI(input: StreamMVIInput): StreamMVIOutput {
  const expectedLength = input.masterN + 1;
  if (input.payableQty.length !== expectedLength) throw new Error('payableQty length must equal masterN+1');
  if (input.spotPriceUSDPerUnit.length !== expectedLength) throw new Error('spotPriceUSDPerUnit length must equal masterN+1');

  const { config } = input;
  const deliveryMode = config.deliveryMode ?? 'PCT_OF_PAYABLE';
  const inputPayableBasis = config.inputPayableBasis ?? 'PRE_STREAM';
  if (deliveryMode === 'DIRECT_QTY_SERIES') {
    if (!Array.isArray(config.deliveredQtyByPeriod) || config.deliveredQtyByPeriod.length !== expectedLength) {
      throw new Error('deliveredQtyByPeriod length must equal masterN+1 for DIRECT_QTY_SERIES');
    }
  } else if (!isFiniteNumber(config.streamPctOfPayable) || (config.streamPctOfPayable as number) < 0 || (config.streamPctOfPayable as number) > 1) {
    throw new Error('streamPctOfPayable must be finite and within [0, 1]');
  }

  const start = toValidPeriodIndex(config.start_t, 'start_t', input.masterN);
  const end = toValidPeriodIndex(config.end_t, 'end_t', input.masterN);
  if (start !== null && end !== null && start > end) throw new Error('start_t must be <= end_t');

  const capValue = config.deliveryCapQty ?? config.deliveryCapTotalQty;
  const hasCap = capValue !== null && capValue !== undefined;
  if (hasCap && (!isFiniteNumber(capValue) || capValue <= 0)) throw new Error('deliveryCapQty must be finite and > 0 when provided');

  const purchasePrice = resolvePurchaseRule(config);
  validatePurchaseRule(purchasePrice);

  let remainingCap = hasCap ? (capValue as number) : Number.POSITIVE_INFINITY;
  let cumulativeDelivered = 0;

  const preStreamPayableQty = new Array<number | null>(expectedLength).fill(0);
  const deliveredQty = new Array<number | null>(expectedLength).fill(0);
  const effectivePayableQty = new Array<number | null>(expectedLength).fill(0);
  const purchasePriceUSDPerUnit = new Array<number | null>(expectedLength).fill(0);
  const streamPurchaseRevenueUSD = new Array<number | null>(expectedLength).fill(0);
  const streamTakeUSD = new Array<number | null>(expectedLength).fill(0);

  for (let t = 0; t <= input.masterN; t += 1) {
    const rawPayable = input.payableQty[t];
    const rawSpot = input.spotPriceUSDPerUnit[t];
    const payable = isFiniteNumber(rawPayable) ? rawPayable : null;
    const spotPrice = isFiniteNumber(rawSpot) ? rawSpot : null;
    if (payable !== null && payable < 0) throw new Error(`payableQty[${t}] cannot be negative`);
    if (spotPrice !== null && spotPrice < 0) throw new Error(`spotPriceUSDPerUnit[${t}] cannot be negative`);

    const inWindow = (start === null || t >= start) && (end === null || t <= end);
    if (payable === null) {
      preStreamPayableQty[t] = null;
      deliveredQty[t] = null;
      effectivePayableQty[t] = null;
      purchasePriceUSDPerUnit[t] = null;
      streamPurchaseRevenueUSD[t] = null;
      streamTakeUSD[t] = null;
      continue;
    }

    let desiredDelivered = 0;
    if (inWindow && remainingCap > 0) {
      if (deliveryMode === 'DIRECT_QTY_SERIES') {
        const rawDelivered = config.deliveredQtyByPeriod?.[t] ?? null;
        if (!isFiniteNumber(rawDelivered) || rawDelivered < 0) throw new Error(`deliveredQtyByPeriod[${t}] must be finite and >= 0`);
        desiredDelivered = rawDelivered;
      } else {
        desiredDelivered = (config.streamPctOfPayable as number) * payable;
      }
    }
    const delivered = Math.min(desiredDelivered, remainingCap);
    if (inputPayableBasis === 'PRE_STREAM' && delivered > payable + 1e-9) throw new Error(`stream delivered quantity exceeds pre-stream payable quantity at t=${t}`);

    const preStreamPayable = inputPayableBasis === 'POST_STREAM' ? payable + delivered : payable;
    const retainedPayable = inputPayableBasis === 'POST_STREAM' ? payable : payable - delivered;
    preStreamPayableQty[t] = preStreamPayable;
    deliveredQty[t] = delivered;
    effectivePayableQty[t] = retainedPayable;

    if (Number.isFinite(remainingCap)) remainingCap -= delivered;

    if (delivered === 0) {
      purchasePriceUSDPerUnit[t] = purchasePrice.kind === 'FIXED_USD_PER_UNIT'
        ? purchasePrice.value
        : purchasePrice.kind === 'PCT_OF_SPOT' && spotPrice !== null
          ? spotPrice * purchasePrice.value
          : 0;
      streamPurchaseRevenueUSD[t] = 0;
      streamTakeUSD[t] = 0;
      continue;
    }
    if (spotPrice === null) {
      purchasePriceUSDPerUnit[t] = null;
      streamPurchaseRevenueUSD[t] = null;
      streamTakeUSD[t] = null;
      cumulativeDelivered += delivered;
      continue;
    }

    let purchaseRevenue: number;
    if (purchasePrice.kind === 'FIXED_USD_PER_UNIT') purchaseRevenue = delivered * purchasePrice.value;
    else if (purchasePrice.kind === 'PCT_OF_SPOT') purchaseRevenue = delivered * spotPrice * purchasePrice.value;
    else purchaseRevenue = tieredPurchaseRevenue({ deliveredQty: delivered, spotPrice, cumulativeBefore: cumulativeDelivered, rule: purchasePrice });

    const averagePurchasePrice = purchaseRevenue / delivered;
    purchasePriceUSDPerUnit[t] = averagePurchasePrice;
    streamPurchaseRevenueUSD[t] = purchaseRevenue;
    streamTakeUSD[t] = Math.max(0, spotPrice * delivered - purchaseRevenue);
    cumulativeDelivered += delivered;
  }

  return {
    preStreamPayableQty,
    deliveredQty,
    effectivePayableQty,
    purchasePriceUSDPerUnit,
    streamPurchaseRevenueUSD,
    streamTakeUSD,
    remainingCapEnd: Number.isFinite(remainingCap) ? remainingCap : null,
  };
}
