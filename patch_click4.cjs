const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');
// Let's add back the missing td classes so table renders safely.
code = code.replace(/<td className="py-3\.5 px-4">/g, '<td className="py-3.5 px-4 whitespace-nowrap">');
code = code.replace(/<td className="py-3\.5 px-4 font-mono">/g, '<td className="py-3.5 px-4 font-mono whitespace-nowrap">');

fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
