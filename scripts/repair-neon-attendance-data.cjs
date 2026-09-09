const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.log('[neon-repair] no database URL; skipping');
  process.exit(0);
}

function unwrap(value) {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (
      Array.isArray(current) &&
      current.length === 1 &&
      current[0] &&
      typeof current[0] === 'object' &&
      !Array.isArray(current[0]) &&
      Object.prototype.hasOwnProperty.call(current[0], 'value')
    ) {
      current = current[0].value;
      continue;
    }
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      Object.keys(current).length === 1 &&
      Object.prototype.hasOwnProperty.call(current, 'value')
    ) {
      current = current.value;
      continue;
    }
    break;
  }
  return current;
}

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function textOr(value, fallback = null) {
  return value == null ? fallback : String(value);
}

async function main() {
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const result = await client.query("SELECT value FROM settings WHERE key = 'shiftTemplates' LIMIT 1");
    const raw = result.rows[0]?.value;
    const templates = unwrap(raw);
    if (!Array.isArray(templates)) {
      console.log('[neon-repair] shiftTemplates is not an array; nothing to repair');
      return;
    }

    let repaired = 0;
    for (const shift of templates) {
      if (!shift?.id || !shift?.startTime || !shift?.endTime) continue;
      const id = String(shift.id);
      const name = textOr(shift.nameEn || shift.nameAr || id, id);
      const startTime = String(shift.startTime);
      const endTime = String(shift.endTime);
      const durationMinutes = numberOr(shift.durationMinutes, 480);
      const breakMinutes = Array.isArray(shift.breaks)
        ? shift.breaks.reduce((sum, item) => sum + numberOr(item?.durationMinutes, 0), 0)
        : numberOr(shift.breakMinutes, 0);
      const gracePeriodMinutes = numberOr(shift.gracePeriodMinutes, 0);
      const overtimeEnabled = Boolean(shift.overtimeEnabled);
      const isOvernight = Boolean(shift.isOvernight || startTime > endTime);
      const createdAt = textOr(shift.createdAt, new Date().toISOString());
      const updatedAt = textOr(shift.updatedAt, createdAt);

      await client.query(
        `INSERT INTO shifts
          (id, name, start_time, end_time, duration_minutes, break_minutes,
           grace_period_minutes, overtime_enabled, is_overnight, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           duration_minutes = EXCLUDED.duration_minutes,
           break_minutes = EXCLUDED.break_minutes,
           grace_period_minutes = EXCLUDED.grace_period_minutes,
           overtime_enabled = EXCLUDED.overtime_enabled,
           is_overnight = EXCLUDED.is_overnight,
           updated_at = EXCLUDED.updated_at`,
        [id, name, startTime, endTime, durationMinutes, breakMinutes,
          gracePeriodMinutes, overtimeEnabled, isOvernight, createdAt, updatedAt]
      );
      repaired += 1;
    }

    // Keep the setting in the canonical array form so every client receives the same shape.
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('shiftTemplates', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(templates)]
    );

    console.log(`[neon-repair] repaired ${repaired} shift template(s)`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[neon-repair] failed:', error);
  process.exit(1);
});
