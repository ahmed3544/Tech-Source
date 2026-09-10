const fs = require('fs');

function patch(path) {
  let code = fs.readFileSync(path, 'utf8');

  // Notification read state belongs exclusively to the dedicated notification API.
  code = code.replace(/\n\s*onMarkAsRead\?\.\(id\);/g, '');
  code = code.replace(/\n\s*onMarkAllAsRead\?\.\(\);/g, '');

  // Replace the compact NotificationsPage loader wholesale so future builds can
  // never reintroduce the old /api/data notification fallback.
  if (path.endsWith('NotificationsPage.tsx')) {
    const start = code.indexOf('const load=async(silent=false)=>{');
    const end = code.indexOf('useEffect(()=>', start);
    if (start >= 0 && end > start) {
      const cleanLoader = `const load=async(silent=false)=>{if(!currentUserId){setItems([]);setLoading(false);return;}if(!silent)setLoading(true);setError(false);try{const r=await fetch(\`/api/notifications?userId=\${encodeURIComponent(String(currentUserId).trim())}&_=\${Date.now()}\`,{cache:'no-store',headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}});if(!r.ok)throw new Error(String(r.status));const d=await r.json();if(!d?.success||!Array.isArray(d.notifications))throw new Error('notifications_failed');setItems(normalize(d.notifications,currentUserId));}catch{setError(true);}finally{if(!silent)setLoading(false);}};\n `;
      code = code.slice(0, start) + cleanLoader + code.slice(end);
    }
  }

  // Remove any legacy /api/data notification fallback from expanded loaders.
  const loadStart = code.indexOf('const load = async (silent = false) => {');
  const loadEnd = code.indexOf('\n  useEffect(() =>', loadStart);
  if (loadStart >= 0 && loadEnd > loadStart) {
    let block = code.slice(loadStart, loadEnd);
    const legacyFallback = /    } catch \{\n      try \{\n[\s\S]*?\n      \} catch \{[\s\S]*?\n      \}\n    \} finally/;
    if (legacyFallback.test(block)) block = block.replace(legacyFallback, "    } catch {\n      setError(true);\n    } finally");
    code = code.slice(0, loadStart) + block + code.slice(loadEnd);
  }

  // Shift-swap actions must not send notifications through generic /api/sync.
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
