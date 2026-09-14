const fs = require('fs');

const file = 'src/components/Header.tsx';
let code = fs.readFileSync(file, 'utf8');

const anchor = '<nav className="flex items-center gap-1 shrink-0">';
const button = `{currentUser?.role === 'employee' && <button onClick={() => setActiveTab('portal')} className={\`px-2.5 py-1.5 rounded-md text-xs font-bold \${activeTab === 'portal' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}\`}><LayoutDashboard className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'الرئيسية' : 'Home'}</button>}`;

if (!code.includes("lang === 'ar' ? 'الرئيسية' : 'Home'")) {
  if (!code.includes(anchor)) {
    throw new Error('[patch_employee_home_navigation] navigation anchor not found');
  }
  code = code.replace(anchor, `${anchor}${button}`);
  fs.writeFileSync(file, code);
  console.log('[patch_employee_home_navigation] applied');
} else {
  console.log('[patch_employee_home_navigation] already applied');
}
