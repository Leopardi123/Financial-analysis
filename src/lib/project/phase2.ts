import type { ProjectPhase2Input, ProjectPhase2Output } from './types.ts';

const IRR_MIN_RATE = -0.9;
const IRR_MAX_RATE = 5;
const IRR_SCAN_STEPS = 1000;
const IRR_TOLERANCE = 1e-9;
const IRR_MAX_ITERATIONS = 200;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function assertInput(input: ProjectPhase2Input): void {
  if (!Number.isInteger(input.masterN) || input.masterN < 0) {
    throw new Error('masterN must be a non-negative integer');
  }

  if (!Number.isInteger(input.productionStartPeriod)) {
    throw new Error('productionStartPeriod must be an integer');
  }

  if (!isFiniteNumber(input.discountRate) || input.discountRate <= 0 || input.discountRate > 0.25) {
    throw new Error('discountRate must be finite and within (0, 0.25]');
  }

  if (input.fcffUSD.length !== input.masterN + 1) {
    throw new Error('fcffUSD length must equal masterN+1');
  }
}

function computeDfToToday(masterN: number, discountRate: number): number[] {
  const dfToToday: number[] = new Array(masterN + 1);
  for (let t = 0; t <= masterN; t += 1) {
    dfToToday[t] = 1 / (1 + discountRate) ** t;
  }
  return dfToToday;
}

function npvAtRate(cashflows: number[], rate: number): number {
  let total = 0;
  for (let t = 0; t < cashflows.length; t += 1) {
    total += cashflows[t] / (1 + rate) ** t;
  }
  return total;
}

function solveIrr(cashflows: number[]): number | null {
  const hasPositive = cashflows.some((value) => value > 0);
  const hasNegative = cashflows.some((value) => value < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  let left = IRR_MIN_RATE;
  let right = IRR_MAX_RATE;
  let fLeft = npvAtRate(cashflows, left);
  let fRight = npvAtRate(cashflows, right);

  if (fLeft === 0) {
    return left;
  }

  if (fRight === 0) {
    return right;
  }

  if (fLeft * fRight > 0) {
    const step = (IRR_MAX_RATE - IRR_MIN_RATE) / IRR_SCAN_STEPS;
    let scanLeft = IRR_MIN_RATE;
    let scanValueLeft = npvAtRate(cashflows, scanLeft);

    for (let i = 1; i <= IRR_SCAN_STEPS; i += 1) {
      const scanRight = IRR_MIN_RATE + step * i;
      const scanValueRight = npvAtRate(cashflows, scanRight);

      if (scanValueLeft === 0) {
        return scanLeft;
      }

      if (scanValueLeft * scanValueRight <= 0) {
        left = scanLeft;
        right = scanRight;
        fLeft = scanValueLeft;
        fRight = scanValueRight;
        break;
      }

      scanLeft = scanRight;
      scanValueLeft = scanValueRight;
    }

    if (fLeft * fRight > 0) {
      return null;
    }
  }

  for (let iteration = 0; iteration < IRR_MAX_ITERATIONS; iteration += 1) {
    const mid = (left + right) / 2;
    const fMid = npvAtRate(cashflows, mid);

    if (Math.abs(fMid) <= IRR_TOLERANCE || Math.abs(right - left) <= IRR_TOLERANCE) {
      return mid;
    }

    if (fLeft * fMid <= 0) {
      right = mid;
      fRight = fMid;
    } else {
      left = mid;
      fLeft = fMid;
    }
  }

  return null;
}

export function computeProjectPhase2(input: ProjectPhase2Input): ProjectPhase2Output {
  assertInput(input);

  const { masterN, productionStartPeriod: tp, discountRate } = input;
  const fcffUSD = input.fcffUSD.map((value) => toNumberOrNull(value));
  const dfToToday = computeDfToToday(masterN, discountRate);

  const allFcffFinite = fcffUSD.every((value) => value != null);

  let cfLOM_USD: number | null = null;
  let npvToday_USD: number | null = null;

  if (allFcffFinite) {
    cfLOM_USD = 0;
    npvToday_USD = 0;

    for (let t = 0; t <= masterN; t += 1) {
      const cashflow = fcffUSD[t] as number;
      cfLOM_USD += cashflow;
      npvToday_USD += cashflow * dfToToday[t];
    }
  }

  let dcfProdStart_exCapex_USD: number | null = null;
  let dcfProdStart_present_USD: number | null = null;

  if (tp <= masterN) {
    const postTpFcff = fcffUSD.slice(tp);
    const strictPostTp = postTpFcff.every((value) => value != null);

    if (strictPostTp) {
      let discountedToTp = 0;

      for (let t = tp; t <= masterN; t += 1) {
        const cashflow = fcffUSD[t] as number;
        const dfToProdStart = 1 / (1 + discountRate) ** (t - tp);
        discountedToTp += cashflow * dfToProdStart;
      }

      dcfProdStart_exCapex_USD = discountedToTp;
      dcfProdStart_present_USD = discountedToTp * dfToToday[tp];
    }
  }

  let irr: number | null = null;
  if (allFcffFinite) {
    irr = solveIrr(fcffUSD as number[]);
  }

  let npv_over_etlv: number | null = null;
  let dcf_present_over_etlv: number | null = null;

  if (cfLOM_USD != null && cfLOM_USD !== 0) {
    npv_over_etlv = npvToday_USD == null ? null : npvToday_USD / cfLOM_USD;
    dcf_present_over_etlv = dcfProdStart_present_USD == null ? null : dcfProdStart_present_USD / cfLOM_USD;
  }

  return {
    dfToToday,
    cfLOM_USD,
    npvToday_USD,
    dcfProdStart_exCapex_USD,
    dcfProdStart_present_USD,
    irr,
    npv_over_etlv,
    dcf_present_over_etlv,
  };
}
