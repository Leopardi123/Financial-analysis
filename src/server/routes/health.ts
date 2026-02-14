import { query } from "../../../api/_db.js";

type TableRow = { name?: unknown };
type CountRow = { total?: unknown };

function maskDbIdentifier(value: string | undefined) {
  if (!value) {
    return "unknown";
  }

  try {
    const parsed = new URL(value);
    const host = parsed.host || "unknown-host";
    const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${host}${pathname}`;
  } catch {
    return "invalid-url";
  }
}

async function tableCount(table: string) {
  const rows = (await query(`SELECT COUNT(*) AS total FROM ${table}`)) as CountRow[];
  const raw = rows[0]?.total;
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const tableRows = (await query(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC"
    )) as TableRow[];
    const tables = tableRows.map((row) => String(row.name ?? "")).filter(Boolean);

    const hasCompanies = tables.includes("companies");
    const secondaryTable = tables.includes("company_master") ? "company_master" : "companies";

    const counts: Record<string, number | null> = {
      companies_v2: tables.includes("companies_v2") ? await tableCount("companies_v2") : null,
      [secondaryTable]: hasCompanies || secondaryTable === "company_master" ? await tableCount(secondaryTable) : null,
    };

    res.status(200).json({
      ok: true,
      db_driver: "turso",
      db_identifier: maskDbIdentifier(process.env.TURSO_DATABASE_URL),
      tables,
      counts,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
