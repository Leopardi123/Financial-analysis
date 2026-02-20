type Handler = (req: any, res: any) => Promise<void> | void;

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
