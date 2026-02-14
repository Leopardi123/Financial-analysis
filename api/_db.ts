import { createClient, type InArgs, type ResultSet } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? "";

if (!url) {
  throw new Error("Missing database URL (TURSO_DATABASE_URL / DATABASE_URL)");
}

export const db = createClient({
  url,
  authToken: authToken || undefined,
});

export async function execute(sql: string, args?: InArgs): Promise<ResultSet> {
  return db.execute(sql, args);
}

export async function executeMany(statements: Array<[string, InArgs?]>): Promise<void> {
  // libsql batch wants tuples [sql, args?]
  await db.batch(statements);
}
