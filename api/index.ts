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

const CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS = 10;

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
  const diagnostics = {
    warnings: [] as string[],
    errors: [] as string[],
    meta: {
      refresh,
      mode: "inline" as "inline" | "symbol",
      projectCount: 0,
    },
  };

  try {
    const [{ validateSnapshotRequest }, { loadProjectsForSymbol }, { parseProjectJsonV1 }, { computeProjectEngineFullProductionV1 }, { resolveProjectPricesToEngineInput }, { aggregateProjectsCorporateV1 }, { computeCorporateFinancing }, { deriveBuildFundingNeedUSD }, { buildCorporateSnapshot }, { resolveFxUSDToTarget }, { getTodayUtcDateString }, { fxKeyUSDTo }] = await Promise.all([
      import("../src/lib/api/validateSnapshotRequest.js"),
      import("../src/lib/api/loadProjectsForSymbol.js"),
      import("../src/lib/project/jsonv1/parse.js"),
      import("../src/lib/project/engineFullProductionV1.js"),
      import("../src/lib/project/jsonv1/resolvePrices.js"),
      import("../src/lib/corporate/aggregateProjects.js"),
      import("../src/lib/corporate/financing/compute.js"),
      import("../src/lib/corporate/financing/deriveBuildFundingNeed.js"),
      import("../src/lib/corporate/snapshot/buildCorporateSnapshot.js"),
      import("../src/lib/prices/fx/resolveFx.js"),
      import("../src/lib/prices/fx/date.js"),
      import("../src/lib/prices/fx/keys.js"),
    ]);

    const body = parseRequestBody(req);
    const validation = validateSnapshotRequest(body);
    diagnostics.warnings.push(...validation.warnings);

    if (!validation.ok) {
      diagnostics.errors.push(...validation.errors);
      res.status(400).json({ ok: false, diagnostics });
      return;
    }

    const input = validation.value;

    const projects = "symbol" in input
      ? await loadProjectsForSymbol(input.symbol)
      : input.projects;

    if ("symbol" in input) {
      diagnostics.meta.mode = "symbol";
      diagnostics.meta.symbol = input.symbol;
      if (projects.length === 0) {
        diagnostics.errors.push(`No stored projects found for symbol=${input.symbol}`);
        res.status(400).json({ ok: false, diagnostics });
        return;
      }
    }

    const resolverScenario = input.scenario.mode === 'percentile'
      ? { mode: 'percentile' as const, lookbackYears: input.scenario.lookbackYears, percentile: input.scenario.percentile }
      : input.scenario.mode === 'fixed'
        ? { mode: 'fixed' as const, fixedPriceByKey: input.scenario.fixedPriceByKey }
        : { mode: 'spot' as const };
    diagnostics.meta.projectCount = projects.length;
    diagnostics.meta.fxSource = input.fx.source;

    const requestedPriceKeys = new Set<string>();
    for (const project of projects) {
      const rawJson = project.rawJson as Record<string, unknown>;
      const metals = rawJson.metals;
      if (typeof metals === "object" && metals !== null) {
        const priceKeyByMetal = (metals as Record<string, unknown>).priceKeyByMetal;
        if (typeof priceKeyByMetal === "object" && priceKeyByMetal !== null) {
          for (const value of Object.values(priceKeyByMetal)) {
            if (typeof value === "string") {
              requestedPriceKeys.add(value);
            }
          }
        }

        const auPriceKey = (metals as Record<string, unknown>).auPriceKey;
        if (typeof auPriceKey === "string") {
          requestedPriceKeys.add(auPriceKey);
        }
      }
    }

    if (refresh && requestedPriceKeys.size > CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS) {
      diagnostics.errors.push(
        `refresh=1 exceeds max unique price keys (${CORPORATE_SNAPSHOT_MAX_REFRESH_KEYS}); received ${requestedPriceKeys.size}`,
      );
      res.status(400).json({ ok: false, diagnostics });
      return;
    }

    const projectsForBuildFunding = [] as Array<{
      projectId: string;
      productionStartPeriod: number;
      periodEndDatesUtc: string[];
    }>;

    const aggregation = await aggregateProjectsCorporateV1(
      {
        discountRate: input.discountRate,
        projects,
      },
      {
        projectToSeries: async ({ projectId, rawJson }) => {
          const parsed = parseProjectJsonV1(rawJson);
          const periodEndDatesUtc = parsed.engineInputWithoutPrices.periodEndDatesUtc;
          const productionStartPeriod = parsed.engineInputWithoutPrices.productionStartPeriod;
          if (!periodEndDatesUtc || periodEndDatesUtc.length === 0) {
            throw new Error(`Project ${projectId} is missing time.periodEndDatesUtc; required for corporate aggregation v1.`);
          }
          if (!Number.isInteger(productionStartPeriod)) {
            throw new Error(`Project ${projectId} is missing integer productionStartPeriod`);
          }

          projectsForBuildFunding.push({
            projectId,
            productionStartPeriod,
            periodEndDatesUtc,
          });

          const from = periodEndDatesUtc[0];
          const to = periodEndDatesUtc[periodEndDatesUtc.length - 1];

          const readHistoryRows = async ({ priceKey, from: rangeFrom, to: rangeTo }: { priceKey: PriceKey; from: string; to: string }) => {
            let history = await readHistoryRowsInRange({ priceKey, from: rangeFrom, to: rangeTo });
            if (refresh && history.missing) {
              await refreshHistoryRangeToMonthlyBlobs({ priceKey, from: rangeFrom, to: rangeTo });
              history = await readHistoryRowsInRange({ priceKey, from: rangeFrom, to: rangeTo });
            }
            return history;
          };

          const resolved = await resolveProjectPricesToEngineInput(
            { parsed, from, to, scenario: resolverScenario },
            { readHistoryRows },
          );

          diagnostics.warnings.push(...(resolved.diagnostics?.warnings ?? []));

          for (const [metal, series] of Object.entries(resolved.spotPriceUSDByMetal)) {
            const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
            series.forEach((value, index) => {
              if (value === null) {
                diagnostics.warnings.push(
                  `Missing price coverage for project=${projectId} metal=${metal} priceKey=${priceKey} targetDate=${periodEndDatesUtc[index]}`,
                );
              }
            });
          }

          resolved.aisc.auPriceUSDPerOz.forEach((value, index) => {
            if (value === null) {
              diagnostics.warnings.push(
                `Missing price coverage for project=${projectId} metal=Au priceKey=${parsed.engineInputWithoutPrices.auPriceKey} targetDate=${periodEndDatesUtc[index]}`,
              );
            }
          });

          const out = computeProjectEngineFullProductionV1(resolved);

          return {
            periodEndDatesUtc,
            capexUSD: out.capexUSD_used,
            fcffUSD: out.phase1.fcffUSD,
            sustainingCostUSD: out.phase1.sustainingCostUSD,
            payableAuEqOz: out.aisc.payableAuEqOz,
          };
        },
      },
    );

    diagnostics.warnings.push(...aggregation.diagnostics.notes);

    const firstProjectPeriodEnd = typeof projects[0]?.rawJson?.time === 'object' && projects[0]?.rawJson?.time !== null
      ? (projects[0].rawJson.time as Record<string, unknown>).periodEndDatesUtc
      : undefined;
    const t0AnchorDate = Array.isArray(firstProjectPeriodEnd) && typeof firstProjectPeriodEnd[0] === 'string'
      ? firstProjectPeriodEnd[0]
      : null;
    const anchorDateUtc = input.fx.anchor === 't0_period_end'
      ? (t0AnchorDate ?? getTodayUtcDateString())
      : getTodayUtcDateString();

    let buildFundingNeedUSD = input.buildFundingNeed_USD;
    if (buildFundingNeedUSD === undefined) {
      diagnostics.warnings.push(
        'buildFundingNeed_USD derived from capex schedule using first production date window',
      );
      buildFundingNeedUSD = deriveBuildFundingNeedUSD({
        corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
        capexUSD_total: aggregation.capexUSD_total,
        projects: projectsForBuildFunding,
      });

      if (buildFundingNeedUSD === null) {
        diagnostics.warnings.push(
          'buildFundingNeed_USD derivation returned null because capexUSD_total contains null in the build window',
        );
      }
    }

    let fxRate = input.fx_USD_to_TargetCurrency ?? null;
    if (input.fx.source === 'manual') {
      fxRate = input.fx.manual_fx_USD_to_TargetCurrency ?? input.fx_USD_to_TargetCurrency ?? null;
    } else {
      const fxScenario = input.fx.scenario.mode === 'percentile'
        ? { mode: 'percentile' as const, lookbackYears: input.fx.scenario.lookbackYears, percentile: input.fx.scenario.percentile }
        : input.fx.scenario.mode === 'fixed'
          ? {
              mode: 'fixed' as const,
              fixedFx: input.fx.scenario.fixedPriceByKey[fxKeyUSDTo(input.targetCurrency)],
            }
          : { mode: 'spot' as const };
      const resolvedFx = await resolveFxUSDToTarget({
        targetCurrency: input.targetCurrency,
        anchorDateUtc,
        scenario: fxScenario,
        allowRefresh: refresh,
      });
      diagnostics.warnings.push(...resolvedFx.warnings);
      fxRate = resolvedFx.fx;

      if (fxRate === null && input.fx_USD_to_TargetCurrency !== undefined) {
        fxRate = input.fx_USD_to_TargetCurrency;
        diagnostics.warnings.push('FX auto-resolve failed; using legacy fx_USD_to_TargetCurrency fallback');
      }
      if (fxRate === null) {
        diagnostics.errors.push('FX missing and auto-resolve failed.');
        res.status(400).json({ ok: false, diagnostics });
        return;
      }
    }

    const financing = computeCorporateFinancing({
      NPV_today_USD: aggregation.NPV_today_USD,
      targetCurrency: input.targetCurrency,
      fx_USD_to_TargetCurrency: fxRate as number,
      cash_t0_TargetCurrency: input.balanceSheet?.cash_t0_TargetCurrency ?? null,
      debt_t0_TargetCurrency: input.balanceSheet?.debt_t0_TargetCurrency ?? null,
      shares_current: input.market.shares_current,
      price_current_TargetCurrency: input.market.price_current_TargetCurrency,
      financingPlan: input.financingPlan,
      buildFundingNeed_USD: buildFundingNeedUSD,
    });

    const snapshot = buildCorporateSnapshot({
      targetCurrency: input.targetCurrency,
      aggregation,
      financing,
      market: {
        shares_current: input.market.shares_current,
        price_current_TargetCurrency: input.market.price_current_TargetCurrency,
        preferredEquity_TargetCurrency: input.market.preferredEquity_TargetCurrency,
        minorityInterest_TargetCurrency: input.market.minorityInterest_TargetCurrency,
      },
    });

    res.status(200).json({ ok: true, snapshot, diagnostics });
  } catch (error) {
    diagnostics.errors.push((error as Error).message);
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
  "debug/routes": async () => ({
    default: async (_req: any, res: any) => {
      const routes = Object.keys(ROUTE_MAP)
        .sort()
        .map((key) => ({ method: "ANY", key, path: `/api/${key}` }));
      res.status(200).json({ ok: true, routes });
    },
  }),
  health: () => import("../src/server/routes/health.js"),
  "sector/manual-input": () => import("../src/server/routes/sector/manual-input.js"),
  "sector/map-companies": () => import("../src/server/routes/sector/map-companies.js"),
  "sector/overview": () => import("../src/server/routes/sector/overview.js"),
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
