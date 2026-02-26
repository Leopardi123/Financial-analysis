import type { CorporateOverheadOverlayInput, CorporateOverheadOverlayOutput } from './types.ts';

function assertValidInput(input: CorporateOverheadOverlayInput): void {
  if (!Number.isInteger(input.masterN) || input.masterN < 0) {
    throw new Error('masterN must be an integer >= 0');
  }

  if (!Number.isFinite(input.discountRate) || input.discountRate <= 0 || input.discountRate > 0.25) {
    throw new Error('discountRate must be finite and within (0, 0.25]');
  }

  const expectedLength = input.masterN + 1;

  if (input.fcffUSD_total.length !== expectedLength) {
    throw new Error(`fcffUSD_total length must be ${expectedLength}`);
  }

  if (input.corpGA_cash_USD.length !== expectedLength) {
    throw new Error(`corpGA_cash_USD length must be ${expectedLength}`);
  }

  if (input.corpSBC_USD.length !== expectedLength) {
    throw new Error(`corpSBC_USD length must be ${expectedLength}`);
  }
}

function computeNpvStrict(fcffSeries: (number | null)[], discountRate: number, masterN: number): number | null {
  let npv = 0;

  for (let t = 0; t <= masterN; t += 1) {
    const fcff = fcffSeries[t];
    if (fcff === null || !Number.isFinite(fcff)) {
      return null;
    }

    npv += fcff / (1 + discountRate) ** t;
  }

  return npv;
}

export function computeCorporateOverheadOverlay(
  input: CorporateOverheadOverlayInput,
): CorporateOverheadOverlayOutput {
  assertValidInput(input);

  const overheadUSD: (number | null)[] = [];
  const fcffUSD_after_overhead: (number | null)[] = [];

  for (let t = 0; t <= input.masterN; t += 1) {
    const fcffRaw = input.fcffUSD_total[t];
    const fcff = fcffRaw !== null && Number.isFinite(fcffRaw) ? fcffRaw : null;
    const gaRaw = input.corpGA_cash_USD[t];
    const sbcRaw = input.corpSBC_USD[t];
    const ga = gaRaw !== null && Number.isFinite(gaRaw) ? gaRaw : 0;
    const sbc = sbcRaw !== null && Number.isFinite(sbcRaw) ? sbcRaw : 0;

    const overhead = ga + sbc;
    overheadUSD.push(overhead);
    fcffUSD_after_overhead.push(fcff === null ? null : fcff - overhead);
  }

  const npvToday_USD_before = computeNpvStrict(
    input.fcffUSD_total.map((value) => (value !== null && Number.isFinite(value) ? value : null)),
    input.discountRate,
    input.masterN,
  );
  const npvToday_USD_after_overhead = computeNpvStrict(fcffUSD_after_overhead, input.discountRate, input.masterN);

  const overheadNPVDrag_USD =
    npvToday_USD_before !== null && npvToday_USD_after_overhead !== null
      ? npvToday_USD_after_overhead - npvToday_USD_before
      : null;

  return {
    overheadUSD,
    fcffUSD_after_overhead,
    npvToday_USD_before,
    npvToday_USD_after_overhead,
    overheadNPVDrag_USD,
  };
}
