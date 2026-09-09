import { and, eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const TZ = process.env.SERVER_TIME_ZONE || 'Africa/Cairo';

function cairoParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const p: any = {};
  for (const x of parts) if (x.type !== 'literal') p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    iso: new Date().toISOString()
  };
}

function normalizeAction(value: any) {
  const x = String(value || '').trim().toLowerCase();
  if (x === 'checkin' || x === 'check-in' || x === 'in') return 'check_in';
  if (x === 'checkout' || x === 'check-out' || x === 'out') return 'check_out';
  return x;
}

export function registerAttendanceRealtime(app: any) {
  app.post('/api/punch', async (req: any, res: any, next: any) => {
    try {
      const employeeId = String(req.body?.employeeId || '').trim();
      const action = normalizeAction(req.body?.action);
      if (!employeeId || !['check_in', 'check_out', 'break_start', 'break_end', 'force_break_end'].includes(action)) return next();

      const clock = cairoParts();
      const employeeRows = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
      if (!employeeRows[0]) return res.status(404).json({ success: false, error: 'Employee not found' });

      const rows = await db.select().from(schema.attendanceRecords).where(and(
        eq(schema.attendanceRecords.employeeId, employeeId),
        eq(schema.attendanceRecords.date, clock.date)
      ));
      const existing: any = rows[0];
      const bodyRecord: any = req.body?.record || {};
      const nowIso = new Date().toISOString();
      const updatedRecord: any = {
        ...(existing || {}),
        ...bodyRecord,
        id: existing?.id || bodyRecord.id || `${employeeId}-${clock.date}`,
        employeeId,
        date: clock.date,
        updatedAt: nowIso
      };

      if (action === 'check_in') updatedRecord.checkIn = clock.time;
      if (action === 'check_out') updatedRecord.checkOut = clock.time;
      if (action === 'break_start') updatedRecord.breakStart = clock.time;
      if (action === 'break_end' || action === 'force_break_end') updatedRecord.breakEnd = clock.time;

      if (!existing) await db.insert(schema.attendanceRecords).values(updatedRecord as any);
      else await db.update(schema.attendanceRecords).set(updatedRecord as any).where(eq(schema.attendanceRecords.id, existing.id));

      const attendanceRecords = await db.select().from(schema.attendanceRecords);
      return res.json({ success: true, record: updatedRecord, attendanceRecords, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[attendance-realtime]', error);
      return res.status(500).json({ success: false, error: 'Attendance update failed' });
    }
  });
}
