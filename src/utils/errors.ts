/**
 * Central error-message extraction.
 *
 * Guarantees the UI never renders "[object Object]": API payloads, Error
 * instances and unknown throwables are all converted into human-readable
 * strings, digging into `message` / `error` / `errors` / `detail` fields.
 */

const MAX_DEPTH = 4;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const looksLikeObject = (value: unknown) => isPlainObject(value) || Array.isArray(value);

function fromObject(obj: Record<string, unknown> | unknown[], depth: number): string | null {
  if (depth > MAX_DEPTH) return null;

  // Arrays of validation errors: [{ message | field | ... }]
  if (Array.isArray(obj)) {
    const parts = obj
      .map((item) => stringifyUnknown(item, depth + 1))
      .filter(Boolean) as string[];
    return parts.length ? parts.join(' • ') : null;
  }

  const direct = ['message', 'error', 'detail', 'reason', 'description'];
  for (const key of direct) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }

  // Nested containers: { error: { message } }, { errors: [...] }, validation shapes
  const nested = ['error', 'errors', 'details', 'validation', 'data', 'cause'];
  for (const key of nested) {
    const value = (obj as Record<string, unknown>)[key];
    if (looksLikeObject(value)) {
      const nestedMessage = stringifyUnknown(value, depth + 1);
      if (nestedMessage) return nestedMessage;
    }
  }

  // Field-level validation maps: { fieldName: 'problem' | ['problems'] }
  const fieldEntries = Object.entries(obj).filter(([key]) => !direct.includes(key) && !nested.includes(key));
  const fieldMessages: string[] = [];
  for (const [key, value] of fieldEntries) {
    if (typeof value === 'string' && value.trim()) fieldMessages.push(`${key}: ${value.trim()}`);
    else if (Array.isArray(value) && value.length) {
      const joined = value.map((v) => stringifyUnknown(v, depth + 1)).filter(Boolean).join(', ');
      if (joined) fieldMessages.push(`${key}: ${joined}`);
    }
  }
  if (fieldMessages.length) return fieldMessages.join(' • ');

  if (typeof obj.statusText === 'string' && obj.statusText.trim()) return obj.statusText.trim();
  return null;
}

function stringifyUnknown(value: unknown, depth: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message || value.name || null;
  if (isPlainObject(value)) return fromObject(value, depth);
  if (Array.isArray(value)) return fromObject(value, depth);
  return null;
}

/** Converts any thrown value into a readable message with a safe fallback. */
export function errorToMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const message = stringifyUnknown(error, 0);
  if (!message || /^\[object\s+object\]$/i.test(message)) return fallback;
  return message;
}

/** Converts a parsed API response body into a readable error message. */
export function extractApiError(payload: unknown, fallback = 'Request failed. Please try again.'): string {
  return errorToMessage(payload, fallback);
}

/**
 * Builds a fetch init object that carries the signed-in user's identity so
 * server-side permission checks can validate every mutating request.
 * The credential comes from the login response when available, otherwise from
 * the typed password stashed in sessionStorage at sign-in time (the /api/login
 * response strips the stored pin).
 */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  let employeeId = '';
  let pin = '';
  try {
    const saved = JSON.parse(localStorage.getItem('logged_in_user') || 'null');
    employeeId = String(saved?.id ?? '');
    pin = String(saved?.pin ?? '');
  } catch { /* not signed in */ }
  if (!pin) {
    try { pin = String(sessionStorage.getItem('auth_pin') ?? ''); } catch { /* unavailable */ }
  }
  const headers: Record<string, string> = { ...extra };
  if (employeeId) headers['x-auth-employee-id'] = employeeId;
  if (pin) headers['x-auth-pin'] = pin;
  return headers;
}

/** Parses a fetch Response into a usable payload, tolerating empty/HTML bodies. */
export async function parseResponse(response: Response): Promise<any> {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text }; }
}
