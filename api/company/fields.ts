import { query } from "../_db.js";

export default async function handler(_req: any, res: any) {
  try {
    const rows = await query(
      `SELECT DISTINCT statement, field FROM financial_points ORDER BY field ASC`
    );

    const result = {
      income: [] as string[],
      balance: [] as string[],
      cashflow: [] as string[],
    };

    for (const row of rows) {
      const statement = String(row.statement ?? "");
      const field = String(row.field ?? "");
      if (!field) {
        continue;
      }
      if (statement === "income") {
        result.income.push(field);
      } else if (statement === "balance") {
        result.balance.push(field);
      } else if (statement === "cashflow") {
        result.cashflow.push(field);
      }
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
