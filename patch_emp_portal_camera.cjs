const fs = require('fs');
let code = fs.readFileSync('src/components/EmployeePortal.tsx', 'utf8');

// Remove hover camera overlay
code = code.replace(
  /<div className="absolute inset-0 rounded-full bg-slate-950\/60 backdrop-blur-xs flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-\[10px\] font-bold">\s*<Camera className="w-5 h-5 text-emerald-400 mb-0\.5" \/>\s*<span>\{lang === 'ar' \? 'تغيير' : 'Edit'\}<\/span>\s*<\/div>/,
  ''
);

// Remove the cursor-pointer from the wrapper
code = code.replace(
  /<div className="relative group cursor-pointer" onClick=\{\(\) => setShowAvatarModal\(true\)\}>/,
  '<div className="relative group">'
);

// Remove the text button for changing photo
code = code.replace(
  /<button\s*onClick=\{\(\) => setShowAvatarModal\(true\)\}\s*className="mt-1\.5 text-\[11px\] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold underline decoration-dotted"\s*>\s*<Camera className="w-3\.5 h-3\.5 text-emerald-400" \/>\s*<span>\{lang === 'ar' \? 'تغيير الصورة الشخصية' : 'Change Profile Photo'\}<\/span>\s*<\/button>/,
  ''
);

fs.writeFileSync('src/components/EmployeePortal.tsx', code);
