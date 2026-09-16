const fs = require('fs');

let code = fs.readFileSync('src/components/NotificationCenter.tsx', 'utf8');
code = code.replace(
  /return lang === 'ar' \? \(n\.title\?\.trim\(\) \|\| titles\[n\.type\] \|\| n\.type\.replace\(\/_\/g, ' '\)\) : \(titles\[n\.type\] \|\| 'Notification'\);/,
  `if (lang === 'ar') return n.title?.trim() || titles[n.type] || n.type.replace(/_/g, ' ');
  if (n.title?.includes('طلب إذن')) return 'New Permission Request';
  if (n.title?.includes('إجازة مرضية')) return 'Sick Leave Request';
  if (n.title?.includes('اعتماد الإذن')) return 'Permission Approved';
  if (n.title?.includes('رفض الإذن')) return 'Permission Rejected';
  return titles[n.type] || 'Notification';`
);

code = code.replace(
  /const raw = String\(n\?\.message \|\| ''\);\s*if \(lang === 'ar' \|\| !\/\[\\u0600-\\u06FF\]\/\.test\(raw\)\) return raw;/,
  `const raw = String(n?.message || '');
  if (lang === 'ar') return raw;
  if (!/[\\u0600-\\u06FF]/.test(raw)) return raw;
  if (raw.includes('أرسل طلب إذن')) return 'A new permission request requires your review.';
  if (raw.includes('تم اعتماد طلب إذن')) return 'Your permission request was approved.';
  if (raw.includes('تم رفض طلب إذن')) return 'Your permission request was rejected.';
`
);

fs.writeFileSync('src/components/NotificationCenter.tsx', code);
