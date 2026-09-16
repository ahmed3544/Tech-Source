const fs = require('fs');

let code = fs.readFileSync('src/components/UrgentNoticeModal.tsx', 'utf8');

code = code.replace(
  /setMessage\(lang === 'ar' \? 'يرجى من جميع موظفي الأقسام إنهاء و\{lang === 'ar' \? 'تسليم التقارير' : 'Submit Reports'\} المطلوبة قبل نهاية الدوام اليوم بدون تأخير\.' : 'Please finish and deliver required reports before end of shift\.'\);/,
  "setMessage(lang === 'ar' ? 'يرجى من جميع موظفي الأقسام إنهاء وتسليم التقارير المطلوبة قبل نهاية الدوام اليوم بدون تأخير.' : 'Please finish and deliver required reports before end of shift.');"
);

code = code.replace(
  /setTitle\(lang === 'ar' \? '\{lang === 'ar' \? 'اجتماع طارئ' : 'Urgent Meeting'\} لجميع فريق العمل' : 'Urgent team meeting'\);/,
  "setTitle(lang === 'ar' ? 'اجتماع طارئ لجميع فريق العمل' : 'Urgent team meeting');"
);

code = code.replace(
  /lang === 'ar' \? 'يظهر التنبيه لجميع الموظفين في الصفحة الرئيسية\.' : 'Notice appears for all employees on the dashboard\.'/,
  "'يظهر التنبيه لجميع الموظفين في الصفحة الرئيسية.'"
);
code = code.replace(
  /\{lang === 'ar'\s*\?\s*'يظهر التنبيه لجميع الموظفين في الصفحة الرئيسية\.'\s*\}/,
  "{lang === 'ar' ? 'يظهر التنبيه لجميع الموظفين في الصفحة الرئيسية.' : 'Notice appears for all employees on the dashboard.'}"
);

fs.writeFileSync('src/components/UrgentNoticeModal.tsx', code);
