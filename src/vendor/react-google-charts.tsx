type ChartProps = {
  chartType?: string;
  data?: unknown[][];
  width?: string;
  height?: string;
  options?: Record<string, unknown>;
};

export function Chart({ data, height }: ChartProps) {
  if (!data || data.length <= 1) {
    return <div style={{ minHeight: height ?? "280px" }}>No chart data</div>;
  }

  const headers = data[0] as unknown[];
  const rows = data.slice(1) as unknown[][];

  return (
    <div style={{ minHeight: height ?? "280px", overflow: "auto", fontSize: 12 }}>
      <table>
        <thead>
          <tr>
            {headers.map((header, idx) => (
              <th key={`h-${idx}`}>{String(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(-12).map((row, rIdx) => (
            <tr key={`r-${rIdx}`}>
              {row.map((cell, cIdx) => (
                <td key={`c-${rIdx}-${cIdx}`}>{cell === null || cell === undefined ? "-" : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: "8px 0 0" }}>Chart library unavailable in this environment; showing tabular fallback.</p>
    </div>
  );
}
