type Handler = (req: any, res: any) => Promise<void> | void;

const ROUTE_MAP: Record<string, () => Promise<{ default: Handler }>> = {
  "admin/companies": () => import("../src/server/routes/admin/companies.js"),
  "admin/init-db": () => import("../src/server/routes/admin/init-db.js"),
  companies: () => import("../src/server/routes/companies.js"),
  "company/fields": () => import("../src/server/routes/company/fields.js"),
  "company/index": () => import("../src/server/routes/company/index.js"),
  "company/list": () => import("../src/server/routes/company/list.js"),
  "company/price": () => import("../src/server/routes/company/price.js"),
  "company/profile": () => import("../src/server/routes/company/profile.js"),
  "company/refresh": () => import("../src/server/routes/company/refresh.js"),
  "cron/refresh": () => import("../src/server/routes/cron/refresh.js"),
  "sector/manual-input": () => import("../src/server/routes/sector/manual-input.js"),
  "sector/map-companies": () => import("../src/server/routes/sector/map-companies.js"),
  "sector/overview": () => import("../src/server/routes/sector/overview.js"),
};

function toRouteKey(pathParam: string | string[] | undefined): string {
  if (Array.isArray(pathParam)) {
    return pathParam.join("/");
  }
  return typeof pathParam === "string" ? pathParam : "";
}

export default async function handler(req: any, res: any) {
  try {
    const routeKey = toRouteKey(req.query?.path);
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
