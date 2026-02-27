export type ComputeRevenueByMetalUSDArgs = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  priceUSDByMetal: Record<string, (number | null)[]>;
};

export type ComputeRevenueByMetalUSDResult = {
  revenueByMetalUSD: Record<string, (number | null)[]>;
  grossRevenueUSD: (number | null)[];
  diagnostics: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function summarizePeriods(periods: number[], limit: number): string {
  if (periods.length === 0) {
    return 'none';
  }
  const head = periods.slice(0, limit).join(',');
  return periods.length > limit ? `${head},...` : head;
}

export function computeRevenueByMetalUSD(args: ComputeRevenueByMetalUSDArgs): ComputeRevenueByMetalUSDResult {
  const expectedLength = args.masterN + 1;
  const diagnostics: string[] = [];
  const revenueByMetalUSD: Record<string, (number | null)[]> = {};

  const qtyMetals = Object.keys(args.payableQtyByMetal);
  const priceMetals = new Set(Object.keys(args.priceUSDByMetal));
  const metals = qtyMetals.filter((metal) => priceMetals.has(metal));

  for (const metal of qtyMetals) {
    if (!(metal in args.priceUSDByMetal)) {
      diagnostics.push(`revenueByMetal: missing price series for metal=${metal}`);
    }
  }
  for (const metal of Object.keys(args.priceUSDByMetal)) {
    if (!(metal in args.payableQtyByMetal)) {
      diagnostics.push(`revenueByMetal: missing payable quantity series for metal=${metal}`);
    }
  }

  for (const metal of metals) {
    revenueByMetalUSD[metal] = new Array<number | null>(expectedLength).fill(null);
  }

  if (metals.length === 0) {
    diagnostics.push('revenueByMetal: no overlapping metals in payableQtyByMetal and priceUSDByMetal');
    return {
      revenueByMetalUSD,
      grossRevenueUSD: new Array<number | null>(expectedLength).fill(null),
      diagnostics,
    };
  }

  for (const metal of metals) {
    const qtySeries = args.payableQtyByMetal[metal];
    const priceSeries = args.priceUSDByMetal[metal];

    if (qtySeries.length !== expectedLength) {
      diagnostics.push(`revenueByMetal: payableQtyByMetal[${metal}] length=${qtySeries.length} expected=${expectedLength}`);
    }
    if (priceSeries.length !== expectedLength) {
      diagnostics.push(`revenueByMetal: priceUSDByMetal[${metal}] length=${priceSeries.length} expected=${expectedLength}`);
    }

    const nullPeriods: number[] = [];
    for (let t = 0; t < expectedLength; t += 1) {
      const qty = qtySeries[t];
      const price = priceSeries[t];

      if (!isFiniteNumber(qty) || !isFiniteNumber(price)) {
        revenueByMetalUSD[metal][t] = null;
        nullPeriods.push(t);
        continue;
      }

      if (qty < 0 || price < 0) {
        revenueByMetalUSD[metal][t] = null;
        diagnostics.push(`revenueByMetal: metal=${metal} t=${t} negativeInput qty=${qty} price=${price}`);
        nullPeriods.push(t);
        continue;
      }

      revenueByMetalUSD[metal][t] = qty * price;
    }

    if (nullPeriods.length > 0) {
      diagnostics.push(`revenueByMetal: metal=${metal} nullPeriods=[${summarizePeriods(nullPeriods, 5)}]`);
    }
  }

  const grossRevenueUSD = new Array<number | null>(expectedLength).fill(null);
  for (let t = 0; t < expectedLength; t += 1) {
    let total = 0;
    let hasNull = false;
    for (const metal of metals) {
      const revenue = revenueByMetalUSD[metal][t];
      if (!isFiniteNumber(revenue)) {
        hasNull = true;
        break;
      }
      total += revenue;
    }
    grossRevenueUSD[t] = hasNull ? null : total;
  }

  return {
    revenueByMetalUSD,
    grossRevenueUSD,
    diagnostics,
  };
}
