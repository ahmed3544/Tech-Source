import fs from 'fs';
import path from 'path';

const serverTsPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverTsPath, 'utf-8');

const regex = /const \{ employees, attendanceRecords, leaveRequests, companyNameAr, companyNameEn, urgentNotice, deletedAttendanceIds, deletedEmployeeIds, deletedLeaveIds \} = req.body;/g;
let matchCount = 0;
code = code.replace(regex, (match) => {
  matchCount++;
  if (matchCount > 1) {
    return ""; // Remove duplicates
  }
  return match;
});

// Also check for multiple "// LEGACY JSON MODE"
code = code.replace(/\/\/ LEGACY JSON MODE\n\n\/\/ LEGACY JSON MODE/g, "// LEGACY JSON MODE");

fs.writeFileSync(serverTsPath, code, 'utf-8');
console.log('Fixed server.ts');
