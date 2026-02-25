import { applyStreamMVI } from '../streams/engine.ts';
import type { ProjectEngineFullProductionV1Input } from '../types.ts';
import type { PeriodIssue, Severity, ValidationReport } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isMissing(value: unknown): boolean {
  return !isFiniteNumber(value);
}

function makeEmptyReport(input: ProjectEngineFullProductionV1Input): ValidationReport {
  return {
    ok: true,
    errors: [],
    warnings: [],
    masterN: input.masterN,
    tp: input.phase1.productionStartPeriod,
    metals: [],
    missingMetalsInSpotPrice: [],
    missingMetalsInPayableQty: [],
    lengthMismatches: [],
    perPeriod: [],
  };
}

function pushIssue(
  report: ValidationReport,
  perPeriodMap: Map<number, PeriodIssue[]>,
  severity: Severity,
  code: string,
  message: string,
  path: string,
  t?: number,
  metal?: string,
): void {
  const issue: PeriodIssue = { severity, code, message, path, t, metal };

  if (severity === 'error') {
    report.errors.push(issue);
  } else {
    report.warnings.push(issue);
  }

  if (t !== undefined) {
    const bucket = perPeriodMap.get(t) ?? [];
    bucket.push(issue);
    perPeriodMap.set(t, bucket);
  }
}

function recordLengthMismatch(
  report: ValidationReport,
  perPeriodMap: Map<number, PeriodIssue[]>,
  path: string,
  expected: number,
  actual: number,
): void {
  report.lengthMismatches.push({ path, expected, actual });
  pushIssue(
    report,
    perPeriodMap,
    'error',
    'LENGTH_MISMATCH',
    `${path} length must equal ${expected}`,
    path,
  );
}

function finalizeReport(report: ValidationReport, perPeriodMap: Map<number, PeriodIssue[]>): ValidationReport {
  report.perPeriod = Array.from(perPeriodMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, issues]) => ({ t, issues }));
  report.ok = report.errors.length === 0;
  return report;
}

function getArrayLength(series: unknown): number {
  return Array.isArray(series) ? series.length : -1;
}

export function diagnoseProjectFullProductionV1(input: ProjectEngineFullProductionV1Input): ValidationReport {
  const report = makeEmptyReport(input);
  const perPeriodMap = new Map<number, PeriodIssue[]>();

  const masterN = input.masterN;
  const tp = input.phase1.productionStartPeriod;
  const hasValidMasterN = isInteger(masterN) && masterN >= 0;
  const hasValidTp = isInteger(tp);
  const expectedLength = hasValidMasterN ? masterN + 1 : 0;

  if (!hasValidMasterN) {
    pushIssue(
      report,
      perPeriodMap,
      'error',
      'MASTER_N_INVALID',
      'masterN must be an integer >= 0',
      'masterN',
    );
  }

  if (!hasValidTp) {
    pushIssue(
      report,
      perPeriodMap,
      'error',
      'PRODUCTION_START_INVALID',
      'productionStartPeriod must be an integer',
      'phase1.productionStartPeriod',
    );
  } else if (hasValidMasterN && tp > masterN) {
    pushIssue(
      report,
      perPeriodMap,
      'warn',
      'PRODUCTION_START_AFTER_MASTER_N',
      'productionStartPeriod is greater than masterN; LOM windows will be empty',
      'phase1.productionStartPeriod',
    );
  }

  if (input.phase1.masterN !== masterN) {
    pushIssue(
      report,
      perPeriodMap,
      'error',
      'PHASE1_MASTER_N_MISMATCH',
      'phase1.masterN must match masterN',
      'phase1.masterN',
    );
  }

  const payableMetals = Object.keys(input.payableQtyByMetal);
  const spotMetals = Object.keys(input.spotPriceUSDByMetal);
  report.metals = [...payableMetals];

  report.missingMetalsInSpotPrice = payableMetals.filter((metal) => !(metal in input.spotPriceUSDByMetal));
  report.missingMetalsInPayableQty = spotMetals.filter((metal) => !(metal in input.payableQtyByMetal));

  for (const metal of report.missingMetalsInSpotPrice) {
    pushIssue(
      report,
      perPeriodMap,
      'error',
      'MISSING_SPOT_METAL',
      `spotPriceUSDByMetal is missing metal ${metal}`,
      `spotPriceUSDByMetal.${metal}`,
      undefined,
      metal,
    );
  }

  for (const metal of report.missingMetalsInPayableQty) {
    pushIssue(
      report,
      perPeriodMap,
      'error',
      'MISSING_PAYABLE_METAL',
      `payableQtyByMetal is missing metal ${metal}`,
      `payableQtyByMetal.${metal}`,
      undefined,
      metal,
    );
  }

  const requiredPhase1Series = [
    ['phase1.capexUSD', input.phase1.capexUSD],
    ['phase1.operatingCostsUSD', input.phase1.operatingCostsUSD],
    ['phase1.sustainingCapexUSD', input.phase1.sustainingCapexUSD],
    ['phase1.siteGandA_USD', input.phase1.siteGandA_USD],
    ['phase1.reclamationUSD', input.phase1.reclamationUSD],
  ] as const;

  if (hasValidMasterN) {
    if (getArrayLength(input.aisc.auPriceUSDPerOz) !== expectedLength) {
      recordLengthMismatch(report, perPeriodMap, 'aisc.auPriceUSDPerOz', expectedLength, getArrayLength(input.aisc.auPriceUSDPerOz));
    }

    for (const metal of payableMetals) {
      const qtyPath = `payableQtyByMetal.${metal}`;
      const qtySeries = input.payableQtyByMetal[metal];
      if (getArrayLength(qtySeries) !== expectedLength) {
        recordLengthMismatch(report, perPeriodMap, qtyPath, expectedLength, getArrayLength(qtySeries));
      }
    }

    for (const metal of spotMetals) {
      const pricePath = `spotPriceUSDByMetal.${metal}`;
      const priceSeries = input.spotPriceUSDByMetal[metal];
      if (getArrayLength(priceSeries) !== expectedLength) {
        recordLengthMismatch(report, perPeriodMap, pricePath, expectedLength, getArrayLength(priceSeries));
      }
    }

    for (const [path, series] of requiredPhase1Series) {
      if (getArrayLength(series) !== expectedLength) {
        recordLengthMismatch(report, perPeriodMap, path, expectedLength, getArrayLength(series));
      }
    }

    if (input.phase1.byproductCreditsUSD != null && getArrayLength(input.phase1.byproductCreditsUSD) !== expectedLength) {
      recordLengthMismatch(
        report,
        perPeriodMap,
        'phase1.byproductCreditsUSD',
        expectedLength,
        getArrayLength(input.phase1.byproductCreditsUSD),
      );
    }
  }

  for (const metal of payableMetals) {
    const qtySeries = input.payableQtyByMetal[metal];
    for (let t = 0; t < qtySeries.length; t += 1) {
      const qty = qtySeries[t];
      if (isFiniteNumber(qty) && qty < 0) {
        pushIssue(
          report,
          perPeriodMap,
          'error',
          'NEGATIVE_PAYABLE_QTY',
          'payable quantity cannot be negative',
          `payableQtyByMetal.${metal}[${t}]`,
          t,
          metal,
        );
      }
    }
  }

  for (const metal of spotMetals) {
    const priceSeries = input.spotPriceUSDByMetal[metal];
    for (let t = 0; t < priceSeries.length; t += 1) {
      const price = priceSeries[t];
      if (isFiniteNumber(price) && price < 0) {
        pushIssue(
          report,
          perPeriodMap,
          'error',
          'NEGATIVE_SPOT_PRICE',
          'spot price cannot be negative',
          `spotPriceUSDByMetal.${metal}[${t}]`,
          t,
          metal,
        );
      }
    }
  }

  const streamsByMetal = input.streamsByMetal ?? {};
  for (const metal of Object.keys(streamsByMetal)) {
    if (!(metal in input.payableQtyByMetal)) {
      pushIssue(
        report,
        perPeriodMap,
        'error',
        'STREAM_UNKNOWN_PAYABLE_METAL',
        `streamsByMetal references unknown payable metal ${metal}`,
        `streamsByMetal.${metal}`,
        undefined,
        metal,
      );
    }

    if (!(metal in input.spotPriceUSDByMetal)) {
      pushIssue(
        report,
        perPeriodMap,
        'error',
        'STREAM_UNKNOWN_SPOT_METAL',
        `streamsByMetal references unknown spot metal ${metal}`,
        `streamsByMetal.${metal}`,
        undefined,
        metal,
      );
    }

    if (hasValidMasterN && (metal in input.payableQtyByMetal) && (metal in input.spotPriceUSDByMetal)) {
      try {
        const streamOut = applyStreamMVI({
          masterN,
          payableQty: input.payableQtyByMetal[metal],
          spotPriceUSDPerUnit: input.spotPriceUSDByMetal[metal],
          config: streamsByMetal[metal],
        });

        for (let t = 0; t <= masterN; t += 1) {
          const delivered = streamOut.deliveredQty[t];
          const price = input.spotPriceUSDByMetal[metal][t];
          if (isFiniteNumber(delivered) && delivered > 0 && isMissing(price)) {
            pushIssue(
              report,
              perPeriodMap,
              'error',
              'STREAM_TAKE_NULL_PRICE_MISSING',
              'stream take becomes null because delivered quantity is positive while spot price is missing',
              `spotPriceUSDByMetal.${metal}[${t}]`,
              t,
              metal,
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown stream validation error';
        pushIssue(
          report,
          perPeriodMap,
          'error',
          'STREAM_CONFIG_INVALID',
          message,
          `streamsByMetal.${metal}`,
          undefined,
          metal,
        );
      }
    }
  }

  if (!hasValidMasterN) {
    return finalizeReport(report, perPeriodMap);
  }

  for (let t = 0; t <= masterN; t += 1) {
    let hasRevenueInputMissing = false;

    for (const metal of payableMetals) {
      const qty = input.payableQtyByMetal[metal]?.[t];
      const price = input.spotPriceUSDByMetal[metal]?.[t];

      if (isMissing(qty)) {
        hasRevenueInputMissing = true;
        pushIssue(
          report,
          perPeriodMap,
          'error',
          'MISSING_PAYABLE_QTY',
          'missing or non-finite payable quantity',
          `payableQtyByMetal.${metal}[${t}]`,
          t,
          metal,
        );
      }

      if (isMissing(price)) {
        hasRevenueInputMissing = true;
        pushIssue(
          report,
          perPeriodMap,
          'error',
          'MISSING_SPOT_PRICE',
          'missing or non-finite spot price',
          `spotPriceUSDByMetal.${metal}[${t}]`,
          t,
          metal,
        );
      }
    }

    if (hasRevenueInputMissing) {
      pushIssue(
        report,
        perPeriodMap,
        'error',
        'REVENUE_NULL_MISSING_QTY_OR_PRICE',
        'gross revenue becomes null because at least one metal has missing qty or price',
        `revenue.grossRevenueUSD[${t}]`,
        t,
      );

      pushIssue(
        report,
        perPeriodMap,
        'error',
        'TAKE_NULL_MISSING_GROSS_REVENUE',
        'take (revenue base) becomes null because gross revenue is null',
        `nationalTake.revenueTakeUSD[${t}]`,
        t,
      );
    }

    const auPrice = input.aisc.auPriceUSDPerOz[t];
    if (hasRevenueInputMissing || isMissing(auPrice) || (isFiniteNumber(auPrice) && auPrice <= 0)) {
      pushIssue(
        report,
        perPeriodMap,
        'error',
        'AISC_NULL_MISSING_AU_PRICE_OR_REVENUE',
        'AISC payableAuEqOz becomes null because gross revenue is missing or auPrice is missing/non-positive',
        `aisc.payableAuEqOz[${t}]`,
        t,
      );
    }

    const hasMissingProfitBaseInput = requiredPhase1Series.some(([, series]) => isMissing(series[t]))
      || (input.phase1.byproductCreditsUSD != null && isMissing(input.phase1.byproductCreditsUSD[t]));

    if (hasValidTp && t >= tp && (hasRevenueInputMissing || hasMissingProfitBaseInput)) {
      pushIssue(
        report,
        perPeriodMap,
        'error',
        'TAKE_NULL_MISSING_PROFIT_BASE',
        'operating profit / EBITDA based take may become null due to missing profit-base inputs',
        `nationalTake.profitTakeUSD[${t}]`,
        t,
      );
    }
  }

  return finalizeReport(report, perPeriodMap);
}

function throwIfError(value: boolean, message: string): void {
  if (value) {
    throw new Error(message);
  }
}

export function validateProjectFullProductionV1(input: ProjectEngineFullProductionV1Input): void {
  const report = diagnoseProjectFullProductionV1(input);

  throwIfError(!isInteger(input.masterN) || input.masterN < 0, 'masterN must be an integer >= 0');
  throwIfError(!isInteger(input.phase1.productionStartPeriod), 'phase1.productionStartPeriod must be an integer');

  if (report.lengthMismatches.length > 0) {
    const mismatch = report.lengthMismatches[0];
    throw new Error(`${mismatch.path} length must equal masterN+1`);
  }

  if (report.missingMetalsInSpotPrice.length > 0) {
    throw new Error(`spotPriceUSDByMetal missing required metal ${report.missingMetalsInSpotPrice[0]}`);
  }

  if (report.errors.some((issue) => issue.code === 'STREAM_UNKNOWN_PAYABLE_METAL')) {
    const issue = report.errors.find((entry) => entry.code === 'STREAM_UNKNOWN_PAYABLE_METAL');
    throw new Error(issue?.message ?? 'streamsByMetal references unknown payable metal');
  }

  if (report.errors.some((issue) => issue.code === 'STREAM_UNKNOWN_SPOT_METAL')) {
    const issue = report.errors.find((entry) => entry.code === 'STREAM_UNKNOWN_SPOT_METAL');
    throw new Error(issue?.message ?? 'streamsByMetal references unknown spot metal');
  }

  if (report.errors.some((issue) => issue.code === 'NEGATIVE_PAYABLE_QTY')) {
    const issue = report.errors.find((entry) => entry.code === 'NEGATIVE_PAYABLE_QTY');
    throw new Error(`${issue?.path ?? 'payableQty'} cannot be negative`);
  }

  if (report.errors.some((issue) => issue.code === 'NEGATIVE_SPOT_PRICE')) {
    const issue = report.errors.find((entry) => entry.code === 'NEGATIVE_SPOT_PRICE');
    throw new Error(`${issue?.path ?? 'spotPrice'} cannot be negative`);
  }

  if (report.errors.some((issue) => issue.code === 'STREAM_CONFIG_INVALID')) {
    const issue = report.errors.find((entry) => entry.code === 'STREAM_CONFIG_INVALID');
    throw new Error(issue?.message ?? 'invalid stream configuration');
  }
}
