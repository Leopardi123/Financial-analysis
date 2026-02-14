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

  res.setHeader("x-api-pathname", pathname);
  res.setHeader("x-api-segments", JSON.stringify(segments));

  try {
    if (
      req.method === "GET" &&
      segments[0] === "debug" &&
      segments[1] === "routes"
    ) {
      const routes = [
        { method: "GET", path: "/api/debug/routes" },
        ...Object.keys(ROUTE_MAP)
          .sort()
          .map((routeKey) => ({ method: "ANY", path: `/api/${routeKey}` })),
      ];
      res.status(200).json({ ok: true, routes });
      return;
    }

    if (req.method === "GET" && segments[0] === "company" && segments[1] === "list") {
      const mod = await import("../src/server/routes/company/list.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "company" && segments[1] === "price") {
      const mod = await import("../src/server/routes/company/price.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "company" && segments[1] === "profile") {
      const mod = await import("../src/server/routes/company/profile.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "sector" && segments[1] === "overview") {
      const mod = await import("../src/server/routes/sector/overview.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments[0] === "sector" && segments[1] === "manual-input") {
      const mod = await import("../src/server/routes/sector/manual-input.js");
      await mod.default(req, res);
      return;
    }

    if (req.method === "GET" && segments.length === 1 && segments[0] === "health") {
      const mod = await import("../src/server/routes/health.js");
      await mod.default(req, res);
      return;
    }

    const routeKey = segments.join("/");
    const load = ROUTE_MAP[routeKey];
    if (!load) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    const mod = await load();
    await mod.default(req, res);
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
