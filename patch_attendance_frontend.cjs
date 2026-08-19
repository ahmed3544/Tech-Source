const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// Header
code = code.replace(
  '<th className="p-4 whitespace-nowrap">ساعات العمل</th>',
  '<th className="p-4 whitespace-nowrap">ساعات العمل</th>\\n                  <th className="p-4 whitespace-nowrap">العمل الإضافي</th>'
);

// Body
const bodyRegex = /<td className="p-4 font-bold text-blue-700 font-mono">\s*\{rec\.workHours \? \`\$\{toWesternDigits\(rec\.workHours\)\} س\` : '-'\}\s*<\/td>/;
const bodyReplacement = `<td className="p-4 font-bold text-blue-700 font-mono">
                            {rec.workHours ? \`\${toWesternDigits(rec.workHours)} س\` : '-'}
                          </td>
                          <td className="p-4 font-bold text-purple-700 font-mono">
                            {rec.overtimeHours ? \`+\${toWesternDigits(rec.overtimeHours)} س\` : '-'}
                          </td>`;
code = code.replace(bodyRegex, bodyReplacement);

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
