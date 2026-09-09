import app from "../dist/server.js";

// Vercel runtime entrypoint: use the exact bundled server emitted by the
// production build so Node never attempts to resolve the /server directory.
export default function handler(req: any, res: any) {
  return app(req, res);
}
