import type { StreamMVIInput, StreamMVIOutput, StreamPurchasePriceRule } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toValidPeriodIndex(value: number | null | undefined, name: string, masterN: number): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer when provided`);
  }

  if (value < 0 || value > masterN) {
    throw new Error(`${name} must be within 0..masterN`);
  }

  return value;
}

function resolvePurchaseRule(config: StreamMVIInput['config']): StreamPurchasePriceRule {
  if (config.purchasePrice) {
    return config.purchasePrice;
  }

  if (config.purchasePriceRule === 'FIXED_USD_PER_UNIT') {
    return { kind: 'FIXED_USD_PER_UNIT', value: config.fixedPriceUSDPerUnit as number };
  }

  if (config.purchasePriceRule === 'PCT_OF_SPOT') {
    return { kind: 'PCT_OF_SPOT', value: config.pctOfSpot as number };
  }

  throw new Error('purchase price configuration is required');
}

export function applyStreamMVI(input: StreamMVIInput): StreamMVIOutput {
  const expectedLength = input.masterN + 1;
  if (input.payableQty.length !== expectedLength) {
    throw new Error('payableQty length must equal masterN+1');
  }

  if (input.spotPriceUSDPerUnit.length !== expectedLength) {
    throw new Error('spotPriceUSDPerUnit length must equal masterN+1');
  }

  const { config } = input;

  if (!isFiniteNumber(config.streamPctOfPayable) || config.streamPctOfPayable < 0 || config.streamPctOfPayable > 1) {
    throw new Error('streamPctOfPayable must be finite and within [0, 1]');
  }

  const start = toValidPeriodIndex(config.start_t, 'start_t', input.masterN);
  const end = toValidPeriodIndex(config.end_t, 'end_t', input.masterN);
  if (start !== null && end !== null && start > end) {
    throw new Error('start_t must be <= end_t');
  }

  const capValue = config.deliveryCapQty ?? config.deliveryCapTotalQty;
  const hasCap = capValue !== null && capValue !== undefined;
  if (hasCap && (!isFiniteNumber(capValue) || capValue <= 0)) {
    throw new Error('deliveryCapQty must be finite and > 0 when provided');
  }

  const purchasePrice = resolvePurchaseRule(config);

  if (purchasePrice.kind === 'FIXED_USD_PER_UNIT') {
    if (!isFiniteNumber(purchasePrice.value) || purchasePrice.value < 0) {
      throw new Error('fixedPriceUSDPerUnit must be finite and >= 0');
    }
  }

  if (purchasePrice.kind === 'PCT_OF_SPOT') {
    if (!isFiniteNumber(purchasePrice.value) || purchasePrice.value < 0 || purchasePrice.value > 1) {
      throw new Error('pctOfSpot must be finite and within [0, 1]');
    }
  }

  let remainingCap = hasCap ? (capValue as number) : Number.POSITIVE_INFINITY;

  const deliveredQty = new Array<number | null>(expectedLength).fill(0);
  const effectivePayableQty = new Array<number | null>(expectedLength).fill(0);
  const streamTakeUSD = new Array<number | null>(expectedLength).fill(0);

  for (let t = 0; t <= input.masterN; t += 1) {
    const rawPayable = input.payableQty[t];
    const rawSpot = input.spotPriceUSDPerUnit[t];
    const payable = isFiniteNumber(rawPayable) ? rawPayable : null;
    const spotPrice = isFiniteNumber(rawSpot) ? rawSpot : null;

    if (payable !== null && payable < 0) {
      throw new Error(`payableQty[${t}] cannot be negative`);
    }

    if (spotPrice !== null && spotPrice < 0) {
      throw new Error(`spotPriceUSDPerUnit[${t}] cannot be negative`);
    }

    const inWindow = (start === null || t >= start) && (end === null || t <= end);

    if (payable === null) {
      deliveredQty[t] = null;
      effectivePayableQty[t] = null;
      streamTakeUSD[t] = null;
      continue;
    }

    if (!inWindow || remainingCap <= 0) {
      deliveredQty[t] = 0;
      effectivePayableQty[t] = payable;
      streamTakeUSD[t] = 0;
      continue;
    }

    const desiredDelivered = config.streamPctOfPayable * payable;
    const delivered = Math.min(desiredDelivered, remainingCap);
    deliveredQty[t] = delivered;
    effectivePayableQty[t] = payable - delivered;

    if (Number.isFinite(remainingCap)) {
      remainingCap -= delivered;
    }

    let purchasePriceUSD: number | null;
    if (purchasePrice.kind === 'FIXED_USD_PER_UNIT') {
      purchasePriceUSD = purchasePrice.value;
    } else {
      purchasePriceUSD = spotPrice !== null ? spotPrice * purchasePrice.value : null;
    }

    if (delivered === 0) {
      streamTakeUSD[t] = 0;
      continue;
    }

    if (spotPrice === null || purchasePriceUSD === null || !Number.isFinite(purchasePriceUSD)) {
      streamTakeUSD[t] = null;
      continue;
    }

    streamTakeUSD[t] = Math.max(0, spotPrice - purchasePriceUSD) * delivered;
  }

  return {
    deliveredQty,
    effectivePayableQty,
    streamTakeUSD,
    remainingCapEnd: Number.isFinite(remainingCap) ? remainingCap : null,
  };
}
