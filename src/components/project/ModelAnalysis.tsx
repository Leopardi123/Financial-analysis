import { useMemo } from "react";
import { buildConvergencePackages, relativeGapPct } from "../../lib/modelAnalysis/convergence.ts";
import { buildEconomicConvergence, solveDiscountRate, type EconomicModelInput } from "../../lib/modelAnalysis/economicConvergence.ts";
import type { CorporateSnapshotSeries } from "../../lib/corporate/snapshot/types.ts";

type Props = {
  dcfPerShare: number | null;
  currency: string;
  rows: Array<{ ebitdaTarget?: number | null; evEbitda5xPerShare?: number | null; evEbitda6xPerShare?: number | null; evEbitda7xPerShare?: number | null }>;
  series?: CorporateSnapshotSeries | null;
  discountRate?: number | null;
  fx?: number | null;
  shares?: number | null;
  netCashTarget?: number | null;
};

const money = (value: number | null, currency: string) => value === null ? "n/a" : `${value.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} ${currency}`;

export default function ModelAnalysis({ dcfPerShare, currency, rows, series, discountRate, fx, shares, netCashTarget }: Props) {
  const model = useMemo(() => {
    const reference = rows.filter((row) => typeof row.ebitdaTarget === "number" && row.ebitdaTarget > 0 && typeof row.evEbitda6xPerShare === "number")
      .reduce<typeof rows[number] | null>((peak, row) => !peak || (row.evEbitda6xPerShare as number) > (peak.evEbitda6xPerShare as number) ? row : peak, null);
    const points = reference ? [
      { multiple: 5, valuePerShare: reference.evEbitda5xPerShare },
      { multiple: 6, valuePerShare: reference.evEbitda6xPerShare },
      { multiple: 7, valuePerShare: reference.evEbitda7xPerShare },
    ].filter((point): point is { multiple: number; valuePerShare: number } => typeof point.valuePerShare === "number" && Number.isFinite(point.valuePerShare)) : [];
    const referenceValue = reference?.evEbitda6xPerShare ?? null;
    const referencePeriod = reference ? rows.indexOf(reference) : -1;
    const economicInput: EconomicModelInput | null = series && typeof discountRate === 'number' && typeof fx === 'number' && typeof shares === 'number' && shares > 0 && typeof netCashTarget === 'number' && typeof dcfPerShare === 'number' && typeof referenceValue === 'number' && referencePeriod >= 0 ? {
      series, discountRate, fx, shares, netCashTarget, referencePeriod, dcfPerShare, evPerShare: referenceValue,
      hasRoyaltyRules: Boolean(series.royaltiesDetail?.length),
    } : null;
    const economic = economicInput ? [...buildEconomicConvergence(economicInput), solveDiscountRate(economicInput)].filter((item): item is NonNullable<typeof item> => item !== null) : [];
    return { referenceValue, packages: buildConvergencePackages({ dcfPerShare, referenceMultiple: 6, multiplePoints: points, currency }), economic };
  }, [currency, dcfPerShare, discountRate, fx, netCashTarget, rows, series, shares]);
  const initialAbsolute = dcfPerShare !== null && model.referenceValue !== null ? Math.abs(dcfPerShare - model.referenceValue) : null;
  const initialRelative = dcfPerShare !== null && model.referenceValue !== null ? relativeGapPct(dcfPerShare, model.referenceValue) : null;

  return <section className="model-analysis" aria-labelledby="model-analysis-heading">
    <h3 id="model-analysis-heading">Modellanalys</h3>
    <p className="model-analysis-subtitle">Vilka sammanhängande förändringar i modellen krävs för att DCF- och EV/EBITDA-värderingen ska mötas?</p>
    <div className="model-analysis-baseline"><span>Referens: EV/EBITDA 6×</span><span>Startgap: {money(initialAbsolute, currency)}{initialRelative === null ? "" : ` (${initialRelative.toFixed(1)} %)`}</span><span>Tolerans: ≤ 2 %</span></div>
    <div className="model-analysis-scroll">
      {model.economic.map((item) => <article className="model-analysis-card" key={`economic-${item.id}`}>
        <div className="model-analysis-card-head"><h4>{item.name}</h4><span className={`model-analysis-status ${item.status === "Fullt beräkningsbart" ? "is-computable" : ""}`}>{item.status}</span></div>
        <dl><div><dt>Styrande förändring</dt><dd>{item.changeLabel}</dd></div><div><dt>DCF/NAV per aktie</dt><dd>{money(item.dcfBefore, currency)} → {money(item.dcfAfter, currency)}</dd></div><div><dt>EV/EBITDA per aktie</dt><dd>{money(item.evBefore, currency)} → {money(item.evAfter, currency)}</dd></div><div><dt>Startgap / restgap</dt><dd>{item.startGapPct.toFixed(2)} % / {item.residualGapPct.toFixed(2)} %</dd></div><div><dt>Gap stängt</dt><dd>{item.gapClosedPct.toFixed(1)} %</dd></div></dl>
        <ul>{item.effects.map((effect) => <li key={effect.label}>{effect.label}: {money(effect.before, effect.unit)} → {money(effect.after, effect.unit)}</li>)}</ul>
        {typeof item.neutralRoyaltyBuybackUSD === 'number' && <dl><div><dt>Ekonomiskt neutralt högsta återköpspris</dt><dd>{money(item.neutralRoyaltyBuybackUSD, 'USD')}</dd></div><div><dt>Högsta pris inom tolerans</dt><dd>{money(item.convergenceRoyaltyBuybackUSD ?? null, 'USD')}</dd></div></dl>}
      </article>)}
      {model.packages.filter((item) => !model.economic.some((economic) => economic.id === item.id || (economic.id === 'opex' && item.id === 'cost'))).map((item) => <article className="model-analysis-card" key={item.id}>
        <div className="model-analysis-card-head"><h4>{item.name}</h4><span className={`model-analysis-status ${item.status === "Fullt beräkningsbart" ? "is-computable" : ""}`}>{item.status}</span></div>
        {item.missingRelation ? <p className="model-analysis-missing"><strong>Orsak:</strong> {item.missingRelation}</p> : <>
          <dl><div><dt>Styrande antagande</dt><dd>{item.changedAssumptions.join(", ")}</dd></div><div><dt>Krävd förändring</dt><dd>{item.requiredChange}</dd></div></dl>
          <ul>{item.effects.map((effect) => <li key={effect}>{effect}</li>)}</ul>
          <dl><div><dt>DCF/NAV per aktie</dt><dd>{money(item.dcfBefore, currency)} → {money(item.dcfAfter, currency)}</dd></div><div><dt>EV/EBITDA per aktie</dt><dd>{money(item.multipleBefore, currency)} → {money(item.multipleAfter, currency)}</dd></div><div><dt>Kvarvarande gap</dt><dd>{money(item.absoluteGap, currency)} ({item.relativeGapPct?.toFixed(2)} %)</dd></div><div><dt>Ytterligare kapital / utspädning</dt><dd>{money(item.additionalCapital, currency)} / {item.dilutionPct?.toFixed(1)} %</dd></div></dl>
        </>}
        <p className="model-analysis-conclusion">{item.conclusion}</p>
      </article>)}
    </div>
    <p className="model-analysis-disclaimer">Analysen visar endast vilka förändringar i den befintliga ekonomiska modellen som matematiskt krävs – inte vad som är möjligt i verkligheten.</p>
  </section>;
}
