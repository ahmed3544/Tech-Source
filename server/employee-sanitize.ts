/**
 * Strips credential material (the pin) from employee rows before they are
 * sent to any client.
 *
 * /api/data is a public read endpoint: it must never leak the credential that
 * the server-side permission guard validates (x-auth-pin). The signing
 * credential lives only in the signed-in user's own session storage (typed at
 * login) — roster reads never need it.
 */

export function sanitizeEmployee<T extends Record<string, any>>(employee: T): Omit<T, 'pin'> {
  if (!employee || typeof employee !== 'object') return employee;
  const { pin, ...rest } = employee;
  void pin; // intentionally dropped
  return rest as Omit<T, 'pin'>;
}

export function sanitizeEmployees<T extends Record<string, any>>(employees: T[] | null | undefined): Omit<T, 'pin'>[] {
  return Array.isArray(employees) ? employees.map((employee) => sanitizeEmployee(employee)) : [];
}
