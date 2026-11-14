// Cloudflare Workers entrypoint for the FULL Tech Source backend.
//
// The complete Express app (server.ts — every /api route: login, data,
// punch, schedule-sync, leaves, overtime, notifications, employees CRUD,
// breaks, activity logs, dashboard import, sheet sync...) is bundled by
// Wrangler into this Worker and runs inside the Workers runtime. Worker
// requests are bridged into the Node HTTP server via `handleAsNodeRequest`
// from cloudflare:node (requires compatibility_date >= 2025-09-01, which
// wrangler.jsonc provides).
//
// Static SPA assets are served directly by the platform ASSETS binding
// (run_worker_first in wrangler.jsonc is limited to /api/*), so this Worker
// only ever sees API traffic plus the explicit /api/health probe below.
//
// Notes:
// - PostgreSQL connectivity goes through the HYPERDRIVE binding (Neon), whose
//   connection string is copied onto process.env.DATABASE_URL by
//   ./cloudflare-worker-env.ts BEFORE the app module initializes.
// - firebase-admin is aliased to a stub (cloudflare-stubs/) because its gRPC
//   transport cannot run on Workers; push delivery degrades gracefully and
//   the in-app notification center (database-backed) keeps working.
import "./cloudflare-worker-env";
import { handleAsNodeRequest } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { Client } from "pg";
import { requestDbStorage } from "./src/db/index.js";
// Side-effect import: module evaluation registers every route AND starts the
// Node HTTP listener (server.ts calls app.listen in CLOUDFLARE_WORKER mode).
// A value import would be tree-shaken away by esbuild because this entry does
// not reference the app binding directly.
import "./server";

// Must match the port server.ts listens on in CLOUDFLARE_WORKER mode
// (cloudflare-worker-env.ts sets process.env.PORT = "3000").
const PORT = 3000;

function databaseConnectionString(): string {
  const bindings = env as Record<string, any> | undefined;
  return String(bindings?.HYPERDRIVE?.connectionString || bindings?.DATABASE_URL || "");
}

async function databaseHealth(): Promise<"connected" | "unavailable"> {
  const connectionString = databaseConnectionString();
  if (!connectionString) return "unavailable";
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query("SELECT 1 AS connected");
    return result.rows[0]?.connected === 1 ? "connected" : "unavailable";
  } catch (error) {
    console.error("[workers /api/health] database connection failed:", error);
    return "unavailable";
  } finally {
    try { await client.end(); } catch {}
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Richer health probe than the Express one: verifies the Hyperdrive/Neon
    // round-trip so uptime monitors and the keep-alive workflow can detect a
    // database outage, not just an API outage.
    if (url.pathname === "/api/health") {
      const database = await databaseHealth();
      const status = database === "connected" ? "ok" : "degraded";
      return Response.json(
        { status, platform: "cloudflare-workers", database },
        {
          status: database === "connected" ? 200 : 503,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }

    // Open one pg Client per request. In the Workers runtime, outbound TCP
    // sockets only deliver events within the request context that created
    // them, so connections must not be shared across requests (a shared
    // pg Pool deadlocks — see src/db/index.ts). Hyperdrive keeps warm
    // server-side connections to Neon, making the per-request handshake cheap.
    const connectionString = databaseConnectionString();
    let client: Client | null = null;
    try {
      if (connectionString) {
        client = new Client({ connectionString });
        await client.connect();
      } else {
        console.warn("[workers] no database connection string — request will run without a database");
      }
      // The bridge runs the whole Express pipeline as async continuations of
      // this awaited promise, so AsyncLocalStorage carries the per-request
      // client into every drizzle query.
      return await requestDbStorage.run(
        client ? { client } : {},
        () => handleAsNodeRequest(PORT, request),
      );
    } finally {
      try { await client?.end(); } catch {}
    }
  },
};
