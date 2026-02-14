import {
  createClient,
  type InArgs,
  type ResultSet,
  type Row,
} from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const authToken =
  process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN ?? "";

if (!url) {
  throw new Error("Missing database URL (TURSO_DATABASE_URL / DATABASE_URL)");
}

export const db = createClient({
  url,
  authToken: authToken || undefined,
});

/** Low-level execute (kept for backwards compatibility) */
export async function execute(sql: string, args?: InArgs): Promise<ResultSet> {
  return db.execute(sql, args);
}

/** Used by many server routes: query -> rows[] */
export async function query<T extends Row = Row>(
  sql: string,
  args?: InArgs
): Promise<T[]> {
  const res = await db.execute(sql, args);
  return res.rows as T[];
}

/** Used by some server routes: batch([{sql,args}...]) */
export async function batch(
  statements: Array<{ sql: string; args?: InArgs }>
): Promise<void> {
  await db.batch(statements.map((s) => [s.sql, s.args] as [string, InArgs?]));
}

/** Optional helper, if you want tuple-style batches */
export async function executeMany(
  statements: Array<[string, InArgs?]>
): Promise<void> {
  await db.batch(statements);
}
