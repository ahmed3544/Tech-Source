const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = [
  'src/utils/helpers.ts',
  'src/components/EmployeePortal.tsx',
  'src/components/AttendanceLogTable.tsx',
  'src/components/LeaveManager.tsx',
  'src/components/DashboardOverview.tsx',
  'src/components/AnalyticsView.tsx',
  'src/components/TeamOverallReport.tsx',
  'src/components/EmployeeManager.tsx',
];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, value) { fs.writeFileSync(path.join(root, file), value); }
function addImport(code, importLine) {
  if (code.includes(importLine)) return code;
  const marker = "import React";
  const idx = code.indexOf(marker);
  if (idx >= 0) {
    const end = code.indexOf('\n', idx);
    return code.slice(0, end + 1) + importLine + '\n' + code.slice(end + 1);
  }
  return importLine + '\n' + code;
}

// Central helper fallback: unknown backend Arabic status/label values are normalized before rendering.
{
  const file = 'src/utils/helpers.ts';
  let code = read(file);
  if (!code.includes("from '../i18n'")) {
    code = "import { localizeBackendValue } from '../i18n';\n" + code;
  } else if (!code.includes('localizeBackendValue')) {
    code = code.replace("from '../i18n'", "from '../i18n'");
  }
  code = code.replace(
    "return lang === 'ar' ? mapAr[status] || status : mapEn[status] || status;",
    "return lang === 'ar' ? mapAr[status] || status : localizeBackendValue(mapEn[status] || status, lang);"
  );
  write(file, code);
}

// Employee-facing lists: use English employee names and normalized departments in English mode.
for (const file of files.slice(1)) {
  let code = read(file);
  const hadDepartment = code.includes('e.department') || code.includes('targetEmployee.department') || code.includes('emp.department');
  if (!hadDepartment) continue;
  code = addImport(code, "import { localizeBackendValue } from '../i18n';");
  code = code.replace(/\{e\.department\}/g, "{localizeBackendValue(e.department, lang)}");
  code = code.replace(/\{emp\.department\}/g, "{localizeBackendValue(emp.department, lang)}");
  code = code.replace(/\{targetEmployee\.department\}/g, "{localizeBackendValue(targetEmployee.department, lang)}");
  // English mode must never intentionally render the Arabic employee-name field when an English name exists.
  if (file === 'src/components/EmployeePortal.tsx' || file === 'src/components/LeaveManager.tsx' || file === 'src/components/AttendanceLogTable.tsx' || file === 'src/components/EmployeeManager.tsx') {
    code = code.replace(/\{e\.nameAr\}/g, "{lang === 'en' ? e.nameEn : e.nameAr}");
  }
  write(file, code);
}

console.log('Complete English i18n patch applied.');
