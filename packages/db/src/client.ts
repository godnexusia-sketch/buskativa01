import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** Reads DATABASE_SSL, DATABASE_CA_CERT and DB_POOL_MAX. */
export type DbEnv = Record<string, string | undefined>;

const SSL_URL_PARAMS = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslpassword", "uselibpqcompat"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const DEFAULT_POOL_MAX = 5;

/**
 * Pool options from the URL and env. TLS comes only from DATABASE_SSL ("disable" | "require" | "verify"):
 * ssl parameters in the URL are removed, because pg-connection-string would otherwise override the
 * ssl option (and it reads sslmode=require as verify-full). Default: "require" (encrypted, certificate not
 * verified) for remote hosts, "disable" for localhost. "verify" checks the server against DATABASE_CA_CERT (PEM).
 * DB_POOL_MAX caps the clients per process (default 5).
 */
export function poolConfig(url: string, env: DbEnv): pg.PoolConfig {
  const u = new URL(url);
  for (const p of SSL_URL_PARAMS) u.searchParams.delete(p);
  const connectionString = u.toString().replace(/\?$/, "");

  const mode = env.DATABASE_SSL || (LOCAL_HOSTS.has(u.hostname) ? "disable" : "require");
  let ssl: pg.PoolConfig["ssl"];
  if (mode === "disable") ssl = false;
  else if (mode === "require") ssl = { rejectUnauthorized: false };
  else if (mode === "verify") {
    if (!env.DATABASE_CA_CERT) throw new Error("DATABASE_SSL=verify exige DATABASE_CA_CERT (certificado da CA em PEM)");
    // env editors often store the PEM with literal "\n"
    ssl = { ca: env.DATABASE_CA_CERT.replace(/\\n/g, "\n") };
  } else throw new Error(`DATABASE_SSL inválida: "${mode}" (use disable, require ou verify)`);

  const max = env.DB_POOL_MAX ? Number(env.DB_POOL_MAX) : DEFAULT_POOL_MAX;
  if (!Number.isInteger(max) || max < 1) throw new Error(`DB_POOL_MAX inválida: "${env.DB_POOL_MAX}" (inteiro positivo)`);
  return { connectionString, ssl, max };
}

export function createDb(url: string, env: DbEnv = process.env): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool(poolConfig(url, env));
  return { db: drizzle(pool, { schema }) as unknown as Db, pool };
}

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db as never, { migrationsFolder });
}
