import fs from 'fs';
import path from 'path';

const appPath = path.join(process.cwd(), 'src/App.tsx');
let code = fs.readFileSync(appPath, 'utf8');

if (!code.includes('/api/notifications/') && code.includes('const handleMarkNotificationAsRead')) {
  code = code.replace(
    /  const handleMarkNotificationAsRead = \([\s\S]*?\n  \};\n\n  const handleMarkAllNotificationsAsRead = \(\) => \{/,
    `  const handleMarkNotificationAsRead = (notificationId: string) => {
    const updated = notificationsRef.current.map(n =>
      n.id === notificationId
        ? { ...n, isRead: true, updatedAt: new Date().toISOString() }
        : n
    );

    notificationsRef.current = updated;
    setNotifications(updated);
    localStorage.setItem('notifications', JSON.stringify(updated));

    void fetch('/api/notifications/' + encodeURIComponent(notificationId) + '/mark-read', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    }).catch(() => {
      void pushSync({ notifications: updated });
    });
  };

  const handleMarkAllNotificationsAsRead = () => {`
  );
}

if (!code.includes('/api/notifications/mark-all-read')) {
  code = code.replace(
    /  const handleMarkAllNotificationsAsRead = \(\) => \{[\s\S]*?\n  \};/,
    `  const handleMarkAllNotificationsAsRead = () => {
    const userId = currentUser?.id;
    const updated = notificationsRef.current.map(n =>
      userId && String(n.recipientId).trim() === String(userId).trim()
        ? { ...n, isRead: true, updatedAt: new Date().toISOString() }
        : n
    );

    notificationsRef.current = updated;
    setNotifications(updated);
    localStorage.setItem('notifications', JSON.stringify(updated));

    void fetch('/api/notifications/mark-all-read', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ userId }),
      cache: 'no-store',
    }).catch(() => {
      void pushSync({ notifications: updated });
    });
  };`
  );
}

fs.writeFileSync(appPath, code, 'utf8');
console.log('Patched notification read actions to use dedicated server endpoints');
