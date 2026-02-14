import { createClient } from "@libsql/client";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;
  if (!url) throw new Error("Missing TURSO_DATABASE_URL/LIBSQL_URL");
  client = createClient({ url, authToken });
  return client;
}

export async function execute(sql: string, args: unknown[] = []) {
  return getClient().execute({ sql, args });
}

export async function query(sql: string, args: unknown[] = []) {
  const result = await getClient().execute({ sql, args });
  return result.rows;
}

export async function batch(statements: Array<{ sql: string; args?: unknown[] }>) {
  return getClient().batch(
    statements.map((statement) => ({ sql: statement.sql, args: statement.args ?? [] })),
    "write"
  );
}
