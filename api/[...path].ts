import app from "../server.js";

// Vercel API catch-all entrypoint. Use the NodeNext-compatible .js specifier;
// the TypeScript source is server.ts and Vercel's bundler resolves it correctly.
export default function handler(req: any, res: any) {
  return app(req, res);
}
