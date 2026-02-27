type StatementSeries = Record<string, Array<number | null> | undefined>;

function latestPositiveFinite(values: Array<number | null> | undefined): number | null {
  if (!Array.isArray(values)) {
    return null;
  }

  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

export function resolveCommonSharesCurrent(args: {
  balance?: StatementSeries | null;
  income?: StatementSeries | null;
}): number | null {
  const fromBalance = latestPositiveFinite(args.balance?.commonStockSharesOutstanding);
  if (fromBalance !== null) {
    return fromBalance;
  }

  const fromIncomeBasic = latestPositiveFinite(args.income?.weightedAverageShsOut);
  if (fromIncomeBasic !== null) {
    return fromIncomeBasic;
  }

  return latestPositiveFinite(args.income?.weightedAverageShsOutDil);
}

