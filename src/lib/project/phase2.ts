import type { ProjectPhase2Input, ProjectPhase2Output } from './types.ts';
import { computeIrr } from '../metrics/lista3.ts';

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
    irr = computeIrr(fcffUSD, discountRate).selectedRoot;
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
