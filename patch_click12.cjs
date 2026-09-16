const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The crash might not be from AttendanceLogTable. When they say "لما بضغط علي الجدول", maybe they mean the Attendance card in the Dashboard Overview that shows a mini table?
// Let's check what tables are in DashboardOverview.tsx
