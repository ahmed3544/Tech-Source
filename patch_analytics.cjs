const fs = require('fs');
let code = fs.readFileSync('src/components/AnalyticsView.tsx', 'utf8');

if (!code.includes('formatHoursToHHMM')) {
  code = code.replace(/import \{([^\}]+)\} from '\.\.\/utils\/helpers';/, "import { formatHoursToHHMM, $1 } from '../utils/helpers';");
}

code = code.replace(
  '<th className="py-3 px-4 font-bold tracking-wide">العمل الإضافي</th>',
  '<th className="py-3 px-4 font-bold tracking-wide">العمل الإضافي</th>\n                            <th className="py-3 px-4 font-bold tracking-wide">نقص ساعات (Minus)</th>'
);
code = code.replace(
  '<th className="py-3 px-4 font-bold tracking-wide">Overtime</th>',
  '<th className="py-3 px-4 font-bold tracking-wide">Overtime</th>\n                            <th className="py-3 px-4 font-bold tracking-wide">Minus Time</th>'
);

code = code.replace(/\{r\.workHours \? `\$\{toWesternDigits\(r\.workHours\)\} س` : '-'\}/g, "{r.checkOut ? formatHoursToHHMM(r.workHours) : '--'}");
code = code.replace(/\{r\.overtimeHours \? `\$\{toWesternDigits\(r\.overtimeHours\)\} س` : '-'\}/g, "{r.checkOut ? formatHoursToHHMM(r.overtimeHours) : '--'}");

// Add table cell for minus hours
code = code.replace(
  /<td className="py-3 px-4 font-mono font-bold text-purple-700">[\s\S]*?<\/td>/g,
  `$&
                          <td className="py-3 px-4 font-mono font-bold text-red-600">
                            {r.checkOut ? formatHoursToHHMM((r as any).minusHours || 0) : '--'}
                          </td>`
);

// Fix summary cards
code = code.replace(
  /const workedHours = empMonthRecords\.reduce[\s\S]*?;/,
  "const workedHours = empMonthRecords.reduce((acc, r) => acc + (!isWeekend(r.date) || r.checkIn ? (r.workHours || 0) : 0), 0);\n    const minusHoursTotal = empMonthRecords.reduce((acc, r) => acc + ((r as any).minusHours || 0), 0);"
);

fs.writeFileSync('src/components/AnalyticsView.tsx', code);
