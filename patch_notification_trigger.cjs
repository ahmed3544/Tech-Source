const fs = require('fs');
let code = fs.readFileSync('server/request-notification-triggers.ts', 'utf8');
code = code.replace(
  /if \(status === 'pending'\) \{\s*for \(const recipientId of leaders\) if \(recipientId !== employeeId\) await insertNotification\(recipientId, 'leave_requested', 'طلب إجازة جديد', \`\$\{employeeName\(employeeId\)\} أرسل طلب \$\{kind\} من \$\{start\} إلى \$\{end\}\.\`, employeeId, id\);\s*\}/g,
  `if (status === 'pending') {
      const isPermission = kind.toLowerCase() === 'permission';
      const notifTitle = isPermission ? 'طلب إذن جديد' : 'طلب إجازة جديد';
      const kindAr = isPermission ? 'إذن' : (kind === 'sick' ? 'إجازة مرضية' : 'إجازة');
      for (const recipientId of leaders) if (recipientId !== employeeId) await insertNotification(recipientId, 'leave_requested', notifTitle, \`\${employeeName(employeeId)} أرسل طلب \${kindAr} من \${start} إلى \${end}.\`, employeeId, id);
    }`
);
fs.writeFileSync('server/request-notification-triggers.ts', code);
