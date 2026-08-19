const fs = require('fs');
let code = fs.readFileSync('src/components/EmployeePortal.tsx', 'utf8');

code = code.replace(/shifts: Shift\[\];\n  shifts\?: Shift\[\];/, 'shifts: Shift[];');
code = code.replace(/shifts\?: Shift\[\];/, '');
code = code.replace(/shifts,\n  onPunch,\n  onAddLeave,\n  onUpdateEmployee,\n  onAddRecord,\n  onUpdateRecord,\n  onUpdateLeaveStatus,\n  shifts = \[\],/g, 'shifts,\n  onPunch,\n  onAddLeave,\n  onUpdateEmployee,\n  onAddRecord,\n  onUpdateRecord,\n  onUpdateLeaveStatus,');

fs.writeFileSync('src/components/EmployeePortal.tsx', code);
