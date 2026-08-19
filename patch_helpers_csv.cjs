const fs = require('fs');
let code = fs.readFileSync('src/utils/helpers.ts', 'utf8');

if (!code.includes('generateCSVString')) {
  code += `
export function generateCSVString(
  data: AttendanceRecord[] | Record<string, any>[], 
  getEmpName?: ((id: string) => string)
): string {
  let csvContent = '\uFEFF';
  if (data.length === 0) return csvContent;
  const firstItem = data[0];
  if (typeof firstItem === 'object' && !('employeeId' in firstItem)) {
    const headers = Object.keys(firstItem);
    const rows = (data as Record<string, any>[]).map(row => 
      headers.map(h => \`"\${String(row[h] ?? '').replace(/"/g, '""')}"\`).join(',')
    );
    csvContent += [headers.join(','), ...rows].join('\\n');
  } else {
    const headers = ['التاريخ', 'اسم الموظف', 'الحضور', 'الانصراف', 'ساعات العمل', 'العمل الإضافي', 'تأخير (بالدقائق)', 'الحالة'];
    const rows = (data as AttendanceRecord[]).map(r => [
      toWesternDigits(r.date),
      \`"\${getEmpName ? getEmpName(r.employeeId) : r.employeeId}"\`,
      formatTime(r.checkIn),
      formatTime(r.checkOut),
      toWesternDigits(r.workHours?.toFixed(1) || '0'),
      toWesternDigits(r.overtimeHours?.toFixed(1) || '0'),
      toWesternDigits(r.lateMinutes || 0),
      getStatusText(r.status, 'ar')
    ]);
    csvContent += [headers.join(','), ...rows.map(e => e.join(','))].join('\\n');
  }
  return csvContent;
}
`;
  fs.writeFileSync('src/utils/helpers.ts', code);
}
