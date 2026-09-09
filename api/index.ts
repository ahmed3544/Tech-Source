import app from "../server";

// Vercel API entrypoint. Use an extensionless import so Vercel's
// serverless bundler resolves and includes server.ts in the function bundle.
export default function handler(req: any, res: any) {
  return app(req, res);
}
