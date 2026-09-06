import app from "../server";

// Vercel Node.js Functions expect a request handler. Passing the Express
// application directly is supported, but wrapping it keeps this entrypoint
// explicit and makes sure every /api/* request reaches the same Express app.
export default function handler(req: any, res: any) {
  return app(req, res);
}
