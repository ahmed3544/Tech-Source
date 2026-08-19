const fs = require('fs');
const path = require('path');

const dataPath = path.join(process.cwd(), 'server_data.json');
if (!fs.existsSync(dataPath)) {
  console.log("No server_data.json found!");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('--- AUDIT RESULTS ---');
console.log('Employees:', data.employees ? data.employees.length : 0);
console.log('Attendance:', data.attendanceRecords ? data.attendanceRecords.length : 0);
console.log('Leave Requests:', data.leaveRequests ? data.leaveRequests.length : 0);
console.log('Overtime Requests:', data.overtimeRequests ? data.overtimeRequests.length : 0);
console.log('Settings Keys:', Object.keys(data).filter(k => typeof data[k] !== 'object' || !Array.isArray(data[k])).length);
console.log('---------------------');
