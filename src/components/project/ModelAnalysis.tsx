import { useMemo } from "react";
import { buildConvergencePackages, relativeGapPct } from "../../lib/modelAnalysis/convergence.ts";

type Props = {
  dcfPerShare: number | null;
  currency: string;
  rows: Array<{ ebitdaTarget?: number | null; evEbitda5xPerShare?: number | null; evEbitda6xPerShare?: number | null; evEbitda7xPerShare?: number | null }>;
};

const money = (value: number | null, currency: string) => value === null ? "n/a" : `${value.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} ${currency}`;

export default function ModelAnalysis({ dcfPerShare, currency, rows }: Props) {
  const model = useMemo(() => {
    const reference = rows.filter((row) => typeof row.ebitdaTarget === "number" && row.ebitdaTarget > 0 && typeof row.evEbitda6xPerShare === "number")
      .reduce<typeof rows[number] | null>((peak, row) => !peak || (row.evEbitda6xPerShare as number) > (peak.evEbitda6xPerShare as number) ? row : peak, null);
    const points = reference ? [
      { multiple: 5, valuePerShare: reference.evEbitda5xPerShare },
      { multiple: 6, valuePerShare: reference.evEbitda6xPerShare },
      { multiple: 7, valuePerShare: reference.evEbitda7xPerShare },
    ].filter((point): point is { multiple: number; valuePerShare: number } => typeof point.valuePerShare === "number" && Number.isFinite(point.valuePerShare)) : [];
    return { referenceValue: reference?.evEbitda6xPerShare ?? null, packages: buildConvergencePackages({ dcfPerShare, referenceMultiple: 6, multiplePoints: points, currency }) };
  }, [currency, dcfPerShare, rows]);
  const initialAbsolute = dcfPerShare !== null && model.referenceValue !== null ? Math.abs(dcfPerShare - model.referenceValue) : null;
  const initialRelative = dcfPerShare !== null && model.referenceValue !== null ? relativeGapPct(dcfPerShare, model.referenceValue) : null;

  return <section className="model-analysis" aria-labelledby="model-analysis-heading">
    <h3 id="model-analysis-heading">Modellanalys</h3>
    <p className="model-analysis-subtitle">Vilka sammanhängande förändringar i modellen krävs för att DCF- och EV/EBITDA-värderingen ska mötas?</p>
    <div className="model-analysis-baseline"><span>Referens: EV/EBITDA 6×</span><span>Startgap: {money(initialAbsolute, currency)}{initialRelative === null ? "" : ` (${initialRelative.toFixed(1)} %)`}</span><span>Tolerans: ≤ 2 %</span></div>
    <div className="model-analysis-scroll">
      {model.packages.map((item) => <article className="model-analysis-card" key={item.id}>
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
