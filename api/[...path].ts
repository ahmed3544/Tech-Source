import app from "../dist/server.js";

// Vercel Node.js Functions expect a request handler. The bundled Express
// application is built to dist/server.js by the project build command.
export default function handler(req: any, res: any) {
  return app(req, res);
}
