const fs = require('fs');
let code = fs.readFileSync('src/components/EmployeePortal.tsx', 'utf8');

if (!code.includes('shifts: Shift[];')) {
  code = code.replace(/leaveRequests: LeaveRequest\[\];/, 'leaveRequests: LeaveRequest[];\n  shifts: Shift[];');
  code = code.replace(/leaveRequests,\n  onPunch,/, 'leaveRequests,\n  shifts,\n  onPunch,');
}

fs.writeFileSync('src/components/EmployeePortal.tsx', code);
