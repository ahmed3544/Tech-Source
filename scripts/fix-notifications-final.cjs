const fs = require('fs');

function patch(path) {
  let code = fs.readFileSync(path, 'utf8');

  // The database/API is authoritative for read state. Do not call the App
  // callback after a successful mark-read because that callback can push an
  // older local snapshot back to the server and resurrect the unread state.
  code = code.replace(/\n\s*onMarkAsRead\?\.\(id\);/g, '');
  code = code.replace(/\n\s*onMarkAllAsRead\?\.\(\);/g, '');

  // Dedicated notification GET can fail independently from /api/data. Keep
  // the notification UI alive by falling back to the same server snapshot.
  const loadStart = code.indexOf('const load = async (silent = false) => {');
  const loadEnd = code.indexOf('\n  useEffect(() =>', loadStart);
  if (loadStart >= 0 && loadEnd > loadStart) {
    let block = code.slice(loadStart, loadEnd);
    const catchStart = block.indexOf('    } catch {');
    const finallyStart = block.indexOf('    } finally', catchStart);
    if (catchStart >= 0 && finallyStart > catchStart) {
      const errorReset = path.includes('NotificationCenter') ? '        setError(false);\n' : '';
      const fallback = `    } catch {\n      try {\n        const fallback = await fetch(\`/api/data?_=${Date.now()}\`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });\n        if (!fallback.ok) throw new Error(String(fallback.status));\n        const fallbackData = await fallback.json();\n        setItems(normalize(fallbackData?.notifications, currentUserId));\n${errorReset}      } catch {\n        if (!silent) setItems([]);\n      }\n`;
      block = block.slice(0, catchStart) + fallback + block.slice(finallyStart);
      code = code.slice(0, loadStart) + block + code.slice(loadEnd);
    }
  }

  fs.writeFileSync(path, code);
  console.log('[fix-notifications-final] patched', path);
}

patch('src/components/NotificationCenter.tsx');
patch('src/components/NotificationsPage.tsx');
