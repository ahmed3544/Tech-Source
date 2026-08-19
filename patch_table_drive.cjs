const fs = require('fs');
let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

if (!code.includes('DriveBackupButton')) {
  code = code.replace(/import \{([^\}]+)\} from 'lucide-react';/, "import { $1 } from 'lucide-react';\nimport { DriveBackupButton } from './DriveBackupButton';\nimport { generateCSVString } from '../utils/helpers';");
  
  const driveButtonJSX = `
          <DriveBackupButton 
            csvData={generateCSVString(filteredRecords, (id) => {
              const emp = employees.find(e => e.id === id);
              return emp ? emp.nameAr : id;
            })}
            filename={\`attendance_report_\${new Date().toISOString().split('T')[0]}.csv\`}
            lang={lang}
          />
`;
  
  code = code.replace(
    /<button[^>]*onClick=\{onExportCSV\}[^>]*>[\s\S]*?<\/button>/,
    `$&${driveButtonJSX}`
  );
  fs.writeFileSync('src/components/AttendanceLogTable.tsx', code);
}
