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
  const id = String(body?.id ?? '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'Employee id is required.' });

  req.params = { ...(req.params || {}), id };
  return deleteEmployeeHandler(req, res);
}
