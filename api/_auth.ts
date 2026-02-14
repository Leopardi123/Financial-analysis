function extractBearer(authHeader: string | string[] | undefined) {
  if (typeof authHeader !== "string") return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
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
