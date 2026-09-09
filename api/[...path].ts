import app from "../server.ts";

// Keep the API backed by the same Express application used locally.
// Importing server.ts directly makes the Vercel Function self-contained;
// it no longer depends on dist/server.js being present in the function bundle.
export default function handler(req: any, res: any) {
  return app(req, res);
}
