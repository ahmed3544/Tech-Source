import crypto from "crypto";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { INITIAL_EMPLOYEES } from "../src/mockData.js";
import { passwordMatches, normalizeDigits } from "../server/passwords.js";
import { logActivity } from "../server/activity-logs.js";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function findEmployee(employees: any[], input: string) {
  const cleanInput = normalizeDigits(input).toLowerCase();
  const alphanumeric = cleanInput.replace(/[^a-z0-9]/g, "");
  const numericOnly = cleanInput.replace(/\D/g, "");
  const numericValue = numericOnly ? Number(numericOnly) : null;

  // Ahmed's admin login code is 5002 even if the database still has legacy EMP002.
  if (cleanInput === "5002") {
    const admin = employees.find((e) => String(e?.id || "") === "emp-002" || normalize(e?.email) === "ahmed.mahmoud@techsource-gds.com");
    if (admin) return admin;
  }

  if (cleanInput === "leader") {
    return employees.find((e) => e?.role === "leader" || e?.code === "EMP011") || employees[0];
  }

  return employees.find((e) => {
    if (!e) return false;
    const code = normalize(e.code);
    const employeeAlphanumeric = code.replace(/[^a-z0-9]/g, "");
    const employeeNumericOnly = code.replace(/\D/g, "");
    const employeeNumericValue = employeeNumericOnly ? Number(employeeNumericOnly) : null;

    return (
      code === cleanInput ||
      employeeAlphanumeric === alphanumeric ||
      (numericValue !== null && employeeNumericValue !== null && numericValue === employeeNumericValue) ||
      normalize(e.email) === cleanInput ||
      (e.phone && String(e.phone).replace(/\D/g, "") === numericOnly)
    );
  });
}

async function auditLogin(input: { employeeId?: string | null; loginIdentifier: string; success: boolean; failureReason?: string; req: any }) {
  try {
    await db.insert(schema.loginAudit).values({
      id: crypto.randomUUID(),
      employeeId: input.employeeId ? String(input.employeeId) : null,
      loginIdentifier: String(input.loginIdentifier || "").slice(0, 255),
      success: Boolean(input.success),
      failureReason: input.failureReason ? String(input.failureReason).slice(0, 255) : null,
      ipAddress: String(input.req?.headers?.["x-forwarded-for"] || input.req?.socket?.remoteAddress || "").split(",")[0].trim().slice(0, 100) || null,
      userAgent: String(input.req?.headers?.["user-agent"] || "").slice(0, 500) || null,
      createdAt: new Date().toISOString(),
    } as any);
  } catch (auditError) {
    console.error("[login-audit] failed:", auditError);
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const loginCode = normalizeDigits(body.code);
    const password = normalizeDigits(body.password);

    if (!loginCode || !password) {
      await auditLogin({ loginIdentifier: loginCode || "", success: false, failureReason: "MISSING_CREDENTIALS", req });
      return res.status(400).json({ success: false, error: "Missing credentials" });
    }

    let employees: any[];
    try {
      employees = await db.select().from(schema.employees);
    } catch (dbError) {
      console.error("Neon login database error; using built-in employee fallback:", dbError);
      employees = INITIAL_EMPLOYEES as any[];
    }

    if (!employees?.length) {
      employees = INITIAL_EMPLOYEES as any[];
    }

    const employee = findEmployee(employees, loginCode);

    if (!employee) {
      await auditLogin({ loginIdentifier: loginCode, success: false, failureReason: "INVALID_CREDENTIALS", req });
      return res.status(401).json({ success: false, error: "INVALID_CREDENTIALS" });
    }

    if (String(employee.status ?? "").toLowerCase() === "inactive") {
      await auditLogin({ employeeId: employee.id, loginIdentifier: loginCode, success: false, failureReason: "ACCOUNT_INACTIVE", req });
      return res.status(403).json({ success: false, error: "ACCOUNT_INACTIVE" });
    }

    if (!passwordMatches(employee, password)) {
      await auditLogin({ employeeId: employee.id, loginIdentifier: loginCode, success: false, failureReason: "INVALID_CREDENTIALS", req });
      return res.status(401).json({ success: false, error: "INVALID_CREDENTIALS" });
    }

    const isAhmedAdmin = String(employee?.id || "") === "emp-002" || normalize(employee?.email) === "ahmed.mahmoud@techsource-gds.com";
    const safeEmployee = {
      ...employee,
      ...(isAhmedAdmin ? { code: "5002", nameAr: "Ahmed Mahmoud", nameEn: "Ahmed Mahmoud" } : {}),
    };
    delete safeEmployee.pin;
    await auditLogin({ employeeId: employee.id, loginIdentifier: loginCode, success: true, req });

    // Activity log: successful sign-ins appear in the audit timeline too.
    logActivity({
      actorId: String(employee.id),
      actorName: String(employee.nameAr || employee.nameEn || employee.code || employee.id),
      actorRole: String(employee.role || 'employee'),
      action: 'auth.login',
      entityType: 'auth',
      entityId: String(employee.id),
      entityLabel: String(employee.code || loginCode),
      companyId: employee.companyId ? String(employee.companyId) : 'tech-source',
    });

    return res.status(200).json({
      success: true,
      employee: safeEmployee,
    });
  } catch (error) {
    console.error("POST /api/login:", error);
    return res.status(500).json({ success: false, error: "LOGIN_SERVER_ERROR" });
  }
}