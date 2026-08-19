const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

if (!code.includes('formatHoursToHHMM')) {
  code = code.replace(/import \{([^\}]+)\} from '\.\.\/utils\/helpers';/, "import { formatHoursToHHMM, $1 } from '../utils/helpers';");
}

// Add Minus Time column
code = code.replace(
  '<th className="py-4 px-4 font-bold tracking-wide">العمل الإضافي</th>',
  '<th className="py-4 px-4 font-bold tracking-wide">العمل الإضافي</th>\n                            <th className="py-4 px-4 font-bold tracking-wide">نقص ساعات (Minus)</th>'
);
code = code.replace(
  '<th className="py-4 px-4 font-bold tracking-wide">Overtime</th>',
  '<th className="py-4 px-4 font-bold tracking-wide">Overtime</th>\n                            <th className="py-4 px-4 font-bold tracking-wide">Minus Time</th>'
);

// Format workHours, overtimeHours, and minusHours
code = code.replace(/\{rec\.workHours \? `\$\{toWesternDigits\(rec\.workHours\)\} س` : '-'\}/g, "{rec.checkOut ? formatHoursToHHMM(rec.workHours) : '--'}");
code = code.replace(/\{rec\.overtimeHours \? `\$\{toWesternDigits\(rec\.overtimeHours\)\} س` : '-'\}/g, "{rec.checkOut ? formatHoursToHHMM(rec.overtimeHours) : '--'}");

// Add table cell for minus hours
code = code.replace(
  /<td className="py-3\.5 px-4 font-mono font-bold text-amber-700">[\s\S]*?<\/td>/g,
  `$&
                            <td className="py-3.5 px-4 font-mono font-bold text-red-600">
                              {rec.checkOut ? formatHoursToHHMM((rec as any).minusHours || 0) : '--'}
                            </td>`
);

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
