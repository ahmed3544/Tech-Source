import { deleteEmployeeHandler } from "../server/employees.js";
import { ensureSchema } from "../server/ensure-schema.js";

/**
 * Static-path alias for DELETE /api/employees/:id (see api/employees-update.ts
 * for why dynamic multi-segment /api paths cannot be trusted on all Vercel
 * deployments). The frontend calls POST /api/employees-delete { id }.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
  }
  try { await ensureSchema(); } catch { /* logged inside ensureSchema */ }

  let body: any = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
  // Inject the id (may be empty) and let the shared handler run authentication
  // BEFORE validation (same order as api/employees-update.ts).
  const id = String(body?.id ?? '').trim();
  req.params = { ...(req.params || {}), id };
  return deleteEmployeeHandler(req, res);
}
