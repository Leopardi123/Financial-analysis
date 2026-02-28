type NullableNumber = number | null;

export type Lista3aProjectEfficiencyMetrics = {
  Payback_approx_years: NullableNumber;
  Payback_real_years: NullableNumber;
  ROI_10Y_pct: NullableNumber;
  LOM_average_EBIT_ROCE_pct: NullableNumber;
  LOM_discounted_EBIT_ROCE_pct: NullableNumber;
};

export function makeNullLista3aProjectEfficiencyMetrics(): Lista3aProjectEfficiencyMetrics {
  return {
    Payback_approx_years: null,
    Payback_real_years: null,
    ROI_10Y_pct: null,
    LOM_average_EBIT_ROCE_pct: null,
    LOM_discounted_EBIT_ROCE_pct: null,
  };
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computePreProductionDeficit(args: {
  fcffUSD_total: Array<number | null>;
  productionStartPeriod: number;
}): number | null {
  let preProductionSum = 0;
  for (let t = 0; t < args.productionStartPeriod; t += 1) {
    const fcff = args.fcffUSD_total[t];
    if (!finite(fcff)) {
      return null;
    }
    preProductionSum += fcff;
  }

  return -preProductionSum;
}

function computeInitialCapexAbs(args: {
  capexUSD_total: Array<number | null>;
  productionStartPeriod: number;
}): number | null {
  let buildCapex = 0;
  for (let t = 0; t <= args.productionStartPeriod; t += 1) {
    const capex = args.capexUSD_total[t];
    if (!finite(capex)) {
      return null;
    }
    buildCapex += Math.abs(capex);
  }

  return buildCapex;
}

export function computeLista3aProjectEfficiencyMetrics(args: {
  masterN: number;
  productionStartPeriod: number | null;
  discountRate: number;
  fcffUSD_total: Array<number | null>;
  ebitUSD_total: Array<number | null>;
  capexUSD_total: Array<number | null>;
}): { metrics: Lista3aProjectEfficiencyMetrics; warnings: string[] } {
  const warnings: string[] = [];
  const out = makeNullLista3aProjectEfficiencyMetrics();

  const expectedLength = args.masterN + 1;
  if (
    args.fcffUSD_total.length !== expectedLength
    || args.ebitUSD_total.length !== expectedLength
    || args.capexUSD_total.length !== expectedLength
  ) {
    warnings.push('payback: missing fcff series');
    return { metrics: out, warnings };
  }

  if (!Number.isInteger(args.productionStartPeriod)) {
    warnings.push('payback: missing fcff series');
    return { metrics: out, warnings };
  }

  const tp = args.productionStartPeriod as number;
  if (tp < 0 || tp > args.masterN) {
    warnings.push('payback: missing fcff series');
    return { metrics: out, warnings };
  }

  const initialCapexAbs = computeInitialCapexAbs({
    capexUSD_total: args.capexUSD_total,
    productionStartPeriod: tp,
  });
  const preProductionDeficit = computePreProductionDeficit({
    fcffUSD_total: args.fcffUSD_total,
    productionStartPeriod: tp,
  });

  if (preProductionDeficit === null || !finite(preProductionDeficit)) {
    warnings.push('payback: missing fcff series');
    return { metrics: out, warnings: [...new Set(warnings)] };
  }

  const productionFcffFinite: number[] = [];
  for (let t = tp; t <= args.masterN; t += 1) {
    const value = args.fcffUSD_total[t];
    if (finite(value) && value > 0) {
      productionFcffFinite.push(value);
    }
  }

  if (productionFcffFinite.length > 0) {
    const annualAvgFcff = productionFcffFinite.reduce((sum, value) => sum + value, 0) / productionFcffFinite.length;
    if (annualAvgFcff > 0) {
      out.Payback_approx_years = toFiniteOrNull(preProductionDeficit / annualAvgFcff);
    }
  }

  if (out.Payback_approx_years === null) {
    warnings.push('payback: no positive production fcff');
  }

  let paybackReal: number | null = null;
  if (preProductionDeficit <= 0) {
    paybackReal = 0;
  } else {
    let cumulative = -preProductionDeficit;
    for (let t = tp; t <= args.masterN; t += 1) {
      const fcff = args.fcffUSD_total[t];
      if (!finite(fcff)) {
        warnings.push('payback: missing fcff series');
        paybackReal = null;
        break;
      }

      const prev = cumulative;
      cumulative = prev + fcff;
      if (prev < 0 && cumulative >= 0) {
        const fraction = (-prev) / (cumulative - prev);
        paybackReal = (t - tp) + fraction;
        break;
      }
    }
  }

  out.Payback_real_years = paybackReal === null ? null : toFiniteOrNull(round1(paybackReal));

  const roiEnd = Math.min(args.masterN, tp + 9);
  if (roiEnd >= tp) {
    let roiSum = 0;
    let roiOk = true;
    for (let t = tp; t <= roiEnd; t += 1) {
      const fcff = args.fcffUSD_total[t];
      if (!finite(fcff)) {
        roiOk = false;
        break;
      }
      roiSum += fcff;
    }

    if (roiOk && finite(initialCapexAbs) && initialCapexAbs !== 0) {
      out.ROI_10Y_pct = toFiniteOrNull((roiSum / initialCapexAbs) * 100);
    } else if (!roiOk) {
      warnings.push('roi10y: missing fcff in window');
    }
  }

  let ebitSum = 0;
  let lomCount = 0;
  for (let t = tp; t <= args.masterN; t += 1) {
    const ebit = args.ebitUSD_total[t];
    if (!finite(ebit)) {
      continue;
    }
    lomCount += 1;
    ebitSum += ebit;
  }

  if (lomCount > 0 && finite(initialCapexAbs) && initialCapexAbs !== 0) {
    const avgEbit = ebitSum / lomCount;
    out.LOM_average_EBIT_ROCE_pct = toFiniteOrNull((avgEbit / initialCapexAbs) * 100);
  }

  let discountedEbit = 0;
  let discountedCount = 0;
  for (let t = tp; t <= args.masterN; t += 1) {
    const ebit = args.ebitUSD_total[t];
    const dfToToday = 1 / (1 + args.discountRate) ** t;
    if (!finite(ebit) || !finite(dfToToday)) {
      continue;
    }
    discountedCount += 1;
    discountedEbit += ebit * dfToToday;
  }

  if (discountedCount > 0 && finite(initialCapexAbs) && initialCapexAbs !== 0) {
    out.LOM_discounted_EBIT_ROCE_pct = toFiniteOrNull((discountedEbit / initialCapexAbs) * 100);
  }

  return { metrics: out, warnings: [...new Set(warnings)] };
}
