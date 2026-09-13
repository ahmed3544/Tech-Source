import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    // Production/runtime database is Neon. DATABASE_URL must point to the
    // Neon Postgres connection string in Vercel/local environments.
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.warn(
        "DATABASE_URL is not set. Neon database operations will fail if invoked."
      );
    }

    global._postgresPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }

  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
