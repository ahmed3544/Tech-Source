// Cloudflare Workers bootstrap for the Node runtime.
//
// IMPORT ORDER MATTERS: this module must be imported before ./server so the
// environment is configured before the database layer (src/db/index.ts) reads
// process.env.DATABASE_URL.
//
// Workers expose bindings (Hyperdrive, secrets, vars) through the
// cloudflare:workers `env` module export instead of process.env, so we copy
// the database connection string onto process.env for the pg Pool.
//
// NOTE: NODE_ENV is not set here — wrangler.jsonc `define` folds it to
// "production" at bundle time, which also dead-code-eliminates the Vite dev
// branch of server.ts (vite must never enter the Worker bundle).
//
// DEPLOY VALIDATION (error 10021): at deploy time Cloudflare runs the module
// top-level in a sandbox and rejects any I/O-capable operation there
// ("Disallowed operation called within global scope"). Reading the Hyperdrive
// binding's `connectionString` getter in global scope trips exactly that
// check, so Hyperdrive may only be read inside the fetch() handler. Plain
// string secrets/vars (DATABASE_URL) are safe to read at module scope.
import { env } from "cloudflare:workers";

process.env.PORT = "3000";
process.env.CLOUDFLARE_WORKER = "1";
if (!process.env.SERVER_TIME_ZONE) process.env.SERVER_TIME_ZONE = "Africa/Cairo";

const bindings = env as Record<string, any> | undefined;

// Global-scope-safe copy: plain-string DATABASE_URL secret/var only. When the
// database is wired through Hyperdrive instead, applyDatabaseBindings() copies
// its connection string onto process.env on the first request, before any
// query can run (the db layer resolves its drizzle instance lazily to make
// that possible — see src/db/index.ts).
const staticConnectionString: string = bindings?.DATABASE_URL || "";

if (staticConnectionString) {
  process.env.DATABASE_URL = staticConnectionString;
} else {
  console.warn(
    "[workers] No DATABASE_URL secret in global scope — the Hyperdrive connection string is applied lazily on the first request by applyDatabaseBindings()."
  );
}

let applied = false;

/**
 * Copy the effective database connection string onto process.env.DATABASE_URL.
 *
 * MUST be called from inside the fetch() handler (cloudflare-worker.ts) —
 * reading env.HYPERDRIVE in global scope fails deploy validation (error
 * 10021). Idempotent; Hyperdrive wins over a DATABASE_URL secret, matching
 * the per-request precedence in cloudflare-worker.ts.
 */
export const applyDatabaseBindings = (): void => {
  if (applied) return;
  applied = true;
  const hyperdrive: string = bindings?.HYPERDRIVE?.connectionString || "";
  const secret: string = bindings?.DATABASE_URL || "";
  const connectionString = hyperdrive || secret;
  if (connectionString) {
    process.env.DATABASE_URL = connectionString;
  }
};
