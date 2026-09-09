import app from "../dist/server.js";

// Vercel runtime entrypoint: load the exact bundled Node server produced by
// `npm run build`. This avoids Node ESM resolving ../server.js as the
// `/var/task/server` directory when the TypeScript source is deployed.
export default function handler(req: any, res: any) {
  return app(req, res);
}
