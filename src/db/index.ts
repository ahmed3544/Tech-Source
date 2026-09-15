import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    // Use one authoritative production database connection. DATABASE_URL is
    // preferred, while SUPABASE_DB_URL remains supported for compatibility.
    const connectionString =
      process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

    if (!connectionString) {
      console.warn(
        "DATABASE_URL/SUPABASE_DB_URL is not set. Database operations will fail."
      );
    }

    // Serverless instances can scale horizontally. A large pool per instance
    // quickly exhausts the database pooler and surfaces as connection
    // timeouts during cold starts.
    const configuredPoolSize = Number(process.env.PG_POOL_MAX || 2);
    const maxPoolSize = Number.isFinite(configuredPoolSize)
      ? Math.max(1, Math.min(configuredPoolSize, 4))
      : 2;

    global._postgresPool = new Pool({
      connectionString,
      max: maxPoolSize,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    });

    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }

  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
