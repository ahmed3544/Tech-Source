const fs = require('fs');

function patch(path) {
  let code = fs.readFileSync(path, 'utf8');

  // Do not let the parent App immediately re-sync an old local notification
  // snapshot after the authoritative DB mark-read request succeeds.
  code = code.replace(/\n\s*onMarkAsRead\?\.\(id\);/g, '');
  code = code.replace(/\n\s*onMarkAllAsRead\?\.\(\);/g, '');

  // If the dedicated notification endpoint is unavailable, use /api/data as
  // a read-only fallback. This prevents the notifications page from becoming
  // blank while the rest of the app is still connected to the database.
  const old = `      const data = await response.json();\n      setItems(normalize(data?.notifications, currentUserId));`;
  const replacement = `      const data = await response.json();\n      setItems(normalize(data?.notifications, currentUserId));`;
  // Keep the successful path unchanged; the catch block below gets the fallback.

  // Replace each load catch with a one-shot /api/data fallback.
  code = code.replace(/    \} catch \{\n(\s*)setItems\(\[\]\);\n(\s*)\} finally/g, `    } catch {\n$1      try {\n$1        const fallback = await fetch(\`/api/data?_=${Date.now()}\`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });\n$1        if (!fallback.ok) throw new Error(String(fallback.status));\n$1        const fallbackData = await fallback.json();\n$1        setItems(normalize(fallbackData?.notifications, currentUserId));\n$1      } catch {\n$1        if (!silent) setItems([]);\n$1      }\n$2    } finally`);

  fs.writeFileSync(path, code);
  console.log('[fix-notifications-final] patched', path);
}

patch('src/components/NotificationCenter.tsx');
patch('src/components/NotificationsPage.tsx');
