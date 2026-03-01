import type { OperationsGridModel } from '../pages/projectOperationsGrid.ts';

type DataRow = { type: 'data'; label: string; values: Array<number | null> };
type DividerRow = { type: 'divider'; label: string };
export type ProjectExcelGridRow = DataRow | DividerRow;

function asYear(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function harmonizeProjectExcelGrid(args: {
  base: OperationsGridModel;
  rows: ProjectExcelGridRow[];
  productionStartPeriod: number | null;
}): Pick<OperationsGridModel, 'columnCount' | 'years' | 'tIndex' | 'tMinusTp' | 'warnings'> {
  const { base, rows, productionStartPeriod } = args;
  const inferredColumnCount = rows.reduce((max, row) => {
    if (row.type !== 'data') return max;
    return Math.max(max, row.values.length);
  }, base.columnCount);

  if (inferredColumnCount <= base.columnCount) {
    return {
      columnCount: base.columnCount,
      years: base.years,
      tIndex: base.tIndex,
      tMinusTp: base.tMinusTp,
      warnings: base.warnings,
    };
  }

  const years = [...base.years];
  const tIndex = [...base.tIndex];
  const tMinusTp = [...base.tMinusTp];

  let rollingYear = years.length > 0 ? asYear(years[years.length - 1]) : null;
  for (let t = base.columnCount; t < inferredColumnCount; t += 1) {
    rollingYear = rollingYear === null ? null : rollingYear + 1;
    years.push(rollingYear === null ? '—' : String(rollingYear));
    tIndex.push(String(t));
    if (!Number.isInteger(productionStartPeriod)) {
      tMinusTp.push('—');
    } else {
      const delta = t - (productionStartPeriod as number);
      tMinusTp.push(delta < 0 ? '' : String(delta));
    }
  }

  return {
    columnCount: inferredColumnCount,
    years,
    tIndex,
    tMinusTp,
    warnings: [...base.warnings, `Grid columns expanded from ${base.columnCount} to ${inferredColumnCount} to match derived series length.`],
  };
}
