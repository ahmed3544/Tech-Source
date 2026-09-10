const fs = require('fs');

function patch(path) {
  let code = fs.readFileSync(path, 'utf8');

  // Notification read state belongs exclusively to the dedicated notification API.
  // Never call parent callbacks that can write an older local snapshot back.
  code = code.replace(/\n\s*onMarkAsRead\?\.\(id\);/g, '');
  code = code.replace(/\n\s*onMarkAllAsRead\?\.\(\);/g, '');

  // Remove any legacy /api/data notification fallback. The generic data endpoint
  // intentionally does not contain notifications anymore.
  const loadStart = code.indexOf('const load = async (silent = false) => {');
  const loadEnd = code.indexOf('\n  useEffect(() =>', loadStart);
  if (loadStart >= 0 && loadEnd > loadStart) {
    let block = code.slice(loadStart, loadEnd);
    const legacyFallback = /    } catch \{\n      try \{\n[\s\S]*?\n      \} catch \{[\s\S]*?\n      \}\n    \} finally/;
    if (legacyFallback.test(block)) {
      block = block.replace(legacyFallback, "    } catch {\n      setError(true);\n    } finally");
    }
    code = code.slice(0, loadStart) + block + code.slice(loadEnd);
  }

  fs.writeFileSync(path, code, 'utf8');
  console.log('[fix-notifications-final] authoritative notification API:', path);
}

patch('src/components/NotificationCenter.tsx');
patch('src/components/NotificationsPage.tsx');
