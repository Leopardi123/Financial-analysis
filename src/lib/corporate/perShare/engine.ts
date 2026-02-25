import type { CorporatePerShareInput, CorporatePerShareOutput } from './types.ts';

function normalizeFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

export function computeCorporatePerShare(input: CorporatePerShareInput): CorporatePerShareOutput {
  const shares_post_financing = normalizeFiniteOrNull(input.shares_post_financing);

  if (shares_post_financing === null) {
    return {
      npvToday_perShare_TargetCurrency: null,
      navToday_perShare_TargetCurrency: null,
      cfLOM_perShare_TargetCurrency: null,
      dcfProdStart_present_perShare_TargetCurrency: null,
    };
  }

  if (shares_post_financing <= 0) {
    throw new Error('shares_post_financing must be > 0 when provided');
  }

  const perShare = (value: number | null | undefined): number | null => {
    const normalized = normalizeFiniteOrNull(value);
    return normalized === null ? null : normalized / shares_post_financing;
  };

  return {
    npvToday_perShare_TargetCurrency: perShare(input.npvToday_TargetCurrency),
    navToday_perShare_TargetCurrency: perShare(input.navToday_TargetCurrency),
    cfLOM_perShare_TargetCurrency: perShare(input.cfLOM_TargetCurrency ?? null),
    dcfProdStart_present_perShare_TargetCurrency: perShare(
      input.dcfProdStart_present_TargetCurrency ?? null,
    ),
  };
}
