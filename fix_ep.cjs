const fs = require('fs');

let code = fs.readFileSync('src/components/EmployeePortal.tsx', 'utf8');
code = code.replace(/<table className="w-full text-xs text-right border-collapse">/g, '<table className="w-full text-xs text-right border-collapse" style={{ tableLayout: "auto" }}>');
fs.writeFileSync('src/components/EmployeePortal.tsx', code);
