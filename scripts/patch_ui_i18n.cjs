const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/EmployeePortal.tsx', (code) => {
  if (!code.includes("../i18n")) {
    code = code.replace("import { BreakTimer } from './BreakTimer';", "import { BreakTimer } from './BreakTimer';\nimport { getUiText } from '../i18n';");
  }
  if (!code.includes('const ui = getUiText(lang);')) {
    code = code.replace("  currentUser,\n}) => {", "  currentUser,\n}) => {\n  const ui = getUiText(lang);");
  }
  code = code.replace(/Sparkles,\n/g, '');
  code = code.replace(/'إنهاء الاستراحة والعودة للعمل ✨'/g, 'ui.endBreak');
  code = code.replace(/'End Break Now ✨'/g, 'ui.endBreak');
  code = code.replace(/'العودة من الاستراحة ✨'/g, 'ui.endBreak');
  code = code.replace(/'End Break ✨'/g, 'ui.endBreak');
  code = code.replace(/• قسم \{e\.department\}/g, '• {ui.department} {e.department}');
  code = code.replace(/req\.status === 'approved' \? 'معتمدة'/g, "req.status === 'approved' ? ui.approved");
  code = code.replace(/Regular Leave \(معتمدة\)/g, "Regular Leave (${ui.approved})");
  code = code.replace(/\+\{effectiveLateMins\} دقيقة/g, '+{effectiveLateMins} {ui.minuteUnit}');
  code = code.replace(/0 دقيقة/g, '0 {ui.minuteUnit}');
  code = code.replace(/(\$\{[^}]+\}) س`/g, '$1 ${ui.hourUnit}`');
  code = code.replace(/(\$\{[^}]+\}) ساعة`/g, '$1 ${ui.hourUnit}`');
  return code;
});

patchFile('src/components/KioskPunch.tsx', (code) => {
  code = code.replace(/'العودة من الاستراحة ✨'/g, "'العودة من الاستراحة'");
  code = code.replace(/'End Break ✨'/g, "'End Break'");
  code = code.replace(/'End Break Now ✨'/g, "'End Break'");
  return code;
});

patchFile('src/components/DashboardOverview.tsx', (code) => {
  code = code.replace(/🏖️\s*/g, '');
  return code;
});

patchFile('src/utils/helpers.ts', (code) => {
  code = code.replace(/Weekend Holiday 🏖️/g, 'Weekend Holiday');
  code = code.replace(/عطلة أسبوعية 🏖️/g, 'عطلة أسبوعية');
  return code;
});

patchFile('src/components/AttendanceLogTable.tsx', (code) => {
  if (!code.includes("../i18n")) {
    code = code.replace("import { BulkAttendanceModal } from './BulkAttendanceModal';", "import { BulkAttendanceModal } from './BulkAttendanceModal';\nimport { getUiText } from '../i18n';");
  }
  if (!code.includes('const ui = getUiText(lang);')) {
    code = code.replace("  globalSearchTerm,\n}) => {", "  globalSearchTerm,\n}) => {\n  const ui = getUiText(lang);");
  }
  code = code.replace(/(\$\{[^}]+\}) س`/g, '$1 ${ui.hourUnit}`');
  code = code.replace(/(\$\{[^}]+\}) دقيقة`/g, '$1 ${ui.minuteUnit}`');
  return code;
});

console.log('UI localization and emoji cleanup patch applied.');
