// Wrangler alias stub: the Vite dev server is a build-time tool and must never
// be bundled into the Worker. server.ts only imports it behind a
// `NODE_ENV !== "production"` branch that the wrangler `define` constant
// (process.env.NODE_ENV = "production") folds away.
export {};
