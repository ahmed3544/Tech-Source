const fs = require('fs');

let code = fs.readFileSync('src/components/UrgentNoticeModal.tsx', 'utf8');

// The problematic code:
// setTitle(lang === 'ar' ? 'أمر عاجل بخصوص {lang === 'ar' ? 'تسليم التقارير' : 'Submit Reports'} الأسبوعية' : 'Urgent notice regarding reports');
// Let's just fix it by replacing the whole line.
code = code.replace(
  /setTitle\(lang === 'ar' \? 'أمر عاجل بخصوص \{lang === 'ar' \? 'تسليم التقارير' : 'Submit Reports'\} الأسبوعية' : 'Urgent notice regarding reports'\);/,
  "setTitle(lang === 'ar' ? 'أمر عاجل بخصوص تسليم التقارير الأسبوعية' : 'Urgent notice regarding reports');"
);

fs.writeFileSync('src/components/UrgentNoticeModal.tsx', code);
