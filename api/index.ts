import { query } from "./_db.js";
import { getLatestPriceCached } from "../src/lib/prices/latestCache.js";
import { readHistoryRowsInRange } from "../src/lib/prices/db/readHistory.js";
import { refreshHistoryRangeToMonthlyBlobs } from "../src/lib/prices/refreshHistory.js";
import { PRICE_TABLES } from "../src/lib/prices/db/schema.js";
import { PRICE_KEY_SET, type PriceKey } from "../src/lib/prices/keys.js";
import {
  deleteCompanyProject,
  getCompanyProject,
  listCompanyProjects,
  upsertCompanyProject,
} from "../src/lib/db/companyProjects.js";
import {
  validateCompanyProjectGetQuery,
  validateCompanyProjectKey,
  validateCompanyProjectListQuery,
  validateCompanyProjectUpsert,
} from "../src/lib/api/validateCompanyProjects.js";

type Handler = (req: any, res: any) => Promise<void> | void;


function parseRequestBody(req: any): unknown {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body;
}

function sendValidationError(res: any, error: string, details?: unknown): void {
  if (details === undefined) {
    res.status(400).json({ ok: false, error });
    return;
  }
  res.status(400).json({ ok: false, error, details });
}

async function handleCorporateSnapshot(req: any, res: any): Promise<void> {
  const refresh = String(req.query?.refresh ?? "") === "1";
  const debug = String(req.query?.debug ?? "") === "1";

  try {
    const [{ runCorporateSnapshotPipeline }] = await Promise.all([
      import("../src/lib/snapshot/runCorporateSnapshot.js"),
    ]);

    const body = parseRequestBody(req);
    const result = await runCorporateSnapshotPipeline({ body, refresh, debug });

    if (!result.ok) {
      res.status(400).json({ ok: false, diagnostics: result.diagnostics });
      return;
    }

    res.status(200).json({ ok: true, snapshot: result.snapshot, diagnostics: result.diagnostics });
  } catch (error) {
    const diagnostics = {
      warnings: [] as string[],
      errors: [(error as Error).message],
      meta: {
        refresh,
        mode: "inline" as "inline" | "symbol",
        projectCount: 0,
      },
    };
    res.status(400).json({ ok: false, diagnostics });
  }
}

function normalizePathSegments(req: any): string[] {
  const { pathname } = new URL(req?.url ?? "/", "http://localhost");
  const trimmed = pathname.startsWith("/api") ? pathname.slice(4) : pathname;

  return trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "api");
}

const ROUTE_MAP: Record<string, () => Promise<{ default: Handler }>> = {
  "admin/companies": () => import("../src/server/routes/admin/companies.js"),
  "admin/init-db": () => import("../src/server/routes/admin/init-db.js"),
  "admin/refresh-companies": () => import("../src/server/routes/admin/refresh-companies.js"),
  "admin/macro/ingest": () => import("../src/server/routes/admin/macro-ingest.js"),
  "admin/macro/run-engine": () => import("../src/server/routes/admin/macro-run-engine.js"),
  "admin/rebuild-macro-snapshot": () => import("../src/server/routes/admin/rebuild-macro-snapshot.js"),
  "admin/refresh-price-screen": () => import("../src/server/routes/admin/refresh-price-screen.js"),
  companies: () => import("../src/server/routes/companies.js"),
  "companies/search": () => import("../src/server/routes/companies/search.js"),
  company: () => import("../src/server/routes/company/index.js"),
  "company/fields": () => import("../src/server/routes/company/fields.js"),
  "company/index": () => import("../src/server/routes/company/index.js"),
  "company/list": () => import("../src/server/routes/company/list.js"),
  "company/price": () => import("../src/server/routes/company/price.js"),
  "company/profile": () => import("../src/server/routes/company/profile.js"),
  "company/refresh": () => import("../src/server/routes/company/refresh.js"),
  "cron/refresh": () => import("../src/server/routes/cron/refresh.js"),
  "cron/macro-refresh": () => import("../src/server/routes/cron/macro-refresh.js"),
  "cron/refresh-companies": () => import("../src/server/routes/cron/refresh-companies.js"),
  "debug/info": async () => ({
    default: async (req: any, res: any) => {
      const segments = normalizePathSegments(req);
      const routeKey = segments.join("/");
      res.status(200).json({
        ok: true,
        routeKey,
        segments,
        url: String(req.url ?? ""),
        queryPath: req.query?.path ?? null,
      });
    },
  }),
  "debug/npv-trace": () => import("../src/server/routes/debug/npv-trace.js"),
  "debug/routes": async () => ({
    default: async (_req: any, res: any) => {
      const routes = Object.keys(ROUTE_MAP)
        .sort()
        .map((key) => ({ method: "ANY", key, path: `/api/${key}` }));
      res.status(200).json({ ok: true, routes });
    },
  }),
  health: () => import("../src/server/routes/health.js"),
  "portfolio/admin/list": () => import("../src/server/routes/portfolio/admin/list.js"),
  "portfolio/admin/create": () => import("../src/server/routes/portfolio/admin/create.js"),
  "portfolio/admin/update": () => import("../src/server/routes/portfolio/admin/update.js"),
  "portfolio/admin/validate": () => import("../src/server/routes/portfolio/admin/validate.js"),
  "portfolio/snapshots/build": () => import("../src/server/routes/portfolio/snapshots/build.js"),
  "portfolio/snapshots/latest": () => import("../src/server/routes/portfolio/snapshots/latest.js"),
  "portfolio/history/build": () => import("../src/server/routes/portfolio/history/build.js"),
  "portfolio/history/latest": () => import("../src/server/routes/portfolio/history/latest.js"),
  "portfolio/history/series": () => import("../src/server/routes/portfolio/history/series.js"),
  "portfolio/history/series/total": () => import("../src/server/routes/portfolio/history/series-total.js"),
  "portfolio/risk/build": () => import("../src/server/routes/portfolio/risk/build.js"),
  "portfolio/risk/latest": () => import("../src/server/routes/portfolio/risk/latest.js"),
  "sector/manual-input": () => import("../src/server/routes/sector/manual-input.js"),
  "sector/map-companies": () => import("../src/server/routes/sector/map-companies.js"),
  "sector/overview": () => import("../src/server/routes/sector/overview.js"),
  "sector/global-macro": () => import("../src/server/routes/sector/global-macro.js"),
  "sector/commodity-snapshot": () => import("../src/server/routes/sector/commodity-snapshot.js"),
  "sector/company-commodity-override": () => import("../src/server/routes/sector/company-commodity-override.js"),
  "sector/company-mapping": () => import("../src/server/routes/sector/company-mapping.js"),
  "screening/price-snapshot": () => import("../src/server/routes/screening/price-snapshot.js"),
};

export default async function handler(req: any, res: any) {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const segments = normalizePathSegments(req);
  const routeKey = segments.join("/");
  const queryPath = req.query?.path ?? null;

  res.setHeader("x-debug-segments", JSON.stringify(segments));
  res.setHeader("x-debug-routekey", routeKey);
  res.setHeader("x-debug-url", String(req.url ?? ""));
  res.setHeader("x-debug-query-path", JSON.stringify(queryPath));

  let matched = "none";
  const setDebugHeaders = () => {
    res.setHeader("x-api-pathname", pathname);
    res.setHeader("x-api-segments", JSON.stringify(segments));
    res.setHeader("x-api-routekey", routeKey);
    res.setHeader("x-api-matched", matched);
  };

  setDebugHeaders();

  try {
    if (req.method === "GET" && segments[0] === "company" && segments[1] === "list") {
      matched = "company/list";
      setDebugHeaders();
      const mod = await import("../src/server/routes/company/list.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "company" && segments[1] === "price") {
      matched = "company/price";
      setDebugHeaders();
      const mod = await import("../src/server/routes/company/price.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "company" && segments[1] === "profile") {
      matched = "company/profile";
      setDebugHeaders();
      const mod = await import("../src/server/routes/company/profile.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "sector" && segments[1] === "overview") {
      matched = "sector/overview";
      setDebugHeaders();
      const mod = await import("../src/server/routes/sector/overview.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "sector" && segments[1] === "manual-input") {
      matched = "sector/manual-input";
      setDebugHeaders();
      const mod = await import("../src/server/routes/sector/manual-input.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "sector" && segments[1] === "global-macro") {
      matched = "sector/global-macro";
      setDebugHeaders();
      const mod = await import("../src/server/routes/sector/global-macro.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "prices" && segments[1] === "latest") {
      matched = "prices/latest";
      setDebugHeaders();
      const keysParam = String(req.query?.keys ?? "").trim();
      const keys = keysParam.split(",").map((key) => key.trim()).filter((key) => key.length > 0);
      if (keys.length === 0) {
        res.status(400).json({ ok: false, error: "keys query parameter is required" });
        return;
      }

      const mapRows = await query(
        `SELECT price_key, provider_symbol
         FROM ${PRICE_TABLES.providerMap}
         WHERE provider = 'FMP' AND price_key IN (${keys.map(() => "?").join(", ")})`,
        keys,
      ) as Array<{ price_key: string; provider_symbol: string }>;
      const symbolByKey = new Map(mapRows.map((row) => [String(row.price_key), String(row.provider_symbol)]));

      const data: Record<string, { price: number | null; asof_utc: string | null; provider: "FMP"; source_symbol: string | null }> = {};
      for (const key of keys) {
        if (!PRICE_KEY_SET.has(key)) {
          data[key] = { price: null, asof_utc: null, provider: "FMP", source_symbol: null };
          continue;
        }
        const symbol = symbolByKey.get(key);
        if (!symbol) {
          data[key] = { price: null, asof_utc: null, provider: "FMP", source_symbol: null };
          continue;
        }

        try {
          const latest = await getLatestPriceCached(key as PriceKey, symbol);
          data[key] = { price: latest.price, asof_utc: latest.asof_utc, provider: "FMP", source_symbol: symbol };
        } catch {
          data[key] = { price: null, asof_utc: null, provider: "FMP", source_symbol: symbol };
        }
      }

      res.status(200).json({ asof_utc: new Date().toISOString(), data });
      return;
    }

    if (req.method === "GET" && segments[0] === "prices" && segments[1] === "history") {
      matched = "prices/history";
      setDebugHeaders();
      const key = String(req.query?.key ?? "").trim();
      const from = String(req.query?.from ?? "").trim();
      const to = String(req.query?.to ?? "").trim();
      const refresh = String(req.query?.refresh ?? "") === "1";
  const debug = String(req.query?.debug ?? "") === "1";

      if (!PRICE_KEY_SET.has(key)) {
        res.status(400).json({ ok: false, error: "invalid key" });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
        res.status(400).json({ ok: false, error: "invalid from/to" });
        return;
      }

      const mapRows = await query(
        `SELECT provider_symbol
         FROM ${PRICE_TABLES.providerMap}
         WHERE provider = 'FMP' AND price_key = ?
         LIMIT 1`,
        [key],
      ) as Array<{ provider_symbol: string }>;
      const sourceSymbol = mapRows[0]?.provider_symbol ? String(mapRows[0].provider_symbol) : null;

      if (refresh) {
        await refreshHistoryRangeToMonthlyBlobs({ priceKey: key as PriceKey, from, to });
      }

      const history = await readHistoryRowsInRange({ priceKey: key as PriceKey, from, to });
      res.status(200).json({
        key,
        from,
        to,
        rows: history.rows,
        provider: "FMP",
        source_symbol: sourceSymbol,
        meta: { missing: history.missing },
      });
      return;
    }

    if (req.method === "POST" && segments[0] === "snapshot" && segments[1] === "corporate") {
      matched = "snapshot/corporate";
      setDebugHeaders();
      await handleCorporateSnapshot(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "company-projects" && segments.length === 1) {
      matched = "company-projects";
      setDebugHeaders();

      const validation = validateCompanyProjectListQuery(req.query);
      if (!validation.ok) {
        sendValidationError(res, validation.error, validation.details);
        return;
      }

      const projects = await listCompanyProjects(validation.value.symbol);
      res.status(200).json({ ok: true, symbol: validation.value.symbol, projects });
      return;
    }

    if (req.method === "GET" && segments[0] === "company-projects" && segments[1] === "get") {
      matched = "company-projects/get";
      setDebugHeaders();

      const validation = validateCompanyProjectGetQuery(req.query);
      if (!validation.ok) {
        sendValidationError(res, validation.error, validation.details);
        return;
      }

      const project = await getCompanyProject(validation.value.symbol, validation.value.project_id);
      if (!project) {
        res.status(404).json({ ok: false, error: "Project not found" });
        return;
      }

      res.status(200).json({
        ok: true,
        project: {
          symbol: project.symbol,
          project_id: project.project_id,
          project_name: project.project_name,
          json_version: project.json_version,
          raw_json: JSON.parse(project.raw_json),
          updated_at_utc: project.updated_at_utc,
        },
      });
      return;
    }

    if (req.method === "POST" && segments[0] === "company-projects" && segments[1] === "upsert") {
      matched = "company-projects/upsert";
      setDebugHeaders();

      const body = parseRequestBody(req);
      const validation = validateCompanyProjectUpsert(body);
      if (!validation.ok) {
        sendValidationError(res, validation.error, validation.details);
        return;
      }

      const project = await upsertCompanyProject({
        symbol: validation.value.symbol,
        project_id: validation.value.project_id,
        project_name: validation.value.project_name,
        json_version: validation.value.json_version,
        raw_json: JSON.stringify(validation.value.raw_json),
      });

      res.status(200).json({
        ok: true,
        project_id: project.project_id,
        symbol: project.symbol,
        updated_at_utc: project.updated_at_utc,
      });
      return;
    }

    if (req.method === "POST" && segments[0] === "company-projects" && segments[1] === "delete") {
      matched = "company-projects/delete";
      setDebugHeaders();

      const body = parseRequestBody(req);
      const validation = validateCompanyProjectKey(body);
      if (!validation.ok) {
        sendValidationError(res, validation.error, validation.details);
        return;
      }

      const project = await getCompanyProject(validation.value.symbol, validation.value.project_id);
      if (!project) {
        res.status(404).json({ ok: false, error: "Project not found" });
        return;
      }

      await deleteCompanyProject(validation.value.symbol, validation.value.project_id);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "GET" && segments.length === 1 && segments[0] === "health") {
      matched = "health";
      setDebugHeaders();
      const mod = await import("../src/server/routes/health.js");
      await mod.default(req, res);
      return;
    }

    const load = ROUTE_MAP[routeKey];
    if (!load) {
      matched = "none";
      setDebugHeaders();
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }

    matched = routeKey;
    setDebugHeaders();
    const mod = await load();
    await mod.default(req, res);
  } catch (error) {
    setDebugHeaders();
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
