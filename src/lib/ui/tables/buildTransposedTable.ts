export type TransposedTableInputRow = {
  label: string;
  unit?: string;
  values: Array<number | null>;
};

export type TransposedTableInput = {
  columns: string[];
  rows: TransposedTableInputRow[];
};

export type TransposedTableRow = {
  label: string;
  unit?: string;
  cells: Array<number | null>;
};

export type TransposedTableData = {
  columns: string[];
  rows: TransposedTableRow[];
};

export function buildTransposedTable(input: TransposedTableInput): TransposedTableData {
  const columnCount = input.columns.length;
  const rows = input.rows
    .filter((row) => Array.isArray(row.values) && row.values.length > 0)
    .map((row) => ({
      label: row.label,
      unit: row.unit,
      cells: input.columns.map((_, index) => {
        const value = row.values[index] ?? null;
        return Number.isFinite(value as number) ? (value as number) : null;
      }),
    }))
    .filter((row) => row.cells.length === columnCount)
    .filter((row) => row.cells.some((value) => value !== null));

  return {
    columns: [...input.columns],
    rows,
  };
}
