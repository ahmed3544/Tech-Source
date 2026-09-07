const fs = require('fs');

const path = 'src/components/KioskPunch.tsx';
let code = fs.readFileSync(path, 'utf8');

const avatarListOld = '<UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} size="md" />';
const avatarListNew = '<UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} avatar={emp.avatar} employee={emp} size="md" />';
if (code.includes(avatarListOld)) {
  code = code.replace(avatarListOld, avatarListNew);
}

const avatarSelectedOld = '<UserAvatar name={selectedEmp.nameEn || selectedEmp.nameAr} code={selectedEmp.code} size="lg" />';
const avatarSelectedNew = '<UserAvatar name={selectedEmp.nameEn || selectedEmp.nameAr} code={selectedEmp.code} avatar={selectedEmp.avatar} employee={selectedEmp} size="lg" />';
if (code.includes(avatarSelectedOld)) {
  code = code.replace(avatarSelectedOld, avatarSelectedNew);
}

const oldStatusDot = `                              <span className={\`w-2 h-2 rounded-full \${currentRecord.status === 'absent' ? 'bg-rose-400' : currentRecord.status === 'late' ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse shrink-0\`} />`;
const newStatusIcon = `                              {isWeekendToday ? (\n                                <Palmtree className="w-4 h-4 text-slate-300 shrink-0" aria-label="Weekend" />\n                              ) : activeApprovedLeaveToday || currentRecord.status === 'on_leave' ? (\n                                <Palmtree className="w-4 h-4 text-sky-300 shrink-0" aria-label="On leave" />\n                              ) : currentRecord.status === 'absent' ? (\n                                <UserX className="w-4 h-4 text-rose-300 shrink-0" aria-label="Absent" />\n                              ) : currentRecord.status === 'late' ? (\n                                <Clock className="w-4 h-4 text-amber-300 shrink-0" aria-label="Late" />\n                              ) : currentRecord.checkIn ? (\n                                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" aria-label="Present" />\n                              ) : (\n                                <Clock className="w-4 h-4 text-slate-300 shrink-0" aria-label="Not registered" />\n                              )}`;
if (code.includes(oldStatusDot)) {
  code = code.replace(oldStatusDot, newStatusIcon);
}

fs.writeFileSync(path, code);
console.log('Kiosk visuals patched: employee avatar sources and semantic attendance status icons.');
