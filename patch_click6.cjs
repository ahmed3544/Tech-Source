const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// Are there any undefined components inside AttendanceLogTable?
// Let's make sure the <tr> itself doesn't have broken JSX or undefined functions.
// `isBreakActive` is calculated correctly.
// Also check `handleOpenExcuseModal` and `selectedRecordToExcuse`
