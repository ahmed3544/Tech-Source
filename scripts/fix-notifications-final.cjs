const fs = require('fs');

function patch(path) {
  let code = fs.readFileSync(path, 'utf8');

  // Notification read state belongs exclusively to the dedicated notification API.
  code = code.replace(/\n\s*onMarkAsRead\?\.\(id\);/g, '');
  code = code.replace(/\n\s*onMarkAllAsRead\?\.\(\);/g, '');

  // Remove any legacy /api/data notification fallback. The generic data endpoint
  // intentionally does not contain notifications anymore.
  const loadStart = code.indexOf('const load = async (silent = false) => {');
  const loadEnd = code.indexOf('\n  useEffect(() =>', loadStart);
  if (loadStart >= 0 && loadEnd > loadStart) {
    let block = code.slice(loadStart, loadEnd);
    const legacyFallback = /    } catch \{\n      try \{\n[\s\S]*?\n      \} catch \{[\s\S]*?\n      \}\n    \} finally/;
    if (legacyFallback.test(block)) block = block.replace(legacyFallback, "    } catch {\n      setError(true);\n    } finally");
    code = code.slice(0, loadStart) + block + code.slice(loadEnd);
  }

  // Shift-swap actions must not send notifications through generic /api/sync.
  // Persist the request through sync, then persist read/new notifications through
  // the dedicated notification API.
  code = code.replace(
    "body:JSON.stringify({shiftSwapRequests:nextRequests,notifications:next,lastUpdated:Date.now()})",
    "body:JSON.stringify({shiftSwapRequests:nextRequests,lastUpdated:Date.now()})"
  );
  code = code.replace(
    "if(!sync.ok)throw new Error(`Sync failed: ${sync.status}`);await load(true);",
    "if(!sync.ok)throw new Error(`Sync failed: ${sync.status}`);await fetch(`/api/notifications/${encodeURIComponent(notification.id)}/mark-read`,{method:'PUT',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify({userId:currentUserId}),cache:'no-store'});await Promise.all(additions.map(notification=>fetch('/api/notifications/emit',{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify({notification}),cache:'no-store'})));await load(true);"
  );

  fs.writeFileSync(path, code, 'utf8');
  console.log('[fix-notifications-final] authoritative notification API:', path);
}

patch('src/components/NotificationCenter.tsx');
patch('src/components/NotificationsPage.tsx');
