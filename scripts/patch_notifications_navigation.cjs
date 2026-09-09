const fs = require('fs');

const path = 'src/App.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
const navMarker = '/* TECH_SOURCE_NOTIFICATIONS_NAV_V1 */';
const renderMarker = '/* TECH_SOURCE_NOTIFICATIONS_RENDER_V1 */';

// Ensure the Header's "More notifications" action opens the real App route.
if (!code.includes(navMarker)) {
  const headerStart = code.indexOf('<Header');
  if (headerStart !== -1) {
    const headerEnd = code.indexOf('/>', headerStart);
    if (headerEnd !== -1 && headerEnd - headerStart <= 30000) {
      const headerBlock = code.slice(headerStart, headerEnd);
      if (headerBlock.includes('onOpenNotificationsPage=')) {
        code = code.slice(0, headerStart) + headerBlock + '\n        ' + navMarker + '\n      ' + code.slice(headerEnd);
      fs.writeFileSync(path, code, 'utf8');
      console.log('[patch_notifications_navigation] callback already existed');
    } else if (headerBlock.includes('onMarkAllNotificationsAsRead=')) {
      const updatedHeader = headerBlock.replace(
        /(onMarkAllNotificationsAsRead=\{\s*handleMarkAllNotificationsAsRead\s*\})/,
        '$1\n        onOpenNotificationsPage={() => setActiveTab(\'notifications\')}'
      );
      if (updatedHeader !== headerBlock) {
        code = code.slice(0, headerStart) + updatedHeader + '\n      ' + navMarker + '\n      ' + code.slice(headerEnd);
        fs.writeFileSync(path, code, 'utf8');
        console.log('[patch_notifications_navigation] navigation callback applied');
      }
    }
  }
}

// App.tsx previously had the notifications tab in the type/state but did not
// render NotificationsPage. That made navigation land on an empty main area.
if (!code.includes(renderMarker)) {
  const anchor = "        {activeTab ===\n          'portal' && (";
  if (code.includes(anchor)) {
    const renderBlock = `        ${renderMarker}\n        {activeTab ===\n          'notifications' && (\n          <NotificationsPage\n            currentUserId={currentUser?.id}\n            lang={lang}\n            onBack={() => setActiveTab(currentUser?.role === 'leader' || !currentUser ? 'dashboard' : 'portal')}\n          />\n        )}\n\n\n`;
    code = code.replace(anchor, renderBlock + anchor);
    fs.writeFileSync(path, code, 'utf8');
    console.log('[patch_notifications_navigation] notifications render applied');
  } else {
    console.warn('[patch_notifications_navigation] portal render anchor not found; skipping render patch safely.');
  }
}
