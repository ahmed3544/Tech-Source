import app from "../server.ts";

// Vercel's /api entrypoint must use the same Express application and
// database connection as the rest of the backend.
export default function handler(req: any, res: any) {
  return app(req, res);
}
