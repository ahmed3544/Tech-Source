const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// There is a potential issue with the onClick handlers inside td cells or tr.
// I see in the previous grep there is NO onClick on `tr`.
// Is there a row click handler?
// What if we remove all `backdrop-blur-sm` from the modal? Sometimes Backdrop blur causes rendering crashes on some devices.

code = code.replace(/backdrop-blur-[a-z]+/g, '');

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
