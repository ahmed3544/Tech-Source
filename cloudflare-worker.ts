type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

const API_NOT_READY = {
  success: false,
  error: "cloudflare_backend_not_configured",
  message: "The Cloudflare preview is running, but the application API is not connected yet.",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Never let API requests fall through to the SPA's index.html.
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "preview",
        platform: "cloudflare-workers",
        backend: "pending-hyperdrive-connection",
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(API_NOT_READY, { status: 503 });
    }

    return env.ASSETS.fetch(request);
  },
};
