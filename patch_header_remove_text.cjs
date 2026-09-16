const fs = require('fs');
let code = fs.readFileSync('src/components/Header.tsx', 'utf8');

code = code.replace(
  /\{isLeader && <div className="hidden lg:flex justify-center text-\[9px\] text-slate-500 pb-1">\{lang === 'ar' \? 'تسجيل الحضور اليومي - المدير \/ القائد' : 'Daily Attendance - Admin \/ Leader'\}<\/div>\}/,
  ''
);

fs.writeFileSync('src/components/Header.tsx', code);
