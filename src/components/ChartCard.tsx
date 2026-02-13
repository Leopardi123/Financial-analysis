import { Chart } from "react-google-charts";

type ChartCardProps = {
  title: string;
  data: (string | number | Date | null)[][] | null;
  chartType: "ColumnChart" | "ComboChart" | "AreaChart" | "LineChart";
  height?: number;
  options?: Record<string, unknown>;
};

const DEFAULT_OPTIONS = {
  backgroundColor: "#e0e9ce",
  legend: { position: "bottom" },
  titleTextStyle: {
    fontSize: 16,
    bold: true,
  },
  colors: ["#0b0b0b"],
  hAxis: {
    slantedText: true,
    slantedTextAngle: 45,
  },
};

export default function ChartCard({
  title,
  data,
  chartType,
  height = 300,
  options = {},
}: ChartCardProps) {
  if (!data) {
    return (
      <div className="chart-card chart-empty">
        <div className="chart-title">{title}</div>
        <div className="chart-placeholder">No data yet.</div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <Chart
        chartType={chartType}
        data={data}
        width="100%"
        height={`${height}px`}
        options={{
          ...DEFAULT_OPTIONS,
          title,
          ...options,
        }}
      />
    </div>
  );
}
