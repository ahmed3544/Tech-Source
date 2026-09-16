const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');
code = code.replace(/whitespace-nowrap/g, ''); // Let's strip whitespace-nowrap again, as it might cause text to overflow its container and cause flexbox issues that crash webkit!
fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
