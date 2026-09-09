const fs = require('fs');

const path = 'src/App.tsx';
if (!fs.existsSync(path)) process.exit(0);

let code = fs.readFileSync(path, 'utf8');
const renderMarker = '/* TECH_SOURCE_NOTIFICATIONS_RENDER_V2 */';
const navMarker = '/* TECH_SOURCE_NOTIFICATIONS_NAV_V2 */';

// Ensure the Header can open the full notifications page.
if (!code.includes(navMarker)) {
  const headerStart = code.indexOf('<Header');
  if (headerStart !== -1) {
    const headerEnd = code.indexOf('/>', headerStart);
    if (headerEnd !== -1 && headerEnd - headerStart < 30000) {
      const headerBlock = code.slice(headerStart, headerEnd);
      if (!headerBlock.includes('onOpenNotificationsPage=')) {
        const pattern = /onMarkAllNotificationsAsRead=\{\s*handleMarkAllNotificationsAsRead\s*\}/;
        const updated = headerBlock.replace(
          pattern,
          '$&\n        onOpenNotificationsPage={() => setActiveTab(\'notifications\')}'
        );
        if (updated !== headerBlock) {
          code = code.slice(0, headerStart) + updated + code.slice(headerEnd);
        }
      }
    }
  }
  code = code.replace(/\n/, '\n' + navMarker + '\n');
  fs.writeFileSync(path, code, 'utf8');
}

// Render NotificationsPage when the notifications tab is active.
if (!code.includes(renderMarker)) {
  const anchor = /([ \t]*)\{activeTab ===\s*'portal' && \(/;
  const match = code.match(anchor);

  if (match && match.index !== undefined) {
    const indent = match[1];
    const block =
      indent + renderMarker + '\n' +
      indent + "{activeTab === 'notifications' && (\n" +
      indent + '  <NotificationsPage\n' +
      indent + '    currentUserId={currentUser?.id}\n' +
      indent + '    lang={lang}\n' +
      indent + "    onBack={() => setActiveTab(currentUser?.role === 'leader' || !currentUser ? 'dashboard' : 'portal')}\n" +
      indent + '  />\n' +
      indent + ')}\n\n';

    code = code.slice(0, match.index) + block + code.slice(match.index);
    fs.writeFileSync(path, code, 'utf8');
    console.log('[patch_notifications_navigation] fixed and applied');
  } else {
    console.log('[patch_notifications_navigation] portal render anchor not found; skipped safely');
  }
}
