import { useState } from 'react';
import { Chart } from 'react-google-charts';
import { buildValueRangeChartOptions, VALUE_RANGE_CHART_COLORS, type ValueRangeFocusSeries } from './valueRangeChartOptions';

type Props = {
  data: unknown[][];
  ticks: unknown[];
  yearMin: number;
  yearMax: number;
  peakYear: number;
  valueWindow: { min: number; max: number };
  currencyCode?: string;
  overlaySeries?: Record<number, Record<string, unknown>>;
  legendItems?: Array<{ label: string; className: string }>;
};

/** Shared chart presentation for Project and Corporate, including the peak-year reference line. */
export default function ValueRangeChart({ data, ticks, yearMin, yearMax, peakYear, valueWindow, currencyCode, overlaySeries, legendItems = [] }: Props) {
  const [focusSeries, setFocusSeries] = useState<ValueRangeFocusSeries>(null);
  const left = 64;
  const right = 56;
  const ratio = yearMax === yearMin ? 0 : (peakYear - yearMin) / (yearMax - yearMin);
  const focusKeyForLabel = (label: string): Exclude<ValueRangeFocusSeries, null> | null => {
    if (label === 'DCF') return 'dcf';
    if (label === 'NAV') return 'nav';
    return null;
  };

  return (
    <div className="value-range-chart-with-legend">
      <div style={{ position: 'relative', width: '100%', height: 220 }}>
        <Chart
          chartType="ComboChart"
          width="100%"
          height="220px"
          data={data as never}
          options={buildValueRangeChartOptions({ currencyCode, ticks, yearMin, yearMax, valueWindow, overlaySeries, focusSeries })}
        />
        <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', top: 14, bottom: 56, left: `calc(${left}px + (100% - ${left + right}px) * ${ratio})`, width: 1, background: 'rgba(31, 41, 55, 0.22)' }} />
      </div>
      {legendItems.length > 0 && (
        <div className="multiple-contrast-legend" aria-label="Aktiva grafserier">
          {legendItems.map((item) => {
            const focusKey = focusKeyForLabel(item.label);
            const isFocused = focusKey !== null && focusSeries === focusKey;
            const isDimmed = focusKey !== null && focusSeries !== null && focusSeries !== focusKey;
            if (focusKey === null) {
              return <span key={item.label}><i className={item.className} aria-hidden="true" />{item.label}</span>;
            }
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={isFocused}
                aria-label={`${item.label}: ${isFocused ? 'ta bort fokus' : 'framhäv serie'}`}
                onClick={() => setFocusSeries((current) => current === focusKey ? null : focusKey)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: 0,
                  border: 0,
                  borderRadius: 0,
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  lineHeight: 'inherit',
                  opacity: isDimmed ? 0.42 : 1,
                  fontWeight: isFocused ? 700 : 400,
                }}
              >
                <i
                  className={item.className}
                  aria-hidden="true"
                  style={{
                    background: VALUE_RANGE_CHART_COLORS.boundary,
                    height: isFocused ? 4 : 3,
                    boxShadow: isFocused ? '0 0 5px rgba(44, 62, 80, 0.45)' : 'none',
                  }}
                />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
