import fs from 'fs';
import path from 'path';

const appPath = path.join(process.cwd(), 'src/App.tsx');
let code = fs.readFileSync(appPath, 'utf8');
const marker = '/* TECH_SOURCE_NOTIFICATION_READ_API_V3 */';
if (!code.includes(marker)) {
  const single = /  const handleMarkNotificationAsRead = \([\s\S]*?\n  \};\n\n  const handleMarkAllNotificationsAsRead = \(\) => \{/;
  if (single.test(code)) {
    code = code.replace(single, `  const handleMarkNotificationAsRead = (notificationId: string) => {\n    const userId = currentUser?.id;\n    const optimistic = notificationsRef.current.map(n =>\n      n.id === notificationId ? { ...n, isRead: true, updatedAt: new Date().toISOString() } : n\n    );\n    notificationsRef.current = optimistic;\n    setNotifications(optimistic);\n\n    ${marker}\n    void fetch('/api/notifications/' + encodeURIComponent(notificationId) + '/mark-read', {\n      method: 'PUT',\n      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },\n      body: JSON.stringify({ userId }),\n      cache: 'no-store'\n    }).then(async response => {\n      if (!response.ok) throw new Error('mark-read failed');\n      const data = await response.json();\n      if (!data?.success) throw new Error('mark-read rejected');\n      if (Array.isArray(data.notifications)) {\n        notificationsRef.current = data.notifications;\n        setNotifications(data.notifications);\n      }\n    }).catch(() => {\n      void fetch('/api/notifications?userId=' + encodeURIComponent(String(userId || '')) + '&_=' + Date.now(), { cache: 'no-store' })\n        .then(r => r.ok ? r.json() : null)\n        .then(data => { if (Array.isArray(data?.notifications)) { notificationsRef.current = data.notifications; setNotifications(data.notifications); } })\n        .catch(() => {});\n    });\n  };\n\n  const handleMarkAllNotificationsAsRead = () => {`);
  }

  const all = /  const handleMarkAllNotificationsAsRead = \(\) => \{[\s\S]*?\n  \};/;
  if (all.test(code)) {
    code = code.replace(all, `  const handleMarkAllNotificationsAsRead = () => {\n    const userId = currentUser?.id;\n    const optimistic = notificationsRef.current.map(n =>\n      userId && String(n.recipientId).trim() === String(userId).trim()\n        ? { ...n, isRead: true, updatedAt: new Date().toISOString() }\n        : n\n    );\n    notificationsRef.current = optimistic;\n    setNotifications(optimistic);\n\n    void fetch('/api/notifications/mark-all-read', {\n      method: 'PUT',\n      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },\n      body: JSON.stringify({ userId }),\n      cache: 'no-store'\n    }).then(async response => {\n      if (!response.ok) throw new Error('mark-all-read failed');\n      const data = await response.json();\n      if (!data?.success) throw new Error('mark-all-read rejected');\n      if (Array.isArray(data.notifications)) {\n        notificationsRef.current = data.notifications;\n        setNotifications(data.notifications);\n      }\n    }).catch(() => {\n      void fetch('/api/notifications?userId=' + encodeURIComponent(String(userId || '')) + '&_=' + Date.now(), { cache: 'no-store' })\n        .then(r => r.ok ? r.json() : null)\n        .then(data => { if (Array.isArray(data?.notifications)) { notificationsRef.current = data.notifications; setNotifications(data.notifications); } })\n        .catch(() => {});\n    });\n  };`);
  }
}

// Notifications are owned by /api/notifications. Never persist or restore them
// through the generic /api/data or /api/sync localStorage path, which can resurrect
// an older unread snapshot after a successful mark-read operation.
code = code.replace(/\n\s*try \{ localStorage\.setItem\('notifications', JSON\.stringify\([^\n]*\)\); \} catch \{\}/g, '');
code = code.replace(/\n\s*if \(Array\.isArray\(data\.notifications\)\) \{[\s\S]*?\n\s*\}\n(?=\s*if \(Array\.isArray\(data\.shifts\))/g, '\n');
code = code.replace(/\n\s*if \(overrides\?\.notifications !== undefined\) \{\s*payload\.notifications =\s*overrides\.notifications;\s*\}/g, '');
code = code.replace(/\n\s*notifications\?: Notification\[\];/g, '');
code = code.replace(/\n\s*const serverNotifications = data\.notifications;[\s\S]*?localStorage\.setItem\(['"]notifications['"],\s*JSON\.stringify\(nextNotifications\)\);/g, '');

fs.writeFileSync(appPath, code, 'utf8');
console.log('[patch_notification_read_api] database-authoritative reads applied');
