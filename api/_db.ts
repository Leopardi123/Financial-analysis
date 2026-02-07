import { createClient, type Client, type InStatement } from "@libsql/client";

let cachedClient: Client | null = null;

export function getDb() {
  if (cachedClient) {
    return cachedClient;
  }
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }

  cachedClient = createClient({
    url: databaseUrl,
    authToken,
  });

  return cachedClient;
}

export async function execute(sql: string, params: Array<string | number | null> = []) {
  return getDb().execute({ sql, args: params });
}

export async function query(sql: string, params: Array<string | number | null> = []) {
  const result = await getDb().execute({ sql, args: params });
  return result.rows;
}

export async function batch(statements: InStatement[]) {
  return getDb().batch(statements);
}
