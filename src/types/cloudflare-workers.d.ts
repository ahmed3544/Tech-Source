// Minimal ambient declarations for Cloudflare Workers runtime-only modules.
// The full surface lives in @cloudflare/workers-types; these keep `npm run
// lint` (tsc --noEmit) clean without adding a dependency.
//
// cloudflare:node requires compatibility_date >= 2025-09-01 (node:http server
// support is enabled automatically with nodejs_compat).

declare module "cloudflare:node" {
  /**
   * Bridges a Worker Request into a Node.js HTTP server that is listening on
   * the given port (the port acts as a routing key inside the Worker runtime).
   */
  export function handleAsNodeRequest(port: number, request: Request): Promise<Response>;

  /**
   * Returns a Worker fetch handler that routes every request into the Node.js
   * HTTP server listening on the given port.
   */
  export function httpServerHandler(
    server: { port: number } | unknown,
  ): { fetch(request: Request): Promise<Response> };
}

declare module "cloudflare:workers" {
  /** All bindings configured for the Worker (vars, secrets, Hyperdrive, ASSETS...). */
  export const env: Record<string, any>;
}
