import { createClient, type Client, type InStatement } from "@libsql/client";

let cachedClient: Client | null = null;
function shouldReconnect(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /connection not opened|SQLITE_UNKNOWN|SQLITE_CANTOPEN/i.test(message);
}

async function withReconnectRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!shouldReconnect(error)) throw error;
    cachedClient = null;
    return operation();
  }
}

export function getDb() {
  if (cachedClient) {
    return cachedClient;
  }
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }
  if (!authToken) {
    throw new Error("TURSO_AUTH_TOKEN is not set");
  }

  cachedClient = createClient({
    url: databaseUrl,
    authToken,
  });

  return cachedClient;
}

export async function execute(sql: string, params: Array<string | number | null> = []) {
  return withReconnectRetry(() => getDb().execute({ sql, args: params }));
}

export async function query(sql: string, params: Array<string | number | null> = []) {
  const result = await withReconnectRetry(() => getDb().execute({ sql, args: params }));
  return result.rows;
}

export async function batch(statements: InStatement[]) {
  return withReconnectRetry(() => getDb().batch(statements));
}
