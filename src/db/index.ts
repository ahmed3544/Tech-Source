import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    // Prefer the new Neon DATABASE_URL. Keep SUPABASE_DB_URL as a fallback
    // during migration so the production database is never switched until
    // the Neon copy has been verified.
    const connectionString =
      process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

    if (!connectionString) {
      console.warn(
        "DATABASE_URL/SUPABASE_DB_URL is not set. Database operations will fail if invoked."
      );
    }

    global._postgresPool =
      new Pool({
        connectionString,
        max: 10,
        connectionTimeoutMillis: 15000,
      });

    global._postgresPool.on(
      "error",
      (err) => {
        console.error(
          "Unexpected error on idle SQL pool client:",
          err
        );
      }
    );
  }

  return global._postgresPool;
};

const pool = createPool();

export const db =
  drizzle(pool, { schema });
