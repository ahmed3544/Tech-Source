import { Client } from "pg";
import { passwordMatches, normalizeDigits } from "./server/passwords.js";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  HYPERDRIVE: { connectionString: string };
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", ...headers },
  });
}

function camelize(row: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function findEmployee(employees: any[], input: string) {
  const clean = normalizeDigits(input).toLowerCase();
  const alpha = clean.replace(/[^a-z0-9]/g, "");
  const digits = clean.replace(/\D/g, "");
  const numeric = digits ? Number(digits) : null;

  if (clean === "5002") {
    const admin = employees.find((e) =>
      String(e.id || "") === "emp-002" ||
      normalize(e.email) === "ahmed.mahmoud@techsource-gds.com"
    );
    if (admin) return admin;
  }

  return employees.find((employee) => {
    const code = normalize(employee.code);
    const employeeAlpha = code.replace(/[^a-z0-9]/g, "");
    const employeeDigits = code.replace(/\D/g, "");
    const employeeNumeric = employeeDigits ? Number(employeeDigits) : null;
    return code === clean ||
      employeeAlpha === alpha ||
      (numeric !== null && employeeNumeric !== null && numeric === employeeNumeric) ||
      normalize(employee.email) === clean ||
      (employee.phone && String(employee.phone).replace(/\D/g, "") === digits);
  });
}

async function withClient<T>(env: Env, action: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
  try {
    await client.connect();
    return await action(client);
  } finally {
    try { await client.end(); } catch {}
  }
}

async function login(request: Request, env: Env) {
  if (request.method !== "POST") return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ success: false, error: "INVALID_JSON" }, 400); }

  const code = normalizeDigits(body?.code);
  const password = normalizeDigits(body?.password);
  if (!code || !password) return json({ success: false, error: "Missing credentials" }, 400);

  try {
    return await withClient(env, async (client) => {
      const result = await client.query("SELECT * FROM employees");
      const employees = result.rows.map(camelize);
      const employee = findEmployee(employees, code);

      const audit = async (employeeId: string | null, success: boolean, reason: string | null) => {
        try {
          await client.query(
            `INSERT INTO login_audit
              (id, employee_id, login_identifier, success, failure_reason, ip_address, user_agent, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              crypto.randomUUID(), employeeId, code.slice(0, 255), success, reason,
              (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 100) || null,
              (request.headers.get("user-agent") || "").slice(0, 500) || null,
              new Date().toISOString(),
            ],
          );
        } catch (error) { console.warn("[preview login audit] skipped:", error); }
      };

      if (!employee) {
        await audit(null, false, "INVALID_CREDENTIALS");
        return json({ success: false, error: "INVALID_CREDENTIALS" }, 401);
      }
      if (String(employee.status ?? "").toLowerCase() === "inactive") {
        await audit(String(employee.id), false, "ACCOUNT_INACTIVE");
        return json({ success: false, error: "ACCOUNT_INACTIVE" }, 403);
      }
      if (!passwordMatches(employee, password)) {
        await audit(String(employee.id), false, "INVALID_CREDENTIALS");
        return json({ success: false, error: "INVALID_CREDENTIALS" }, 401);
      }

      const isAhmedAdmin = String(employee.id || "") === "emp-002" ||
        normalize(employee.email) === "ahmed.mahmoud@techsource-gds.com";
      const safeEmployee: any = {
        ...employee,
        ...(isAhmedAdmin ? { code: "5002", nameAr: "Ahmed Mahmoud", nameEn: "Ahmed Mahmoud" } : {}),
      };
      delete safeEmployee.pin;
      await audit(String(employee.id), true, null);
      return json({ success: true, employee: safeEmployee });
    });
  } catch (error) {
    console.error("[preview /api/login] database error:", error);
    return json({ success: false, error: "LOGIN_SERVER_ERROR" }, 500);
  }
}

async function loadAppData(env: Env) {
  return withClient(env, async (client) => {
    const tables = [
      ["employees", "employees"],
      ["attendance_records", "attendanceRecords"],
      ["leave_requests", "leaveRequests"],
      ["overtime_requests", "overtimeRequests"],
      ["shifts", "shifts"],
      ["notifications", "notifications"],
      ["employee_shift_assignments", "employeeShiftAssignments"],
      ["settings", "settings"],
    ] as const;

    // Keep the employee roster available even if an optional legacy table is
    // missing or temporarily unavailable on the preview branch. The previous
    // all-or-nothing Promise.all made /api/data fail completely when ANY one
    // table failed, leaving the UI with only its admin bootstrap record.
    const loaded = await Promise.all(tables.map(async ([table]) => {
      try {
        const result = await client.query(`SELECT * FROM "${table}"`);
        return result.rows.map(camelize);
      } catch (error) {
        if (table === "employees") throw error;
        console.error(`[preview /api/data] optional table ${table} unavailable:`, error);
        return [];
      }
    }));
    const values = new Map<string, any>(
      loaded[7].map((row: any) => [String(row.key), row.value]),
    );
    const employees = loaded[0].map((row: any) => {
      const safe = { ...row };
      delete safe.pin;
      if (String(safe.id) === "emp-002" || normalize(safe.email) === "ahmed.mahmoud@techsource-gds.com") {
        safe.code = "5002";
        safe.nameAr = "Ahmed Mahmoud";
        safe.nameEn = "Ahmed Mahmoud";
        safe.role = "admin";
      }
      return safe;
    });
    const breakMap = values.get("shiftBreaks");
    const shifts = loaded[4].map((shift: any) => ({
      ...shift,
      breaks: Array.isArray(shift.breaks)
        ? shift.breaks
        : (Array.isArray(breakMap?.[String(shift.id)]) ? breakMap[String(shift.id)] : []),
    }));
    return {
      success: true,
      employees,
      attendanceRecords: loaded[1],
      leaveRequests: loaded[2],
      overtimeRequests: loaded[3],
      shifts,
      notifications: loaded[5],
      employeeShiftAssignments: loaded[6],
      dailyShiftAssignments: Array.isArray(values.get("dailyShiftAssignments")) ? values.get("dailyShiftAssignments") : [],
      shiftSwapRequests: Array.isArray(values.get("shiftSwapRequests")) ? values.get("shiftSwapRequests") : [],
      companyNameAr: values.get("companyNameAr") ?? null,
      companyNameEn: values.get("companyNameEn") ?? null,
      urgentNotice: values.get("urgentNotice") ?? null,
      officialHolidays: Array.isArray(values.get("officialHolidays")) ? values.get("officialHolidays") : [],
      lastUpdated: Date.now(),
    };
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      try {
        const database = await withClient(env, async (client) => {
          const result = await client.query("SELECT 1 AS connected");
          return result.rows[0]?.connected === 1;
        });
        return json({ status: "ok", platform: "cloudflare-workers", database: database ? "connected" : "unknown" });
      } catch (error) {
        console.error("[preview health] database connection failed:", error);
        return json({ status: "degraded", platform: "cloudflare-workers", database: "unavailable" }, 503);
      }
    }

    if (url.pathname === "/api/login") return login(request, env);

    // Employee-specific planned breaks are stored per employee + date.
    // This route is used by the schedule view to load and save the red break bars.
    if (url.pathname === "/api/employee-breaks" && request.method === "GET") {
      const employeeId = String(url.searchParams.get("employeeId") || "").trim();
      const from = String(url.searchParams.get("from") || "").trim();
      const to = String(url.searchParams.get("to") || "").trim();
      const dateRe = /^\\d{4}-\\d{2}-\\d{2}$/;
      if (!employeeId || !dateRe.test(from) || !dateRe.test(to) || from > to) {
        return json({ success: false, error: "employeeId, from and to (YYYY-MM-DD) are required." }, 400);
      }
      try {
        const breaksByDate = await withClient(env, async (client) => {
          const result = await client.query(
            `SELECT id, name, name_ar, name_en, start_time, end_time, duration_minutes, date
             FROM employee_breaks
             WHERE employee_id = $1 AND date >= $2 AND date <= $3
             ORDER BY date, start_time`,
            [employeeId, from, to],
          );
          const grouped: Record<string, any[]> = {};
          for (const row of result.rows) {
            const date = String(row.date);
            (grouped[date] ||= []).push({
              id: String(row.id),
              name: row.name ?? undefined,
              nameAr: row.name_ar ?? undefined,
              nameEn: row.name_en ?? undefined,
              startTime: String(row.start_time),
              endTime: String(row.end_time),
              durationMinutes: Number(row.duration_minutes ?? 0),
            });
          }
          return grouped;
        });
        return json({ success: true, breaksByDate });
      } catch (error) {
        console.error("[preview /api/employee-breaks] GET failed:", error);
        return json({ success: false, error: "Could not load employee breaks." }, 500);
      }
    }

    if (url.pathname === "/api/employee-breaks" && request.method === "POST") {
      let body: any;
      try { body = await request.json(); }
      catch { return json({ success: false, error: "INVALID_JSON" }, 400); }

      const employeeId = String(body?.employeeId ?? "").trim();
      const date = String(body?.date ?? "").trim();
      const dateRe = /^\\d{4}-\\d{2}-\\d{2}$/;
      if (!employeeId || !dateRe.test(date)) {
        return json({ success: false, error: "employeeId and date (YYYY-MM-DD) are required." }, 400);
      }

      const headerId = String(request.headers.get("x-auth-employee-id") ?? "").trim();
      const headerPin = normalizeDigits(request.headers.get("x-auth-pin") ?? "");
      if (!headerId || !headerPin) {
        return json({ success: false, error: "Authentication required. Please sign in again." }, 401);
      }

      const rawBreaks = body?.breaks ?? [];
      if (!Array.isArray(rawBreaks) || rawBreaks.length > 10) {
        return json({ success: false, error: "A day cannot have more than 10 breaks." }, 400);
      }
      const breaks: any[] = [];
      for (const [index, item] of rawBreaks.entries()) {
        const startTime = String(item?.startTime ?? "").trim();
        const endTime = String(item?.endTime ?? "").trim();
        if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(startTime) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(endTime)) {
          return json({ success: false, error: `Break ${index + 1}: start and end times are required in HH:mm format.` }, 400);
        }
        const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
        if (minutes(endTime) <= minutes(startTime)) {
          return json({ success: false, error: `Break ${index + 1}: end time must be after start time.` }, 400);
        }
        breaks.push({
          id: String(item?.id ?? "").trim() || `brk-${crypto.randomUUID()}`,
          name: String(item?.name ?? "").trim() || null,
          nameAr: String(item?.nameAr ?? item?.name ?? "").trim() || null,
          nameEn: String(item?.nameEn ?? item?.name ?? "").trim() || null,
          startTime, endTime, durationMinutes: minutes(endTime) - minutes(startTime),
        });
      }
      breaks.sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < breaks.length; i++) {
        if (breaks[i].startTime < breaks[i - 1].endTime) {
          return json({ success: false, error: "Breaks cannot overlap." }, 400);
        }
      }

      try {
        const saved = await withClient(env, async (client) => {
          const authResult = await client.query("SELECT * FROM employees WHERE id = $1 LIMIT 1", [headerId]);
          const manager = authResult.rows[0] ? camelize(authResult.rows[0]) : null;
          if (!manager || String(manager.status ?? "active") !== "active" || !passwordMatches(manager, headerPin)) {
            return { error: "AUTH", status: 401 };
          }
          const role = normalize(manager.role);
          if (!["admin", "company_admin", "platform_admin", "leader"].includes(role)) {
            return { error: "PERMISSION", status: 403 };
          }
          const targetResult = await client.query("SELECT * FROM employees WHERE id = $1 LIMIT 1", [employeeId]);
          const target = targetResult.rows[0] ? camelize(targetResult.rows[0]) : null;
          if (!target) return { error: "NOT_FOUND", status: 404 };
          const targetRole = normalize(target.role);
          if (role === "leader" && ["admin", "company_admin", "platform_admin"].includes(targetRole)) {
            return { error: "PERMISSION", status: 403 };
          }

          await client.query("BEGIN");
          try {
            await client.query("DELETE FROM employee_breaks WHERE employee_id = $1 AND date = $2", [employeeId, date]);
            for (const item of breaks) {
              await client.query(
                `INSERT INTO employee_breaks
                  (id, company_id, employee_id, date, name, name_ar, name_en, start_time, end_time, duration_minutes, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
                [item.id, target.companyId ?? "tech-source", employeeId, date, item.name, item.nameAr, item.nameEn,
                 item.startTime, item.endTime, item.durationMinutes, new Date().toISOString()],
              );
            }
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
          return { employeeId, date };
        });
        if ("error" in saved) {
          return json({ success: false, error: saved.error }, saved.status);
        }
        return json({ success: true, employeeId, date, breaks, lastUpdated: Date.now() });
      } catch (error) {
        console.error("[preview /api/employee-breaks] POST failed:", error);
        return json({ success: false, error: "Could not save employee breaks." }, 500);
      }
    }

    if (url.pathname === "/api/data" && request.method === "GET") {
      try { return json(await loadAppData(env)); }
      catch (error) {
        console.error("[preview /api/data] database error:", error);
        return json({ success: false, error: "database_snapshot_failed" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        success: false,
        error: "cloudflare_endpoint_not_migrated",
        message: "This API endpoint has not yet been migrated to the Cloudflare preview.",
      }, 501);
    }

    return env.ASSETS.fetch(request);
  },
};
