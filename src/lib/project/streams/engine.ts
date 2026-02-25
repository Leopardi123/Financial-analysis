import type { StreamMVIInput, StreamMVIOutput } from './types.ts';

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

  const hasCap = config.deliveryCapTotalQty !== null && config.deliveryCapTotalQty !== undefined;
  if (hasCap && (!isFiniteNumber(config.deliveryCapTotalQty) || config.deliveryCapTotalQty < 0)) {
    throw new Error('deliveryCapTotalQty must be finite and >= 0 when provided');
  }

  if (config.purchasePrice.kind === 'FIXED_USD_PER_UNIT') {
    if (!isFiniteNumber(config.purchasePrice.value) || config.purchasePrice.value < 0) {
      throw new Error('purchasePrice FIXED_USD_PER_UNIT value must be finite and >= 0');
    }
  }

  if (config.purchasePrice.kind === 'PCT_OF_SPOT') {
    if (!isFiniteNumber(config.purchasePrice.value) || config.purchasePrice.value < 0 || config.purchasePrice.value > 1) {
      throw new Error('purchasePrice PCT_OF_SPOT value must be finite and within [0, 1]');
    }
  }

  let remainingCap = hasCap ? (config.deliveryCapTotalQty as number) : Number.POSITIVE_INFINITY;

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

    if (!inWindow) {
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
    if (config.purchasePrice.kind === 'FIXED_USD_PER_UNIT') {
      purchasePriceUSD = config.purchasePrice.value;
    } else {
      purchasePriceUSD = spotPrice !== null ? spotPrice * config.purchasePrice.value : null;
    }

    if (delivered === 0) {
      streamTakeUSD[t] = 0;
      continue;
    }

    if (spotPrice === null || purchasePriceUSD === null || !Number.isFinite(purchasePriceUSD)) {
      streamTakeUSD[t] = null;
      continue;
    }

    if (purchasePriceUSD > spotPrice + 1e-9) {
      throw new Error(`purchase price exceeds spot at period ${t}`);
    }

    streamTakeUSD[t] = (spotPrice - purchasePriceUSD) * delivered;
  }

  return {
    deliveredQty,
    effectivePayableQty,
    streamTakeUSD,
    remainingCapEnd: Number.isFinite(remainingCap) ? remainingCap : null,
  };
}
