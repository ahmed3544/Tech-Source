const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// The issue might be that clicking on the table triggers some row selection or modal that causes a white screen
// Let's check what onClick handlers are on the table rows.
