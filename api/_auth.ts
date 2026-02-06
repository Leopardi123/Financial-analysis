export function assertCronSecret(req: { headers: Record<string, string | string[] | undefined> }) {
  const provided = req.headers["x-cron-secret"];
  const secret = process.env.CRON_SECRET;
  if (!secret || provided !== secret) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
}
