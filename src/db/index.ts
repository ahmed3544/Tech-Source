import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, Client } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "./schema.js";

declare global {
  var _postgresPool: Pool | undefined;
}

/**
 * Request-scoped database client storage for Cloudflare Workers.
 *
 * In the Workers runtime, outbound TCP sockets only reliably deliver events
 * within the request context that created them — a socket reused from a
 * later request (or from global scope) hangs forever, which is why the
 * shared pg Pool deadlocks there. The Worker entry (cloudflare-worker.ts)
 * therefore opens one pg Client per request, stores it here, and closes it
 * when the response completes. drizzle picks it up transparently through
 * the facade below; AsyncLocalStorage propagates the binding through the
 * cloudflare:node bridge into every Express handler.
 */
export const requestDbStorage = new AsyncLocalStorage<{ client?: Client }>();

/**
 * Cloudflare Workers (workerd) replacement for the pg Pool.
 *
 * - Inside a request: queries run on the per-request Client stored in
 *   requestDbStorage (opened + closed by the Worker entry per request).
 * - Outside any request (boot-time ensureSchema, background work): a fresh
 *   self-contained Client per query, always created and closed in the same
 *   async context.
 *
 * Verified in workerd (scripts/pg-probe.mjs): sequential, parallel and
 * after-idle usage all work; pooled/global clients hang across requests.
 */
function createWorkersClient(connectionString: string): Pool {
  const facade = {
    async query(...args: any[]) {
      const scoped = requestDbStorage.getStore()?.client;
      if (scoped) {
        return await (scoped.query as any)(...args);
      }
      const c = new Client({ connectionString });
      try {
        await c.connect();
        return await (c.query as any)(...args);
      } finally {
        try { await c.end(); } catch {}
      }
    },
    on: () => {},
    end: async () => {},
  };

  // drizzle-orm's node-postgres driver only calls .query() on the client
  // (see NodePgSession); the structural cast keeps the shared call sites
  // unchanged for every deployment platform.
  return facade as unknown as Pool;
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

    if (process.env.CLOUDFLARE_WORKER === "1") {
      global._postgresPool = createWorkersClient(connectionString || "");
      return global._postgresPool;
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

let db: ReturnType<typeof drizzle>;
if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  console.warn('[AI Studio] Database not connected — using mock');
  const createChain = (terminalVal: any) => {
    const fn = () => chain;
    const chain: any = new Proxy(fn, {
      get: (target, prop) => {
        if (prop === 'then') return undefined; // so it isn't treated as a promise
        return chain;
      },
      apply: (target, thisArg, argumentsList) => {
        // Return a mock result
        return [];
      }
    });
    return chain;
  };
  
  db = new Proxy({}, {
    get: (_, prop) => {
       if (prop === 'select') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       if (prop === 'insert') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       if (prop === 'update') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       if (prop === 'delete') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       return async () => [];
    }
  }) as any;
} else {
  try {
    db = drizzle(pool, { schema });
  } catch {
    db = new Proxy({}, { get: () => async () => [] }) as any;
  }
}

export { db };
