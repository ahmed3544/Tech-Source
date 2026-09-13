import { db } from "../../src/db/index.js";
import * as schema from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { employeeId, token, platform = "unknown" } = req.body || {};
  if (!employeeId || !token) {
    return res.status(400).json({ success: false, error: "employeeId and token are required" });
  }

  try {
    const rows: any[] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "fcm_tokens"))
      .limit(1);

    const current = Array.isArray(rows[0]?.value) ? rows[0].value : [];
    const next = current.filter(
      (item: any) => String(item?.token || "") !== String(token)
    );

    next.push({
      employeeId: String(employeeId),
      token: String(token),
      platform: String(platform),
      updatedAt: new Date().toISOString(),
    });

    await db
      .insert(schema.settings)
      .values({ key: "fcm_tokens", value: next } as any)
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: next } as any,
      });

    console.info("[FCM] token registered", {
      employeeId: String(employeeId),
      platform: String(platform),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[FCM] direct register failed", error);
    return res.status(500).json({ success: false, error: "push_registration_failed" });
  }
}
