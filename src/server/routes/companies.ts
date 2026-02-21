import { query } from "../../../api/_db.js";
import { refreshCompaniesMaster, searchCompaniesByName, type RefreshCompaniesSummary } from "../../../api/_company_master.js";
import { ensureSchema } from "../../../api/_migrate.js";

function extractBearer(authHeader: string | string[] | undefined) {
  if (typeof authHeader !== "string") {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function assertCompaniesSyncSecret(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers["x-cron-secret"];
  const normalized = Array.isArray(provided) ? provided[0] : provided;
  const bearer = extractBearer(req.headers.authorization);

  if (!secret || (normalized !== secret && bearer !== secret)) {
    const error = new Error("Unauthorized: missing or invalid x-cron-secret header");
    (error as Error & { status?: number; header?: string }).status = 401;
    (error as Error & { status?: number; header?: string }).header = "x-cron-secret";
    throw error;
  }
}

function parseDbIdentity() {
  const raw = process.env.TURSO_DATABASE_URL;
  if (!raw) {
    return { dbHost: null as string | null, dbName: null as string | null };
  }

  try {
    const parsed = new URL(raw);
    const dbHost = parsed.hostname || null;
    const path = parsed.pathname.replace(/^\/+/, "");
    const dbName = path ? path.split("/")[0] : null;
    return { dbHost, dbName };
  } catch {
    return { dbHost: null, dbName: null };
  }
}

async function readCompaniesCount() {
  const rows = await query("SELECT COUNT(*) as n FROM companies");
  const value = Number((rows[0] as { n?: unknown } | undefined)?.n ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function diagnosticsFromError(error: unknown) {
  const typed = error as Error & {
    code?: string;
    diagnostics?: RefreshCompaniesSummary;
    cause?: unknown;
  };
  const first = typed.diagnostics?.firstError;
  if (first) {
    return first;
  }

  const cause = typed.cause as Error & { code?: string } | undefined;
  return {
    message: cause?.message ?? typed.message,
    code: cause?.code ?? typed.code,
    stackPreview: (cause?.stack ?? typed.stack)?.split("\n").slice(0, 3).join("\n"),
  };
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await ensureSchema();

    if (req.method === "POST") {
      assertCompaniesSyncSecret(req);
      const { dbHost, dbName } = parseDbIdentity();
      const beforeCount = await readCompaniesCount();

      let summary: RefreshCompaniesSummary | null = null;
      let refreshError: unknown = null;

      try {
        summary = await refreshCompaniesMaster();
      } catch (error) {
        refreshError = error;
        summary = (error as Error & { diagnostics?: RefreshCompaniesSummary }).diagnostics ?? null;
      }

      const afterCount = await readCompaniesCount();

      if (refreshError) {
        const status = (refreshError as Error & { status?: number }).status ?? 500;
        res.status(status).json({
          ok: false,
          dbHost,
          dbName,
          endpointUsed: summary?.endpointUsed ?? null,
          endpointPath: summary?.endpointPath ?? null,
          fetchedCount: summary?.fetchedCount ?? 0,
          rawCount: summary?.rawCount ?? 0,
          mappedCount: summary?.mappedCount ?? 0,
          droppedCounts: summary?.droppedCounts ?? null,
          rawSampleKeys: summary?.rawSampleKeys ?? [],
          rawSample: summary?.rawSample ?? null,
          mappedSample: summary?.mappedSample ?? null,
          attemptedUpserts: summary?.attemptedUpserts ?? 0,
          rowsAffectedTotal: summary?.rowsAffectedTotal ?? 0,
          beforeCount,
          afterCount,
          errorCount: summary?.errorCount ?? 1,
          firstError: diagnosticsFromError(refreshError),
          writePhaseReached: summary?.writePhaseReached ?? "ERROR",
          inTxAtError: summary?.inTxAtError ?? false,
          lastSqlOp: summary?.lastSqlOp ?? "unknown",
        });
        return;
      }

      const noRowsWritten = afterCount === beforeCount && (summary?.rowsAffectedTotal ?? 0) === 0;
      if (noRowsWritten) {
        res.status(500).json({
          ok: false,
          reason: "no rows written",
          dbHost,
          dbName,
          endpointUsed: summary?.endpointUsed ?? null,
          endpointPath: summary?.endpointPath ?? null,
          fetchedCount: summary?.fetchedCount ?? 0,
          rawCount: summary?.rawCount ?? 0,
          mappedCount: summary?.mappedCount ?? 0,
          droppedCounts: summary?.droppedCounts ?? null,
          rawSampleKeys: summary?.rawSampleKeys ?? [],
          rawSample: summary?.rawSample ?? null,
          mappedSample: summary?.mappedSample ?? null,
          attemptedUpserts: summary?.attemptedUpserts ?? 0,
          rowsAffectedTotal: summary?.rowsAffectedTotal ?? 0,
          beforeCount,
          afterCount,
          errorCount: summary?.errorCount ?? 0,
          firstError: summary?.firstError ?? null,
          batchCount: summary?.batchCount ?? 0,
          writePhaseReached: summary?.writePhaseReached ?? "ERROR",
          inTxAtError: summary?.inTxAtError ?? false,
          lastSqlOp: summary?.lastSqlOp ?? "unknown",
        });
        return;
      }

      res.status(200).json({
        ok: true,
        dbHost,
        dbName,
        endpointUsed: summary?.endpointUsed ?? null,
        endpointPath: summary?.endpointPath ?? null,
        fetchedCount: summary?.fetchedCount ?? 0,
        rawCount: summary?.rawCount ?? 0,
        mappedCount: summary?.mappedCount ?? 0,
        droppedCounts: summary?.droppedCounts ?? null,
        rawSampleKeys: summary?.rawSampleKeys ?? [],
        rawSample: summary?.rawSample ?? null,
        mappedSample: summary?.mappedSample ?? null,
        attemptedUpserts: summary?.attemptedUpserts ?? 0,
        rowsAffectedTotal: summary?.rowsAffectedTotal ?? 0,
        beforeCount,
        afterCount,
        errorCount: summary?.errorCount ?? 0,
        firstError: summary?.firstError ?? null,
        batchCount: summary?.batchCount ?? 0,
        writePhaseReached: summary?.writePhaseReached ?? "ERROR",
        inTxAtError: summary?.inTxAtError ?? false,
        lastSqlOp: summary?.lastSqlOp ?? "unknown",
      });
      return;
    }

    const q = typeof req.query?.q === "string" ? req.query.q : "";
    if (q.trim().length >= 2) {
      const results = await searchCompaniesByName(q);
      res.status(200).json({ ok: true, results });
      return;
    }

    // Vercel Cron invokes GET requests. Allow authenticated refresh without q.
    assertCompaniesSyncSecret(req);
    const summary = await refreshCompaniesMaster();
    res.status(200).json({ ok: true, ...summary });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({
      ok: false,
      error: (error as Error).message,
      header: (error as Error & { header?: string }).header ?? undefined,
    });
  }
}
