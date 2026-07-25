export type ValuationMetricMap = Record<string, { value: number | null; reason?: string | null }>;

/** Chart points are projections of the exact List 2 object rendered by the table. */
export function resolveValuationChartMetrics(metrics: ValuationMetricMap | undefined) {
  const value = (key: string) => metrics?.[key]?.value ?? null;
  return {
    npvLow: value('NPV_perShare'),
    npvHigh: value('DCF_Target_discounted_perShare'),
    tpLow: value('NAV_prodStart_perShare'),
    tpHigh: value('DCF_perShare'),
    parity: {
      NPV_perShare: value('NPV_perShare'), NAV_perShare: value('NAV_perShare'),
      NPV_prodStart_perShare: value('NPV_prodStart_perShare'), NAV_prodStart_perShare: value('NAV_prodStart_perShare'),
      DCF_perShare: value('DCF_perShare'), DCF_Target_discounted_perShare: value('DCF_Target_discounted_perShare'),
      CF_LOM_Target_perShare: value('CF_LOM_Target_perShare'),
    },
  };
}
