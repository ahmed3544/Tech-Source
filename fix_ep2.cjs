const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');
code = code.replace(/<table className="w-full text-right text-xs">/g, '<table className="w-full text-right text-xs" style={{ tableLayout: "auto" }}>');
fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
