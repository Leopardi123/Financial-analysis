import type {
  CorporateEquityFinancingInput,
  CorporateEquityFinancingOutput,
} from './types.ts';

function normalizeFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

export function computeCorporateEquityFinancing(
  input: CorporateEquityFinancingInput,
): CorporateEquityFinancingOutput {
  const shares_current = normalizeFiniteOrNull(input.shares_current);
  const equityNeeded_TargetCurrency = normalizeFiniteOrNull(input.equityNeeded_TargetCurrency);
  const equityRaisePrice_TargetCurrency_perShare = normalizeFiniteOrNull(
    input.equityRaisePrice_TargetCurrency_perShare,
  );

  if (shares_current !== null && shares_current <= 0) {
    throw new Error('shares_current must be > 0 when provided');
  }

  if (equityNeeded_TargetCurrency !== null && equityNeeded_TargetCurrency < 0) {
    throw new Error('equityNeeded_TargetCurrency must be >= 0 when provided');
  }

  if (
    equityRaisePrice_TargetCurrency_perShare !== null &&
    equityRaisePrice_TargetCurrency_perShare <= 0
  ) {
    throw new Error('equityRaisePrice_TargetCurrency_perShare must be > 0 when provided');
  }

  if (
    shares_current === null ||
    equityNeeded_TargetCurrency === null ||
    equityRaisePrice_TargetCurrency_perShare === null
  ) {
    return {
      shares_current,
      equityNeeded_TargetCurrency,
      equityRaisePrice_TargetCurrency_perShare,
      newShares: null,
      shares_post_financing: null,
    };
  }

  const roundToWholeShares = input.roundToWholeShares ?? true;
  const rawNewShares = equityNeeded_TargetCurrency / equityRaisePrice_TargetCurrency_perShare;
  const newShares = roundToWholeShares ? Math.ceil(rawNewShares) : rawNewShares;

  return {
    shares_current,
    equityNeeded_TargetCurrency,
    equityRaisePrice_TargetCurrency_perShare,
    newShares,
    shares_post_financing: shares_current + newShares,
  };
}
