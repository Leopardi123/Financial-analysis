import { createClient } from "@libsql/client";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!databaseUrl) {
  throw new Error("TURSO_DATABASE_URL is not set");
}

const client = createClient({
  url: databaseUrl,
  authToken,
});

export async function execute(sql: string, params: Array<string | number | null> = []) {
  return client.execute({ sql, args: params });
}

export async function query(sql: string, params: Array<string | number | null> = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows;
}
