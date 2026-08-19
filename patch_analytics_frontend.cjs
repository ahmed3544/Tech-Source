const fs = require('fs');
let code = fs.readFileSync('src/components/AnalyticsView.tsx', 'utf8');

// Table 1 header
code = code.replace(
  '<th className="py-3 px-4 whitespace-nowrap">ساعات العمل</th>',
  '<th className="py-3 px-4 whitespace-nowrap">ساعات العمل</th>\\n                      <th className="py-3 px-4 whitespace-nowrap">العمل الإضافي</th>'
);

// Table 1 body
code = code.replace(
  /<td className="py-3 px-4 font-mono font-bold text-blue-700">\s*\{r\.workHours \? \`\$\{toWesternDigits\(r\.workHours\)\} س\` : '-'\}\s*<\/td>/,
  '<td className="py-3 px-4 font-mono font-bold text-blue-700">\\n                            {r.workHours ? `${toWesternDigits(r.workHours)} س` : \'-\'}\\n                          </td>\\n                          <td className="py-3 px-4 font-mono font-bold text-purple-700">\\n                            {r.overtimeHours ? `${toWesternDigits(r.overtimeHours)} س` : \'-\'}\\n                          </td>'
);

// Team Monthly Data calc
const teamMonthlyCalcRegex = /const workedHours = empMonthRecords\.reduce\(\(acc, r\) => acc \+ \(\!isWeekend\(r\.date\) \|\| r\.checkIn \? \(r\.workHours \|\| 0\) : 0\), 0\);/;
const teamMonthlyCalcReplacement = `const workedHours = empMonthRecords.reduce((acc, r) => acc + (!isWeekend(r.date) || r.checkIn ? (r.workHours || 0) : 0), 0);
    const overtimeHoursTotal = empMonthRecords.reduce((acc, r) => acc + (r.overtimeHours || 0), 0);`;
code = code.replace(teamMonthlyCalcRegex, teamMonthlyCalcReplacement);

// Team Monthly Data return
const teamMonthlyReturnRegex = /return \{\n\s*emp,\n\s*presentDays,/;
const teamMonthlyReturnReplacement = `return {
      emp,
      overtimeHoursTotal,
      presentDays,`;
code = code.replace(teamMonthlyReturnRegex, teamMonthlyReturnReplacement);

// Export data
const exportDataRegex = /'إجمالي ساعات العمل': item\.workedHours,\n\s*'نسبة الالتزام':/;
const exportDataReplacement = `'إجمالي ساعات العمل': item.workedHours,
      'إجمالي العمل الإضافي': item.overtimeHoursTotal,
      'نسبة الالتزام':`;
code = code.replace(exportDataRegex, exportDataReplacement);

// Table 2 header
code = code.replace(
  '<th className="p-3 text-center whitespace-nowrap">إجمالي ساعات العمل</th>',
  '<th className="p-3 text-center whitespace-nowrap">إجمالي ساعات العمل</th>\\n                  <th className="p-3 text-center whitespace-nowrap">إجمالي العمل الإضافي</th>'
);

// Table 2 mapping destructure
const mapDestructureRegex = /teamMonthlyData\.map\(\(\{ emp, presentDays, absentDays, lateDays, leaveDays, lateMins, workedHours \}\) => \{/g;
const mapDestructureReplacement = `teamMonthlyData.map(({ emp, presentDays, absentDays, lateDays, leaveDays, lateMins, workedHours, overtimeHoursTotal }) => {`;
code = code.replace(mapDestructureRegex, mapDestructureReplacement);

// Table 2 body
const tb2BodyRegex = /<td className="p-3 text-center font-bold text-blue-700">\s*\{toWesternDigits\(workedHours\)\} س\s*<\/td>/;
const tb2BodyReplacement = `<td className="p-3 text-center font-bold text-blue-700">
                        {toWesternDigits(workedHours)} س
                      </td>
                      <td className="p-3 text-center font-bold text-purple-700">
                        {overtimeHoursTotal > 0 ? \`+\${toWesternDigits(overtimeHoursTotal)} س\` : '-'}
                      </td>`;
code = code.replace(tb2BodyRegex, tb2BodyReplacement);

fs.writeFileSync('src/components/AnalyticsView.tsx', code);
