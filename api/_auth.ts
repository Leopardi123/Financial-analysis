function extractBearer(authHeader: string | string[] | undefined) {
  if (typeof authHeader !== "string") return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim();
}

export function getAdminSecret() {
  return process.env.ADMIN_SECRET || process.env.CRON_SECRET || null;
}

export function assertAdminSecret(req: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const secret = getAdminSecret();
  const bearer = extractBearer(req.headers.authorization);
  const headerSecret = req.headers["x-admin-secret"];
  const normalizedHeaderSecret = Array.isArray(headerSecret)
    ? headerSecret[0]
    : headerSecret;

  if (!secret || (bearer !== secret && normalizedHeaderSecret !== secret)) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}

export function assertCronSecret(req: Request) {
  const header =
    req.headers.get("x-admin-secret") ??
    req.headers.get("authorization") ??
    "";

  // stöd både "Bearer xxx", "bearer xxx" och "xxx"
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header.trim();

  const expected =
    process.env.ADMIN_SECRET ?? process.env.CRON_SECRET ?? "";

  if (!expected) {
    const error = new Error(
      "Missing server secret (ADMIN_SECRET / CRON_SECRET)"
    );
    (error as Error & { status?: number }).status = 500;
    throw error;
  }

  if (token !== expected) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}
