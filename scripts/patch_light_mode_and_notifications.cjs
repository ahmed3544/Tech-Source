const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

// Keep the normal/light mode genuinely light after the existing UI patch script runs.
patchFile('src/App.tsx', (code) => {
  code = code.replace(/bg-slate-100\/70 dark:bg-slate-950/g, 'bg-white dark:bg-slate-950');
  code = code.replace(/bg-slate-100\/70(?=\s*text-slate-900)/g, 'bg-white');
  return code;
});

patchFile('src/components/Header.tsx', (code) => {
  // Light mode is the normal/default mode; dark mode is opt-in.
  code = code.replace(
    'const [isDarkMode, setIsDarkMode] = useState(true);',
    'const [isDarkMode, setIsDarkMode] = useState(false);'
  );
  code = code.replace(
    /useEffect\(\(\) => \{ const savedTheme = localStorage\.getItem\('tech-source-theme'\); const dark = savedTheme !== 'light'; setIsDarkMode\(dark\); document\.documentElement\.classList\.toggle\('dark', dark\); \}, \[\]\);/,
    "useEffect(() => { const savedTheme = localStorage.getItem('tech-source-theme'); const dark = savedTheme === 'dark'; setIsDarkMode(dark); document.documentElement.classList.toggle('dark', dark); }, []);"
  );
  // Keep the weekly schedule tab readable when the header is in normal/light mode.
  code = code.replace(
    "activeTab === 'schedule' ? 'bg-emerald-600 text-white' : 'text-slate-900'",
    "activeTab === 'schedule' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'"
  );
  return code;
});

patchFile('src/components/NotificationCenter.tsx', (code) => {
  const old = `  const userNotifications = currentUserId\n    ? notifications.filter(n => n.recipientId === currentUserId)\n    : [];\n  const unreadCount = userNotifications.filter(n => !n.isRead).length;`;
  const replacement = `  const userNotifications = currentUserId\n    ? notifications.filter(n => n.recipientId === currentUserId && n?.id && (String(n.title || '').trim() || String(n.message || '').trim() || n.type))\n    : [];\n  const unreadCount = userNotifications.filter(n => !n.isRead).length;`;
  if (code.includes(old)) code = code.replace(old, replacement);
  return code;
});

patchFile('src/components/NotificationsPage.tsx', (code) => {
  code = code.replace(
    /const list = useMemo\(\(\) => currentUserId \? notifications\.filter\(n => n\.recipientId === currentUserId\)\.slice\(\)\.sort\(\(a,b\) => new Date\(b\.createdAt\)\.getTime\(\) - new Date\(a\.createdAt\)\.getTime\(\)\) : \[\], \[notifications, currentUserId\]\);/,
    `const list = useMemo(() => currentUserId ? notifications.filter(n => n.recipientId === currentUserId && n?.id && (String(n.title || '').trim() || String(n.message || '').trim() || n.type)).slice().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [], [notifications, currentUserId]);`
  );
  return code;
});
