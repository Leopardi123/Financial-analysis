type Handler = (req: any, res: any) => Promise<void> | void;

const ROUTE_MAP: Record<string, () => Promise<{ default: Handler }>> = {
  "admin/companies": () => import("../src/server/routes/admin/companies.js"),
  "admin/init-db": () => import("../src/server/routes/admin/init-db.js"),
  "admin/refresh-companies": () => import("../src/server/routes/admin/refresh-companies.js"),
  companies: () => import("../src/server/routes/companies.js"),
  "companies/search": () => import("../src/server/routes/companies/search.js"),
  "company/fields": () => import("../src/server/routes/company/fields.js"),
  "company/index": () => import("../src/server/routes/company/index.js"),
  "company/list": () => import("../src/server/routes/company/list.js"),
  "company/price": () => import("../src/server/routes/company/price.js"),
  "company/profile": () => import("../src/server/routes/company/profile.js"),
  "company/refresh": () => import("../src/server/routes/company/refresh.js"),
  "cron/refresh": () => import("../src/server/routes/cron/refresh.js"),
  "cron/refresh-companies": () => import("../src/server/routes/cron/refresh-companies.js"),
  health: () => import("../src/server/routes/health.js"),
  "sector/manual-input": () => import("../src/server/routes/sector/manual-input.js"),
  "sector/map-companies": () => import("../src/server/routes/sector/map-companies.js"),
  "sector/overview": () => import("../src/server/routes/sector/overview.js"),
};

export default async function handler(req: any, res: any) {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const p = pathname.startsWith("/api") ? pathname.slice(4) : pathname;
  const segments = p.split("/").filter(Boolean);
  const routeKey = segments.join("/");

  let matched = "none";
  const setDebugHeaders = () => {
    res.setHeader("x-api-pathname", pathname);
    res.setHeader("x-api-segments", JSON.stringify(segments));
    res.setHeader("x-api-routekey", routeKey);
    res.setHeader("x-api-matched", matched);
  };

  setDebugHeaders();

  console.log("[api router] req.url", req.url ?? "");
  console.log("[api router] pathname", pathname);
  console.log("[api router] segments", JSON.stringify(segments));

  try {
    if (req.method === "GET" && segments[0] === "debug" && segments[1] === "routes") {
      matched = "debug/routes";
      setDebugHeaders();
      const routes = Object.keys(ROUTE_MAP)
        .sort()
        .map((key) => ({ method: "ANY", key, path: `/api/${key}` }));
      res.status(200).json({ ok: true, routes });
      return;
    }

    if (req.method === "GET" && segments[0] === "debug" && segments[1] === "info") {
      matched = "debug/info";
      setDebugHeaders();
      res.status(200).json({
        ok: true,
        git: {
          sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        },
        vercel: {
          env: process.env.VERCEL_ENV ?? null,
          region: process.env.VERCEL_REGION ?? null,
        },
        router: {
          pathname,
          segments,
          routeKey,
        },
      });
      return;
    }

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
