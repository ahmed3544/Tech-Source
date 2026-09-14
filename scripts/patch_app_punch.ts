import fs from 'fs';
import path from 'path';

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
let code = fs.readFileSync(appPath, 'utf-8');

// Match the old optimistic punch block without relying on escaped slash syntax
// that can make the TypeScript transformer fail before the script runs.
const targetRegex = /\/\/ 1\. Immediately update ref[\s\S]*?try \{[\s\S]*?fetch\('\/api\/punch'[\s\S]*?\}\);[\s\S]*?\} catch \{\s*\/\/ ignore\s*\}/;

const newLogic = `
    // Call server first to guarantee DB consistency (Neon is authoritative)
    try {
      fetch('/api/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.id,
          employee: emp,
          action,
          record: updatedRecord,
          nowTimeStr
        })
      })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || \`Punch failed: \${res.status}\`);
        return data;
      })
      .then(data => {
        if (data && data.success && Array.isArray(data.attendanceRecords)) {
          const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
          attendanceRecordsRef.current = sanitized;
          setAttendanceRecords(sanitized);
          if (data.lastUpdated) {
            lastLocalUpdateRef.current = data.lastUpdated;
          }
        }
      })
      .catch((err) => { console.error('[Punch Error]', err); });
    } catch (e) {
      console.error('[Punch Error]', e);
    }`;

const nextCode = code.replace(targetRegex, newLogic);
if (nextCode !== code) {
  code = nextCode;
  fs.writeFileSync(appPath, code, 'utf-8');
  console.log('Patched App.tsx handlePunch');
} else {
  console.log('patch_app_punch: target block not found; leaving App.tsx unchanged');
}
