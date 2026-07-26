import { Chart } from 'react-google-charts';
import { buildValueRangeChartOptions } from './valueRangeChartOptions';

type Props = {
  data: unknown[][];
  ticks: unknown[];
  yearMin: number;
  yearMax: number;
  peakYear: number;
  valueWindow: { min: number; max: number };
  currencyCode?: string;
};

/** Shared chart presentation for Project and Corporate, including the peak-year reference line. */
export default function ValueRangeChart({ data, ticks, yearMin, yearMax, peakYear, valueWindow, currencyCode }: Props) {
  const left = 64;
  const right = 56;
  const ratio = yearMax === yearMin ? 0 : (peakYear - yearMin) / (yearMax - yearMin);
  return (
    <div style={{ position: 'relative', width: '100%', height: 220 }}>
      <Chart chartType="ComboChart" width="100%" height="220px" data={data as never} options={buildValueRangeChartOptions({ currencyCode, ticks, yearMin, yearMax, valueWindow })} />
      <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', top: 14, bottom: 56, left: `calc(${left}px + (100% - ${left + right}px) * ${ratio})`, width: 1, background: 'rgba(31, 41, 55, 0.22)' }} />
    </div>
  );
}
