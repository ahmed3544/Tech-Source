const fs = require('fs');
let code = fs.readFileSync('server/request-notification-triggers.ts', 'utf8');
code = code.replace(
  /\} else if \(status === 'approved' \|\| status === 'rejected'\) \{\s*const approved = status === 'approved';\s*await insertNotification\(employeeId, approved \? 'leave_approved' : 'leave_rejected', approved \? 'تم اعتماد طلب الإجازة' : 'تم رفض طلب الإجازة', approved \? \`تم اعتماد طلب \$\{kind\} من \$\{start\} إلى \$\{end\}\.\` : \`تم رفض طلب \$\{kind\} من \$\{start\} إلى \$\{end\}\.\$\{clean\(r\.reviewNotes\) \? \` السبب: \$\{clean\(r\.reviewNotes\)\}\` : ''\}\`, employeeId, id\);\s*\}/g,
  `} else if (status === 'approved' || status === 'rejected') {
      const approved = status === 'approved';
      const isPermission = kind.toLowerCase() === 'permission';
      const notifTitle = approved ? (isPermission ? 'تم اعتماد الإذن' : 'تم اعتماد طلب الإجازة') : (isPermission ? 'تم رفض الإذن' : 'تم رفض طلب الإجازة');
      const kindAr = isPermission ? 'إذن' : (kind === 'sick' ? 'إجازة مرضية' : 'إجازة');
      await insertNotification(employeeId, approved ? 'leave_approved' : 'leave_rejected', notifTitle, approved ? \`تم اعتماد طلب \${kindAr} من \${start} إلى \${end}.\` : \`تم رفض طلب \${kindAr} من \${start} إلى \${end}.\${clean(r.reviewNotes) ? \` السبب: \${clean(r.reviewNotes)}\` : ''}\`, employeeId, id);
    }`
);
fs.writeFileSync('server/request-notification-triggers.ts', code);
