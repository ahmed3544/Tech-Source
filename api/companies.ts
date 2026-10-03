import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";

const PLATFORM_COMPANY_ID = "tech-source";
function clean(v: unknown) { return String(v ?? "").trim(); }
async function getActor(req: any) {
  const actorId = clean(req.query?.actorId || req.body?.actorId);
  if (!actorId) return null;
  const rows = await db.select().from(schema.employees).where(eq(schema.employees.id, actorId));
  return rows[0] || null;
}
function canManageCompanies(actor: any) {
  return Boolean(actor && String(actor.status ?? "active").toLowerCase() !== "inactive" && (
    actor.role === "platform_admin" || actor.role === "admin" ||
    (actor.role === "leader" && String(actor.companyId || "") === PLATFORM_COMPANY_ID)
  ));
}
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const actor = await getActor(req);
    if (!canManageCompanies(actor)) return res.status(403).json({ success: false, error: "COMPANY_MANAGEMENT_FORBIDDEN" });
    if (req.method === "GET") {
      const [companies, employees] = await Promise.all([db.select().from(schema.companies), db.select().from(schema.employees)]);
      const result = companies.map((company: any) => ({ ...company, employeeCount: employees.filter((e: any) => String(e.companyId || "") === String(company.id)).length }));
      return res.status(200).json({ success: true, companies: result });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const code = clean(body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      const nameAr = clean(body.nameAr);
      const nameEn = clean(body.nameEn);
      const adminNameAr = clean(body.adminNameAr);
      const adminNameEn = clean(body.adminNameEn);
      const adminCode = clean(body.adminCode).toUpperCase();
      const password = clean(body.password);
      if (!code || !nameAr || !nameEn || !adminCode || !password) return res.status(400).json({ success: false, error: "MISSING_COMPANY_FIELDS" });
      const existingCompany = await db.select().from(schema.companies).where(eq(schema.companies.code, code));
      if (existingCompany[0]) return res.status(409).json({ success: false, error: "COMPANY_CODE_EXISTS" });
      const existingAdmin = await db.select().from(schema.employees).where(eq(schema.employees.code, adminCode));
      if (existingAdmin[0]) return res.status(409).json({ success: false, error: "ADMIN_CODE_EXISTS" });
      const now = new Date().toISOString();
      const companyId = "company-" + crypto.randomUUID();
      const adminId = "emp-" + crypto.randomUUID();
      await db.insert(schema.companies).values({ id: companyId, code, nameAr, nameEn, logo: clean(body.logo) || null, status: "active", createdAt: now, updatedAt: now } as any);
      await db.insert(schema.employees).values({
        id: adminId, companyId, code: adminCode, nameAr: adminNameAr || adminNameEn || nameAr, nameEn: adminNameEn || adminNameAr || nameEn,
        avatar: "", email: clean(body.adminEmail) || null, phone: clean(body.adminPhone) || null, department: "Management",
        jobTitleAr: "مدير الشركة", jobTitleEn: "Company Admin", shiftId: "shift-1", pin: password, role: "company_admin",
        joinedDate: now.slice(0, 10), status: "active", annualLeaveBalance: 15, casualLeaveBalance: 7, regularLeaveBalance: 8, sickLeaveBalance: 30
      } as any);
      return res.status(201).json({ success: true, company: { id: companyId, code, nameAr, nameEn, status: "active", createdAt: now, updatedAt: now, employeeCount: 1 }, admin: { id: adminId, code: adminCode, nameAr: adminNameAr || adminNameEn || nameAr, nameEn: adminNameEn || adminNameAr || nameEn, role: "company_admin" } });
    }
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  } catch (error) { console.error("[companies] failed:", error); return res.status(500).json({ success: false, error: "COMPANIES_SERVER_ERROR" }); }
}
