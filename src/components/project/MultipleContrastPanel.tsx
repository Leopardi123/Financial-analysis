import type { CorporateQualityMultipleRow } from '../../lib/corporate/multipleContrast/types.ts';
import type { MultipleContrastBasis, MultipleContrastVisibility } from './multipleContrastPresentation.ts';

type Props = {
  open: boolean;
  onToggle: () => void;
  basis: MultipleContrastBasis;
  onBasisChange: (basis: MultipleContrastBasis) => void;
  visibility: MultipleContrastVisibility;
  onVisibilityChange: (visibility: MultipleContrastVisibility) => void;
  diagnosticRow: CorporateQualityMultipleRow | null;
  combinedAvailable: boolean;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const percent = (value: number | null) => finite(value) ? value.toLocaleString('sv-SE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 'n/a';
const multiple = (value: number | null, signed = false) => finite(value)
  ? `${signed && value > 0 ? '+' : ''}${value.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`
  : 'n/a';

const diagnosticLabels: Record<string, string> = {
  FULL_WINDOW: 'Fullt femårsfönster', SHORT_WINDOW: 'Kort fönster', INSUFFICIENT_REMAINING_PERIODS: 'För få kvarvarande perioder',
  NO_ACTIVE_ECONOMIC_YEARS: 'Inga aktiva ekonomiska år', NULL_EBITDA: 'EBITDA saknas', NULL_REVENUE: 'Intäkt saknas',
  NULL_SUSTAINING_CAPEX: 'Sustaining CAPEX saknas', NON_POSITIVE_EBITDA_MEAN: 'EBITDA-genomsnittet är inte positivt',
  NON_POSITIVE_POSITIVE_EBITDA_DENOMINATOR: 'Positiv EBITDA-nämnare saknas', NON_POSITIVE_REVENUE_DENOMINATOR: 'Positiv intäktsnämnare saknas',
  NEGATIVE_SUSTAINING_CAPEX: 'Negativ sustaining CAPEX', INVALID_FRONT_LOADING_INVARIANT: 'Ogiltig front-loading-invariant',
  EBITDA_MARGIN_ABOVE_ONE: 'EBITDA-marginal över 100 %',
};

export default function MultipleContrastPanel(props: Props) {
  const panelId = 'corporate-multiple-contrast-controls';
  const updateVisibility = (key: keyof MultipleContrastVisibility, checked: boolean) =>
    props.onVisibilityChange({ ...props.visibility, [key]: checked });
  const row = props.diagnosticRow;
  return (
    <div className="multiple-contrast-panel">
      <button type="button" className="multiple-contrast-toggle" aria-expanded={props.open} aria-controls={panelId} onClick={props.onToggle}>
        <span aria-hidden="true">{props.open ? '▾' : '▸'}</span> Multipelkontrast
      </button>
      {props.open && (
        <div id={panelId} className="multiple-contrast-content">
          <div className="multiple-contrast-controls">
            <fieldset>
              <legend>EBITDA-underlag</legend>
              <label><input type="radio" name="multiple-contrast-basis" value="annual" checked={props.basis === 'annual'} onChange={() => props.onBasisChange('annual')} /> Årlig EBITDA</label>
              <label><input type="radio" name="multiple-contrast-basis" value="forwardAverage" checked={props.basis === 'forwardAverage'} onChange={() => props.onBasisChange('forwardAverage')} /> 5Y framåtblickande genomsnitt</label>
            </fieldset>
            <fieldset>
              <legend>Overlays</legend>
              <label><input type="checkbox" checked={props.visibility.showStaticMultipleBand} onChange={(event) => updateVisibility('showStaticMultipleBand', event.target.checked)} /> Naturligt 5x–7x</label>
              <label><input type="checkbox" checked={props.visibility.showQualityMultipleBand} onChange={(event) => updateVisibility('showQualityMultipleBand', event.target.checked)} /> Kvalitetsjusterat spann</label>
              <label><input type="checkbox" checked={props.visibility.showCombinedTarget} onChange={(event) => updateVisibility('showCombinedTarget', event.target.checked)} /> Kombinerad riktkurs</label>
            </fieldset>
          </div>
          {props.visibility.showCombinedTarget && !props.combinedAvailable && (
            <p className="multiple-contrast-help">Välj ett EV/EBITDA-underlag för att visa kombinerad riktkurs.</p>
          )}
          {props.visibility.showQualityMultipleBand && (
            <section className="multiple-contrast-diagnostics" aria-label="Diagnostik för kvalitetsjusterad multipel">
              {row && finite(row.qualityMidMultiple) ? (
                <>
                  <div className="multiple-contrast-metrics">
                    <span><strong>År</strong>{row.calendarYear}</span>
                    <span><strong>Kvalitetsmultipel</strong>{multiple(row.qualityMidMultiple)}</span>
                    <span><strong>Aktiva ekonomiska år</strong>{row.remainingActiveEconomicYears ?? 'n/a'}</span>
                    <span><strong>Front-loading</strong>{percent(row.frontLoading5Y)}</span>
                    <span><strong>EBITDA-stabilitet</strong>{percent(row.ebitdaCv5Y)}</span>
                    <span><strong>Sustaining/EBITDA</strong>{percent(row.sustainingIntensity5Y)}</span>
                    <span><strong>EBITDA-marginal</strong>{percent(row.ebitdaMargin5Y)}</span>
                    {finite(row.negativeEbitdaTailShare) && row.negativeEbitdaTailShare > 0 && <span><strong>Negativ EBITDA-tail</strong>{percent(row.negativeEbitdaTailShare)}</span>}
                    {finite(row.economicGapYears) && row.economicGapYears > 0 && <span><strong>Ekonomiska gapår</strong>{row.economicGapYears}</span>}
                  </div>
                  <h4>Justeringar</h4>
                  <div className="multiple-contrast-adjustments">
                    <span>Livslängd: {multiple(row.remainingEconomicYearsAdjustment, true)}</span>
                    <span>Front-loading: {multiple(row.frontLoadingAdjustment, true)}</span>
                    <span>Stabilitet: {multiple(row.stabilityAdjustment, true)}</span>
                    <span>Sustaining: {multiple(row.sustainingIntensityAdjustment, true)}</span>
                    <span>Marginal: {multiple(row.marginAdjustment, true)}</span>
                  </div>
                  <p className="multiple-contrast-status"><strong>{row.shortWindow ? 'SHORT_WINDOW' : 'FULL_WINDOW'}</strong> · {row.qualityDiagnostics.map((code) => diagnosticLabels[code] ?? code).join(' · ')}</p>
                </>
              ) : (
                <>
                  <p className="multiple-contrast-help">Kvalitetsjusterad multipel kan inte beräknas för valt år.</p>
                  {row?.qualityDiagnostics.length ? <p className="multiple-contrast-status">{row.qualityDiagnostics.map((code) => diagnosticLabels[code] ?? code).join(' · ')}</p> : null}
                </>
              )}
              <p className="multiple-contrast-policy">Kvalitetsmultipeln är en deterministisk modellpolicy baserad på Corporate-serier, inte ett observerat marknadsgenomsnitt.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
