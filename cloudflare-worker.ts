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
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!employeeId || !dateRe.test(from) || !dateRe.test(to) || from > to) {
        return json({ success: false, error: "employeeId, from and to (YYYY-MM-DD) are required." }, 400);
      }
      try {
        const breaksByDate = await withClient(env, async (client) => {
          const result = await client.query(
            `SELECT id, name, name_ar, name_en, start_time, end_time, duration_minutes,
                    date::text AS date_key
             FROM employee_breaks
             WHERE employee_id = $1 AND date::text >= $2 AND date::text <= $3
             ORDER BY date::text, start_time`,
            [employeeId, from, to],
          );
          const grouped: Record<string, any[]> = {};
          for (const row of result.rows) {
            const date = String(row.date_key);
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
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
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
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
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


    // Monthly roster persistence: keep the legacy settings snapshot contract
    // used by the current React client while enforcing manager authentication.
    if (url.pathname === "/api/schedule-sync" && request.method === "GET") {
      try {
        const assignments = await withClient(env, async (client) => {
          const result = await client.query("SELECT value FROM settings WHERE key = $1 LIMIT 1", ["dailyShiftAssignments"]);
          const value = result.rows[0]?.value;
          return Array.isArray(value) ? value : [];
        });
        return json({ success: true, dailyShiftAssignments: assignments });
      } catch (error) {
        console.error("[preview schedule-sync] GET failed:", error);
        return json({ success: false, error: "DIRECT_SCHEDULE_READ_FAILED" }, 500);
      }
    }

    if (url.pathname === "/api/schedule-sync" && request.method === "POST") {
      let body: any;
      try { body = await request.json(); }
      catch { return json({ success: false, error: "INVALID_JSON" }, 400); }
      const authId = String(request.headers.get("x-auth-employee-id") || "").trim();
      const authPin = normalizeDigits(request.headers.get("x-auth-pin") || "");
      if (!authId || !authPin) return json({ success: false, error: "Authentication required." }, 401);
      if (!Array.isArray(body?.dailyShiftAssignments)) {
        return json({ success: false, error: "dailyShiftAssignments must be an array" }, 400);
      }
      const dateKey = (value: any) => {
        const raw = String(value ?? "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
      };
      const incoming = body.dailyShiftAssignments.map((item: any) => {
        const status = String(item?.status || "").toUpperCase();
        const clear = Boolean(item?.clear || item?.isClear || item?.is_clear || status === "CLEAR");
        const rawShift = String(item?.shiftId ?? item?.shift_id ?? "").trim();
        const off = !clear && !rawShift && (Boolean(item?.isOffDay ?? item?.is_off_day) || status === "OFF");
        return {
          employeeId: String(item?.employeeId ?? item?.employee_id ?? "").trim(),
          date: dateKey(item?.date ?? item?.scheduleDate ?? item?.schedule_date),
          shiftId: clear || off ? "" : rawShift,
          isOffDay: off,
          clear,
          shadowing: item && Object.prototype.hasOwnProperty.call(item, "shadowing") ? item.shadowing : undefined,
          assignedBy: String(item?.assignedBy ?? item?.assigned_by ?? body?.assignedBy ?? "").trim(),
          updatedAt: String(item?.updatedAt ?? item?.updated_at ?? new Date().toISOString()),
        };
      });
      const invalid = incoming.find((x: any) => !x.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || (!x.clear && !x.isOffDay && !x.shiftId));
      if (invalid) return json({ success: false, code: "INVALID_SCHEDULE_PAYLOAD", message: "Each schedule assignment requires employee, date and shift or OFF." }, 400);
      try {
        const saved = await withClient(env, async (client) => {
          const authRows = await client.query("SELECT * FROM employees WHERE id = $1 LIMIT 1", [authId]);
          const manager = authRows.rows[0] ? camelize(authRows.rows[0]) : null;
          if (!manager || String(manager.status ?? "active").toLowerCase() === "inactive" || !passwordMatches(manager, authPin)) {
            return { error: "AUTH", status: 401 };
          }
          const role = normalize(manager.role);
          if (!["admin", "company_admin", "platform_admin", "leader"].includes(role)) return { error: "PERMISSION", status: 403 };
          const ids = Array.from(new Set(incoming.map((x: any) => x.employeeId)));
          const targetRows = await client.query("SELECT id, role, team_leader_id FROM employees WHERE id = ANY($1::text[])", [ids]);
          const targets = new Map(targetRows.rows.map((x: any) => [String(x.id), camelize(x)]));
          for (const id of ids) {
            const target: any = targets.get(id);
            if (!target) return { error: "EMPLOYEE_NOT_FOUND", status: 404 };
            if (role === "leader" && (["admin", "company_admin", "platform_admin"].includes(normalize(target.role)) || (target.teamLeaderId && String(target.teamLeaderId) !== authId))) {
              return { error: "TEAM_SCOPE", status: 403 };
            }
          }
          const currentResult = await client.query("SELECT value FROM settings WHERE key = $1 LIMIT 1", ["dailyShiftAssignments"]);
          const current = Array.isArray(currentResult.rows[0]?.value) ? currentResult.rows[0].value : [];
          const map = new Map<string, any>();
          for (const raw of current) {
            const employeeId = String(raw?.employeeId ?? raw?.employee_id ?? "");
            const date = dateKey(raw?.date ?? raw?.scheduleDate ?? raw?.schedule_date);
            if (employeeId && date) map.set(employeeId + "|" + date, { ...raw, employeeId, date });
          }
          const stamp = new Date().toISOString();
          for (const item of incoming) {
            const key = item.employeeId + "|" + item.date;
            const previous = map.get(key);
            if (previous?.updatedAt && Date.parse(item.updatedAt) < Date.parse(String(previous.updatedAt))) continue;
            if (item.clear) { map.delete(key); continue; }
            const next: any = { employeeId: item.employeeId, date: item.date, shiftId: item.shiftId, isOffDay: item.isOffDay, assignedBy: item.assignedBy || authId, updatedAt: item.updatedAt || stamp };
            if (item.shadowing !== undefined) next.shadowing = item.shadowing;
            else if (previous && Object.prototype.hasOwnProperty.call(previous, "shadowing")) next.shadowing = previous.shadowing;
            map.set(key, next);
          }
          const assignments = Array.from(map.values());
          await client.query(
            "INSERT INTO settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
            ["dailyShiftAssignments", JSON.stringify(assignments)],
          );
          return { assignments, stamp };
        });
        if ("error" in saved) return json({ success: false, error: saved.error }, saved.status);
        return json({ success: true, dailyShiftAssignments: saved.assignments, lastUpdated: Date.now(), updatedAt: saved.stamp });
      } catch (error) {
        console.error("[preview schedule-sync] POST failed:", error);
        return json({ success: false, error: "DIRECT_SCHEDULE_SYNC_FAILED" }, 500);
      }
    }

    if (url.pathname === "/api/rotation-patterns" && request.method === "GET") {
      try {
        return await withClient(env, async (client) => {
          const [patterns, items] = await Promise.all([
            client.query("SELECT * FROM rotation_patterns ORDER BY created_at"),
            client.query("SELECT * FROM rotation_pattern_items ORDER BY pattern_id, sequence"),
          ]);
          return json({ success: true, rotationPatterns: patterns.rows.map(camelize), rotationPatternItems: items.rows.map(camelize) });
        });
      } catch (error) {
        console.error("[preview rotation-patterns] GET failed:", error);
        return json({ success: false, error: "ROTATION_PATTERNS_READ_FAILED" }, 500);
      }
    }

    if (url.pathname === "/api/rotation-patterns" && request.method === "POST") {
      let body: any;
      try { body = await request.json(); }
      catch { return json({ success: false, error: "INVALID_JSON" }, 400); }
      const authId = String(request.headers.get("x-auth-employee-id") || "").trim();
      const authPin = normalizeDigits(request.headers.get("x-auth-pin") || "");
      if (!authId || !authPin) return json({ success: false, error: "Authentication required." }, 401);
      try {
        const snapshot = await withClient(env, async (client) => {
          const authRows = await client.query("SELECT * FROM employees WHERE id=$1 LIMIT 1", [authId]);
          const manager = authRows.rows[0] ? camelize(authRows.rows[0]) : null;
          if (!manager || !passwordMatches(manager, authPin)) return { error: "AUTH", status: 401 };
          if (!["admin", "company_admin", "platform_admin", "leader"].includes(normalize(manager.role))) return { error: "PERMISSION", status: 403 };
          await client.query("BEGIN");
          try {
            const patterns = Array.isArray(body?.rotationPatterns) ? body.rotationPatterns : (body?.pattern ? [body.pattern] : []);
            const items = Array.isArray(body?.rotationPatternItems) ? body.rotationPatternItems : [];
            for (const raw of patterns) {
              const id = String(raw?.id || "").trim(), name = String(raw?.name || "").trim();
              if (!id || !name) continue;
              const now = new Date().toISOString();
              await client.query(
                "INSERT INTO rotation_patterns(id,company_id,name,shift_ids,created_by,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,shift_ids=EXCLUDED.shift_ids,updated_at=EXCLUDED.updated_at",
                [id, manager.companyId ?? "tech-source", name, JSON.stringify(Array.isArray(raw.shiftIds) ? raw.shiftIds : []), authId, now],
              );
            }
            for (const raw of items) {
              const id = String(raw?.id || "").trim(), patternId = String(raw?.patternId ?? raw?.pattern_id ?? "").trim(), shiftId = String(raw?.shiftId ?? raw?.shift_id ?? "").trim(), sequence = Number(raw?.sequence ?? 0);
              if (!id || !patternId || !shiftId || !Number.isInteger(sequence)) continue;
              await client.query(
                "INSERT INTO rotation_pattern_items(id,company_id,pattern_id,shift_id,sequence) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET pattern_id=EXCLUDED.pattern_id,shift_id=EXCLUDED.shift_id,sequence=EXCLUDED.sequence",
                [id, manager.companyId ?? "tech-source", patternId, shiftId, sequence],
              );
            }
            for (const id of (Array.isArray(body?.deletedRotationPatternItemIds) ? body.deletedRotationPatternItemIds : []).map(String).filter(Boolean)) {
              await client.query("DELETE FROM rotation_pattern_items WHERE id=$1", [id]);
            }
            for (const id of (Array.isArray(body?.deletedRotationPatternIds) ? body.deletedRotationPatternIds : []).map(String).filter(Boolean)) {
              await client.query("DELETE FROM rotation_pattern_items WHERE pattern_id=$1", [id]);
              await client.query("DELETE FROM rotation_patterns WHERE id=$1", [id]);
            }
            await client.query("COMMIT");
          } catch (error) { await client.query("ROLLBACK"); throw error; }
          const [patternsResult, itemsResult] = await Promise.all([
            client.query("SELECT * FROM rotation_patterns ORDER BY created_at"),
            client.query("SELECT * FROM rotation_pattern_items ORDER BY pattern_id, sequence"),
          ]);
          return { rotationPatterns: patternsResult.rows.map(camelize), rotationPatternItems: itemsResult.rows.map(camelize) };
        });
        if ("error" in snapshot) return json({ success: false, error: snapshot.error }, snapshot.status);
        return json({ success: true, ...snapshot });
      } catch (error) {
        console.error("[preview rotation-patterns] POST failed:", error);
        return json({ success: false, error: "ROTATION_PATTERNS_SAVE_FAILED" }, 500);
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
