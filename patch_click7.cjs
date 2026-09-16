const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// I will look closely at openEditModal.
// openEditModal sets editingRecord, formEmpId, formRecordType, etc.
// But wait, the user says "لما بضغط علي الجدول" (When I click on the table).
// Is there a sorting header onClick?
