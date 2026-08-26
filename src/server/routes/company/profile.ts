import { query, execute } from "../../../../api/_db.js";
import { fetchStableJson, requireFmpApiKey } from "../../../../api/_fmp.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import {
  getCorporateFinancingPreferences,
  upsertCorporateFinancingPreferences,
} from "../../../lib/db/corporateFinancingPreferences.js";

function parseFiscalYearEnd(raw: unknown) {
  if (typeof raw !== "string") {
    return null;
  }
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 4) {
    return null;
  }
  const compact = digits.slice(0, 4);
  const month = Number(compact.slice(0, 2));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return compact;
}

function fiscalYearEndMonth(value: string | null) {
  if (!value) {
    return null;
  }
  const month = Number(value.slice(0, 2));
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function parseBody(req: any): Record<string, unknown> {
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "POST") {
      const body = parseBody(req);
      if (body.action !== "saveCorporateFinancingPreferences") {
        res.status(400).json({ ok: false, error: "Unsupported action" });
        return;
      }
      const ticker = typeof body.symbol === "string"
        ? body.symbol.trim().toUpperCase()
        : typeof body.ticker === "string"
          ? body.ticker.trim().toUpperCase()
          : "";
      if (!ticker) {
        res.status(400).json({ ok: false, error: "Ticker is required" });
        return;
      }
      const extraSharesRaw = Number(body.extraShares ?? 0);
      if (!Number.isSafeInteger(extraSharesRaw) || extraSharesRaw < 0) {
        res.status(400).json({ ok: false, error: "extraShares must be a non-negative integer" });
        return;
      }
      const state = await upsertCorporateFinancingPreferences({
        symbol: ticker,
        financingPlan: body.financingPlan as any,
        financingPlanByProject: body.financingPlanByProject as any,
        extraShares: extraSharesRaw,
      });
      res.status(200).json({ ok: true, state });
      return;
    }

    await ensureSchema();
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    const ticker = typeof req.query?.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const companyRows = await query(
      `SELECT id, fiscal_year_end FROM ${tables.companiesV2} WHERE ticker = ?`,
      [ticker]
    );
    const companyId = Number(companyRows[0]?.id);
    const storedFiscalYearEnd = typeof companyRows[0]?.fiscal_year_end === "string"
      ? companyRows[0].fiscal_year_end
      : null;

    const payload = await fetchStableJson<Array<Record<string, unknown>>>("profile", {
      symbol: ticker,
    });
    const profile = payload?.[0] ?? null;
    const fromProfile = parseFiscalYearEnd(profile?.fiscalYearEnd);
    const fiscalYearEnd = fromProfile ?? storedFiscalYearEnd;

    if (Number.isFinite(companyId) && companyId > 0 && fromProfile && fromProfile !== storedFiscalYearEnd) {
      await execute(
        `UPDATE ${tables.companiesV2} SET fiscal_year_end = ? WHERE id = ?`,
        [fromProfile, companyId]
      );
    }

    const corporateFinancingPreferences = await getCorporateFinancingPreferences(ticker);

    res.status(200).json({
      ok: true,
      ticker,
      profile,
      fiscalYearEnd,
      fiscalYearEndMonth: fiscalYearEndMonth(fiscalYearEnd),
      corporateFinancingPreferences,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
