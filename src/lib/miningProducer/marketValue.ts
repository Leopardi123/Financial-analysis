import { computeEnterpriseValueUSD } from './valuation.ts';
import type { EnterpriseAdjustment, MoneyPoint, ProducerJsonV1 } from './types.ts';

export type ProducerMarketValueResult = {
  marketCapUSD: number | null;
  marketCapMethod: 'reported_market_cap' | 'price_times_basic_shares' | 'unresolved';
  enterpriseValueUSD: number | null;
  componentsUSD: {
    debtUSD: number | null;
    preferredEquityUSD: number | null;
    nonControllingInterestUSD: number | null;
    includedLeaseLiabilitiesUSD: number | null;
    cashUSD: number | null;
    nonOperatingInvestmentsUSD: number | null;
    otherEnterpriseAdjustmentsUSD: number | null;
  };
  diagnostics: string[];
};

function convertMoneyPointToUsd(
  point: MoneyPoint | undefined,
  usdPerCurrencyUnitByCurrency: Readonly<Record<string, number>>,
  label: string,
): { valueUSD: number | null; diagnostic?: string } {
  if (!point) return { valueUSD: null, diagnostic: `${label}: missing` };
  if (!Number.isFinite(point.value)) return { valueUSD: null, diagnostic: `${label}: non-finite value` };
  const currency = point.currency.trim().toUpperCase();
  if (currency === 'USD') return { valueUSD: point.value };
  const rate = usdPerCurrencyUnitByCurrency[currency];
  if (!Number.isFinite(rate) || rate <= 0) {
    return { valueUSD: null, diagnostic: `${label}: missing explicit USD-per-${currency} FX rate` };
  }
  return { valueUSD: point.value * rate };
}

function adjustmentToUsd(
  adjustment: EnterpriseAdjustment,
  usdPerCurrencyUnitByCurrency: Readonly<Record<string, number>>,
): { valueUSD: number | null; diagnostic?: string } {
  const point: MoneyPoint = {
    value: adjustment.amount,
    currency: adjustment.currency,
    provenance: adjustment.provenance,
  };
  const converted = convertMoneyPointToUsd(point, usdPerCurrencyUnitByCurrency, `EV adjustment ${adjustment.id}`);
  if (converted.valueUSD === null) return converted;
  return {
    valueUSD: adjustment.treatment === 'add' ? converted.valueUSD : -converted.valueUSD,
  };
}

function dateNotAfterValuation(date: string | undefined, valuationDateUtc: string, label: string): string | null {
  if (!date) return null;
  if (date > valuationDateUtc) return `${label}: as-of date ${date} is after valuation date ${valuationDateUtc}`;
  return null;
}

export function resolveProducerMarketValue(args: {
  producer: ProducerJsonV1;
  usdPerCurrencyUnitByCurrency: Readonly<Record<string, number>>;
}): ProducerMarketValueResult {
  const { producer, usdPerCurrencyUnitByCurrency } = args;
  const diagnostics: string[] = [];
  const valuationDateUtc = producer.valuation.valuationDateUtc;

  let marketCapUSD: number | null = null;
  let marketCapMethod: ProducerMarketValueResult['marketCapMethod'] = 'unresolved';

  if (producer.valuation.reportedMarketCap) {
    const dateIssue = dateNotAfterValuation(producer.valuation.reportedMarketCap.asOfDate, valuationDateUtc, 'reportedMarketCap');
    if (dateIssue) diagnostics.push(dateIssue);
    else {
      const converted = convertMoneyPointToUsd(producer.valuation.reportedMarketCap, usdPerCurrencyUnitByCurrency, 'reportedMarketCap');
      if (converted.valueUSD !== null && converted.valueUSD >= 0) {
        marketCapUSD = converted.valueUSD;
        marketCapMethod = 'reported_market_cap';
      } else if (converted.diagnostic) diagnostics.push(converted.diagnostic);
    }
  }

  if (marketCapUSD === null && producer.valuation.marketPrice && producer.valuation.sharesOutstanding) {
    const shares = producer.valuation.sharesOutstanding;
    if (shares.basis !== 'basic_actual') {
      diagnostics.push(`sharesOutstanding basis ${shares.basis} cannot be used as current basic shares`);
    } else if (!Number.isFinite(shares.value) || shares.value <= 0) {
      diagnostics.push('sharesOutstanding: basic actual shares must be finite and positive');
    } else {
      const priceDateIssue = dateNotAfterValuation(producer.valuation.marketPrice.asOfDate, valuationDateUtc, 'marketPrice');
      const sharesDateIssue = dateNotAfterValuation(shares.asOfDate, valuationDateUtc, 'sharesOutstanding');
      if (priceDateIssue) diagnostics.push(priceDateIssue);
      if (sharesDateIssue) diagnostics.push(sharesDateIssue);
      if (!priceDateIssue && !sharesDateIssue) {
        const price = convertMoneyPointToUsd(producer.valuation.marketPrice, usdPerCurrencyUnitByCurrency, 'marketPrice');
        if (price.valueUSD !== null && price.valueUSD >= 0) {
          marketCapUSD = price.valueUSD * shares.value;
          marketCapMethod = 'price_times_basic_shares';
        } else if (price.diagnostic) diagnostics.push(price.diagnostic);
      }
    }
  }

  if (marketCapUSD === null) diagnostics.push('Market cap unresolved: provide reportedMarketCap or marketPrice plus basic_actual shares');

  const balance = producer.valuation.balanceSheet;
  const emptyComponents: ProducerMarketValueResult['componentsUSD'] = {
    debtUSD: null,
    preferredEquityUSD: null,
    nonControllingInterestUSD: null,
    includedLeaseLiabilitiesUSD: null,
    cashUSD: null,
    nonOperatingInvestmentsUSD: null,
    otherEnterpriseAdjustmentsUSD: null,
  };

  if (!balance) {
    diagnostics.push('Enterprise value unresolved: balanceSheet is missing; debt/cash must not default to zero');
    return { marketCapUSD, marketCapMethod, enterpriseValueUSD: null, componentsUSD: emptyComponents, diagnostics };
  }
  const balanceDateIssue = dateNotAfterValuation(balance.asOfDate, valuationDateUtc, 'balanceSheet');
  if (balanceDateIssue) diagnostics.push(balanceDateIssue);

  const debt = convertMoneyPointToUsd(balance.totalDebt, usdPerCurrencyUnitByCurrency, 'totalDebt');
  const preferred = convertMoneyPointToUsd(balance.preferredEquity, usdPerCurrencyUnitByCurrency, 'preferredEquity');
  const nci = convertMoneyPointToUsd(balance.nonControllingInterest, usdPerCurrencyUnitByCurrency, 'nonControllingInterest');
  const leases = convertMoneyPointToUsd(balance.leaseLiabilities, usdPerCurrencyUnitByCurrency, 'leaseLiabilities');
  const cash = convertMoneyPointToUsd(balance.cashAndEquivalents, usdPerCurrencyUnitByCurrency, 'cashAndEquivalents');
  const investments = convertMoneyPointToUsd(balance.nonOperatingInvestments, usdPerCurrencyUnitByCurrency, 'nonOperatingInvestments');

  // Optional EV components are zero only when the schema omits them by design. Debt and cash are required.
  const preferredUSD = balance.preferredEquity ? preferred.valueUSD : 0;
  const nciUSD = balance.nonControllingInterest ? nci.valueUSD : 0;
  const leasesUSD = balance.leaseLiabilities ? leases.valueUSD : 0;
  const investmentsUSD = balance.nonOperatingInvestments ? investments.valueUSD : 0;

  for (const item of [debt, cash, preferred, nci, leases, investments]) {
    if (item.diagnostic && !item.diagnostic.endsWith(': missing')) diagnostics.push(item.diagnostic);
  }

  let otherAdjustmentsUSD: number | null = 0;
  for (const adjustment of balance.otherEnterpriseAdjustments ?? []) {
    const converted = adjustmentToUsd(adjustment, usdPerCurrencyUnitByCurrency);
    if (converted.valueUSD === null) {
      otherAdjustmentsUSD = null;
      if (converted.diagnostic) diagnostics.push(converted.diagnostic);
      break;
    }
    otherAdjustmentsUSD += converted.valueUSD;
  }

  const componentsUSD: ProducerMarketValueResult['componentsUSD'] = {
    debtUSD: debt.valueUSD,
    preferredEquityUSD: preferredUSD,
    nonControllingInterestUSD: nciUSD,
    includedLeaseLiabilitiesUSD: leasesUSD,
    cashUSD: cash.valueUSD,
    nonOperatingInvestmentsUSD: investmentsUSD,
    otherEnterpriseAdjustmentsUSD: otherAdjustmentsUSD,
  };

  const required = [marketCapUSD, debt.valueUSD, cash.valueUSD, preferredUSD, nciUSD, leasesUSD, investmentsUSD, otherAdjustmentsUSD];
  if (balanceDateIssue || required.some((value) => value === null)) {
    diagnostics.push('Enterprise value unresolved: required market-cap/debt/cash/FX inputs are incomplete');
    return { marketCapUSD, marketCapMethod, enterpriseValueUSD: null, componentsUSD, diagnostics };
  }

  const enterpriseValueUSD = computeEnterpriseValueUSD({
    marketCapUSD: marketCapUSD as number,
    debtUSD: debt.valueUSD as number,
    preferredEquityUSD: preferredUSD as number,
    nonControllingInterestUSD: nciUSD as number,
    includedLeaseLiabilitiesUSD: leasesUSD as number,
    cashUSD: cash.valueUSD as number,
    nonOperatingInvestmentsUSD: investmentsUSD as number,
    otherEnterpriseAdjustmentsUSD: otherAdjustmentsUSD as number,
  });

  return { marketCapUSD, marketCapMethod, enterpriseValueUSD, componentsUSD, diagnostics };
}
