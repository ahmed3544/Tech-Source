// Cloudflare Workers bootstrap for the Node runtime.
//
// IMPORT ORDER MATTERS: this module must be imported before ./server so the
// environment is configured before the database layer (src/db/index.ts) reads
// process.env.DATABASE_URL at module initialization time.
//
// Workers expose bindings (Hyperdrive, secrets, vars) through the
// cloudflare:workers `env` module export instead of process.env, so we copy
// the database connection string onto process.env for the pg Pool.
//
// NOTE: NODE_ENV is not set here — wrangler.jsonc `define` folds it to
// "production" at bundle time, which also dead-code-eliminates the Vite dev
// branch of server.ts (vite must never enter the Worker bundle).
import { env } from "cloudflare:workers";

process.env.PORT = "3000";
process.env.CLOUDFLARE_WORKER = "1";
if (!process.env.SERVER_TIME_ZONE) process.env.SERVER_TIME_ZONE = "Africa/Cairo";

const bindings = env as Record<string, any> | undefined;
const connectionString: string =
  bindings?.HYPERDRIVE?.connectionString || bindings?.DATABASE_URL || "";

if (connectionString) {
  process.env.DATABASE_URL = connectionString;
} else {
  console.warn(
    "[workers] No HYPERDRIVE binding or DATABASE_URL secret found — configure one in the Cloudflare dashboard (or wrangler.jsonc) before database endpoints can work."
  );
}
