import { updateEmployeeHandler } from "../server/employees.js";
import { ensureSchema } from "../server/ensure-schema.js";

/**
 * Static-path alias for PUT /api/employees/:id.
 *
 * Some production Vercel deployments never route dynamic multi-segment /api
 * paths (PUT /api/employees/<id>) to the catch-all function — the platform
 * itself answers with {"error":{"code":"404","message":"The page could not
 * be found"}} before any application code runs, which surfaced in the UI as
 * "The page could not be found" when saving the employee edit form.
 *
 * A single-segment static file like this one is ALWAYS routed (exactly like
 * /api/login and /api/push/register), so the frontend saves edits with
 * POST /api/employees-update { id, ...fields }.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
  }
  // Self-heal the additive schema pieces before touching employees.
  try { await ensureSchema(); } catch { /* logged inside ensureSchema */ }

  let body: any = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
  // Inject the id (may be empty) and let the shared handler run authentication
  // BEFORE validation, so unauthenticated probes get 401 instead of validation
  // details. The handler answers 400 "Employee id is required." after auth.
  const id = String(body?.id ?? '').trim();
  req.params = { ...(req.params || {}), id };
  return updateEmployeeHandler(req, res);
}
