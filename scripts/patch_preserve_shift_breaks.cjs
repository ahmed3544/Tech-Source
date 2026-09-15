const fs = require('fs');

const path = 'src/App.tsx';
if (!fs.existsSync(path)) process.exit(0);

const before = fs.readFileSync(path, 'utf8');
const pattern = /if \(Array\.isArray\(data\.shifts\)\) \{\s*setShifts\(data\.shifts\);\s*localStorage\.setItem\('attendance_shifts', JSON\.stringify\(data\.shifts\)\);\s*\}/;

const replacement = `if (Array.isArray(data.shifts)) {
            // Keep break definitions when a sync response contains shift rows
            // without the separately persisted break metadata.
            let storedShifts = [];
            try {
              const rawStoredShifts = localStorage.getItem('attendance_shifts');
              storedShifts = rawStoredShifts ? JSON.parse(rawStoredShifts) : [];
            } catch {}

            const stableShifts = data.shifts.map((incomingShift: any) => {
              const previousShift = Array.isArray(storedShifts)
                ? storedShifts.find((item: any) => String(item?.id) === String(incomingShift?.id))
                : undefined;
              const breaks = Array.isArray(incomingShift?.breaks)
                ? incomingShift.breaks
                : (Array.isArray(previousShift?.breaks) ? previousShift.breaks : []);
              return { ...incomingShift, breaks };
            });

            setShifts(stableShifts);
            localStorage.setItem('attendance_shifts', JSON.stringify(stableShifts));
          }`;

if (pattern.test(before)) {
  fs.writeFileSync(path, before.replace(pattern, replacement), 'utf8');
}
