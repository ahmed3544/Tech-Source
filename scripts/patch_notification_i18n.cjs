const fs = require('fs');

const messageHelper = `
const notificationMessageFor = (n, lang) => {
  const raw = String(n?.message || '');
  if (lang === 'ar' || !/[\\u0600-\\u06FF]/.test(raw)) return raw;
  const messages = {
    leave_requested: 'A new leave request requires your review.',
    leave_approved: 'Your leave request was approved.',
    leave_rejected: 'Your leave request was rejected.',
    overtime_requested: 'A new overtime request requires your review.',
    overtime_approved: 'Your overtime request was approved.',
    overtime_rejected: 'Your overtime request was rejected.',
    shift_changed: 'Your shift was changed.',
    shift_swap_requested: 'You received a new shift swap request.',
    shift_swap_accepted: 'The shift swap was accepted and is ready for leader review.',
    shift_swap_rejected: 'The shift swap request was rejected.',
    admin_notice: 'You have a new administrative notice.',
  };
  return messages[n?.type] || 'You have a new notification.';
};
`;

function patchNotificationCenter() {
  const file = 'src/components/NotificationCenter.tsx';
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes('const notificationMessageFor')) {
    const marker = 'const actionUrlFor = (n: Notification): string => {';
    if (code.includes(marker)) code = code.replace(marker, messageHelper + '\n' + marker);
  }
  code = code.replace(
    /return n\.title\?\.trim\(\) \|\| titles\[n\.type\] \|\| n\.type\.replace\(\/\_\/g, ' '\);/,
    "return lang === 'ar' ? (n.title?.trim() || titles[n.type] || n.type.replace(/_/g, ' ')) : (titles[n.type] || 'Notification');"
  );
  code = code.replaceAll('{notification.message}', '{notificationMessageFor(notification, lang)}');
  fs.writeFileSync(file, code, 'utf8');
}

function patchNotificationsPage() {
  const file = 'src/components/NotificationsPage.tsx';
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes('const notificationMessageFor')) {
    const marker = 'export const NotificationsPage:';
    if (code.includes(marker)) code = code.replace(marker, messageHelper + '\n' + marker);
  }
  code = code.replace("  if (n.title?.trim()) return n.title;", "  if (lang === 'ar' && n.title?.trim()) return n.title;");
  code = code.replaceAll('{notification.message}', '{notificationMessageFor(notification, lang)}');
  fs.writeFileSync(file, code, 'utf8');
}

patchNotificationCenter();
patchNotificationsPage();
console.log('[patch_notification_i18n] English UI notification text normalized');
