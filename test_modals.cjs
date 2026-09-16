const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// Are there any broken JSX tags inside `showModal` or `showExcuseModal`?
// Let's check `showModal` and `showExcuseModal` structure carefully.
