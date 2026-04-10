import { createClient, type Client, type InStatement } from "@libsql/client";

let cachedClient: Client | null = null;
const openedClients = new WeakSet<Client>();

type DbDebugState = {
  db_client_mode: string;
  db_driver_name: string;
  db_env_detected: string;
  db_connection_source: string | null;
  db_connection_attempted: boolean;
  db_connection_opened: boolean;
  db_first_query_attempted: boolean;
  db_first_query_error_stage: string | null;
};

const dbDebugState: DbDebugState = {
  db_client_mode: "unknown",
  db_driver_name: "@libsql/client",
  db_env_detected: String(process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"),
  db_connection_source: null,
  db_connection_attempted: false,
  db_connection_opened: false,
  db_first_query_attempted: false,
  db_first_query_error_stage: null,
};

function maskDbUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//***@${url.host}${url.pathname}`;
  } catch {
    return "***";
  }
}

function detectClientMode(databaseUrl: string): string {
  if (databaseUrl.startsWith("file:")) return "sqlite_file";
  if (databaseUrl.startsWith("libsql://")) return "turso_libsql";
  if (databaseUrl.startsWith("http://") || databaseUrl.startsWith("https://")) return "libsql_http";
  if (databaseUrl.startsWith("ws://") || databaseUrl.startsWith("wss://")) return "libsql_ws";
  return "unknown";
}

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
  dbDebugState.db_client_mode = detectClientMode(databaseUrl);
  dbDebugState.db_connection_source = maskDbUrl(databaseUrl);
  dbDebugState.db_connection_attempted = true;

  return cachedClient;
}

async function ensureClientOpened(stage: string): Promise<Client> {
  const db = getDb();
  if (openedClients.has(db)) return db;
  dbDebugState.db_first_query_attempted = true;
  try {
    await db.execute({ sql: "SELECT 1 AS ok", args: [] });
    openedClients.add(db);
    dbDebugState.db_connection_opened = true;
    dbDebugState.db_first_query_error_stage = null;
    return db;
  } catch (error) {
    dbDebugState.db_connection_opened = false;
    dbDebugState.db_first_query_error_stage = stage;
    throw error;
  }
}

export async function execute(sql: string, params: Array<string | number | null> = []) {
  return withReconnectRetry(async () => {
    const db = await ensureClientOpened("execute");
    return db.execute({ sql, args: params });
  });
}

export async function query(sql: string, params: Array<string | number | null> = []) {
  const result = await withReconnectRetry(async () => {
    const db = await ensureClientOpened("query");
    return db.execute({ sql, args: params });
  });
  return result.rows;
}

export async function batch(statements: InStatement[]) {
  return withReconnectRetry(async () => {
    const db = await ensureClientOpened("batch");
    return db.batch(statements);
  });
}

export function getDbDebugState(): DbDebugState {
  return { ...dbDebugState };
}
