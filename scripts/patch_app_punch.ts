import fs from 'fs';
import path from 'path';

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
let code = fs.readFileSync(appPath, 'utf-8');

// The optimistic update in handlePunch looks like:
/*
    // 1. Immediately update ref
    attendanceRecordsRef.current = nextRecords;
    lastLocalUpdateRef.current = Date.now();

    // 2. Synchronously write to localStorage
    localStorage.setItem('attendance_records', JSON.stringify(nextRecords));

    // 3. Update React UI state
    setAttendanceRecords(nextRecords);

    // 4. Send background sync and direct atomic punch to server, accepting authoritative server response
    try {
*/

const targetRegex = /\/\/ 1\. Immediately update ref[\s\S]*?try \{[\s\S]*?fetch\('\/api\/punch'[\s\S]*?body: JSON\.stringify\(\{ employeeId: emp\.id, action, record: updatedRecord, nowTimeStr \}\)\s*\}\)\s*\.then\(res => res\.json\(\)\)\s*\.then\(data => \{[\s\S]*?\}\)\s*\.catch\(\(\) => \{\}\);\s*\} catch \{\s*\/\/ ignore\s*\}/;

const newLogic = `
    // Call server first to guarantee DB consistency (No Optimistic Overwrite)
    try {
      fetch('/api/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: emp.id, action, record: updatedRecord, nowTimeStr })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.attendanceRecords)) {
          const sanitized = data.attendanceRecords.map(ensureSanitizedRecord);
          attendanceRecordsRef.current = sanitized;
          setAttendanceRecords(sanitized);
          localStorage.setItem('attendance_records', JSON.stringify(sanitized));
          if (data.lastUpdated) {
            lastLocalUpdateRef.current = data.lastUpdated;
          }
        }
      })
      .catch((err) => { console.error("Punch Error:", err); });
    } catch (e) {
      console.error(e);
    }`;

code = code.replace(targetRegex, newLogic);
fs.writeFileSync(appPath, code, 'utf-8');
console.log('Patched App.tsx handlePunch');
