const fs = require('fs');
const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const marker = `  /* =========================================================\n     CENTRAL SERVER PULL\n     ========================================================= */`;
if (!code.includes(marker)) {
  console.warn('[patch_sync_retry_v1] marker not found; skipping');
  process.exit(0);
}

const oldCatch = `  } catch (error: any) {\n\n    if (\n      error?.name ===\n      'AbortError'\n    ) {\n\n      console.warn(\n        'Sync request timed out.'\n      );\n\n    } else {\n\n      console.warn(\n        'Sync request failed:',\n        error\n      );\n    }\n\n  } finally {`;

const newCatch = `  } catch (error: any) {\n\n    /*\n     * NEVER lose a mutation when the network/API is temporarily down.\n     * Keep the exact payload locally and retry it automatically until the\n     * server confirms receipt. This makes Neon the eventual source of truth\n     * instead of silently falling back to localStorage forever.\n     */\n    try {\n      localStorage.setItem(\n        'attendance_pending_server_sync',\n        JSON.stringify({\n          payload,\n          queuedAt: Date.now()\n        })\n      );\n    } catch {}\n\n    if (\n      error?.name ===\n      'AbortError'\n    ) {\n\n      console.warn(\n        'Sync request timed out; mutation queued for retry.'\n      );\n\n    } else {\n\n      console.warn(\n        'Sync request failed; mutation queued for retry:',\n        error\n      );\n    }\n\n  } finally {`;

if (!code.includes(oldCatch)) {
  console.warn('[patch_sync_retry_v1] pushSync catch block not found; skipping safely');
  process.exit(0);
}
code = code.replace(oldCatch, newCatch);

const retryEffect = `\n\n  /* =========================================================\n     GUARANTEED SERVER RETRY\n     ========================================================= */\n\n  useEffect(() => {\n    let cancelled = false;\n\n    const retryPendingSync = async () => {\n      if (cancelled || syncInFlightRef.current) return;\n\n      try {\n        const raw = localStorage.getItem('attendance_pending_server_sync');\n        if (!raw) return;\n\n        const queued = JSON.parse(raw);\n        if (!queued?.payload || typeof queued.payload !== 'object') {\n          localStorage.removeItem('attendance_pending_server_sync');\n          return;\n        }\n\n        await pushSync(queued.payload);\n\n        /* pushSync throws only through its own internal handling, so verify\n           whether the queue still exists before deciding it was accepted. */\n        const stillQueued = localStorage.getItem('attendance_pending_server_sync');\n        if (stillQueued === raw) {\n          return;\n        }\n      } catch (error) {\n        console.warn('[sync-retry] pending mutation retry failed:', error);\n      }\n    };\n\n    void retryPendingSync();\n    const timer = window.setInterval(retryPendingSync, 5000);\n\n    return () => {\n      cancelled = true;\n      window.clearInterval(timer);\n    };\n  }, []);\n\n`;

code = code.replace(marker, retryEffect + marker);

/* On successful sync, remove the exact queued mutation. */
const successMarker = `      const data =\n        await res.json();`;
const successReplacement = `      const data =\n        await res.json();\n\n      try {\n        localStorage.removeItem('attendance_pending_server_sync');\n      } catch {}\n`;
if (!code.includes(successMarker)) {
  console.warn('[patch_sync_retry_v1] success marker not found; skipping success cleanup');
} else {
  code = code.replace(successMarker, successReplacement);
}

fs.writeFileSync(path, code);
console.log('[patch_sync_retry_v1] applied');
