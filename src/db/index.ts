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
function createWorkersClient(getConnectionString: () => string): Pool {
  // The connection string is read lazily at query time (NOT captured at
  // creation): on Cloudflare Workers the Hyperdrive binding cannot be read in
  // global scope (deploy validation, error 10021), so process.env.DATABASE_URL
  // is only populated on the first request by applyDatabaseBindings().
  const facade = {
    async query(...args: any[]) {
      const scoped = requestDbStorage.getStore()?.client;
      if (scoped) {
        return await (scoped.query as any)(...args);
      }
      const c = new Client({ connectionString: getConnectionString() });
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
      // Resolve the connection string at query time: on Workers the Hyperdrive
      // binding is applied to process.env.DATABASE_URL on the first request
      // (applyDatabaseBindings), never in global scope (deploy validation).
      global._postgresPool = createWorkersClient(
        () => process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || ""
      );
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

const createMockDb = () => {
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

  return new Proxy({}, {
    get: (_, prop) => {
       if (prop === 'select') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       if (prop === 'insert') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       if (prop === 'update') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       if (prop === 'delete') return () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => async () => [] }) });
       return async () => [];
    }
  }) as any;
};

let cachedDb: ReturnType<typeof drizzle> | null = null;
let cachedMode: 'drizzle' | 'mock' | null = null;

// Resolved lazily (never at module scope) so the Cloudflare Worker can receive
// its Hyperdrive connection string on the first request — Hyperdrive bindings
// cannot be read in global scope (deploy validation, error 10021). The mode
// re-evaluates until a database URL appears, then the instance is cached.
const resolveDb = () => {
  const mode: 'drizzle' | 'mock' =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL ? 'drizzle' : 'mock';
  if (cachedMode === mode && cachedDb) return cachedDb;
  if (mode === 'mock') {
    console.warn('[AI Studio] Database not connected — using mock');
    cachedDb = createMockDb();
  } else {
    try {
      cachedDb = drizzle(pool, { schema });
    } catch {
      cachedDb = createMockDb();
    }
  }
  cachedMode = mode;
  return cachedDb;
};

export const db = new Proxy({} as any, {
  get: (_, prop) => (resolveDb() as any)[prop],
}) as ReturnType<typeof drizzle>;
