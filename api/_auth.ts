function extractBearer(authHeader: string | string[] | undefined) {
  if (typeof authHeader !== "string") {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

export function getAdminSecret() {
  return process.env.ADMIN_SECRET || process.env.CRON_SECRET || null;
}

export function assertAdminSecret(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = getAdminSecret();
  const bearer = extractBearer(req.headers.authorization);
  const headerSecret = req.headers["x-admin-secret"];
  const normalizedHeaderSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;

  if (!secret || (bearer !== secret && normalizedHeaderSecret !== secret)) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}

export function assertCronSecret(req: {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown> | string | null;
}) {
  const secret = process.env.CRON_SECRET;
  const bearer = extractBearer(req.headers.authorization);
  const provided = req.headers["x-cron-secret"];
  const normalized = Array.isArray(provided) ? provided[0] : provided;
  const querySecret = typeof req.query?.cronSecret === "string" ? req.query.cronSecret : null;
  const bodySecret = (() => {
    if (!req.body) return null;
    if (typeof req.body === "string") {
      try {
        const parsed = JSON.parse(req.body) as Record<string, unknown>;
        return typeof parsed?.cronSecret === "string" ? parsed.cronSecret : null;
      } catch {
        return null;
      }
    }
    return typeof req.body?.cronSecret === "string" ? req.body.cronSecret : null;
  })();

  if (!secret || (normalized !== secret && bearer !== secret && querySecret !== secret && bodySecret !== secret)) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}
