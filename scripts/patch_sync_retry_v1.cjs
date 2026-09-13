const fs = require('fs');
const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const marker = `  /* =========================================================\n     CENTRAL SERVER PULL\n     ========================================================= */`;
if (!code.includes(marker)) {
  console.warn('[patch_sync_retry_v1] marker not found; skipping');
  process.exit(0);
}

/*
 * IMPORTANT: the central pull effect can retry a queued mutation before the
 * lexical `const pushSync = ...` binding is initialized in the component.
 * Convert pushSync to a function declaration so the retry path is hoisted and
 * cannot throw "Cannot access 'X' before initialization" after minification.
 */
const pushSyncConst = /const pushSync = async \(/;
if (pushSyncConst.test(code)) {
  code = code.replace(pushSyncConst, 'async function pushSync(');
}

/* Remove the previous retry useEffect. It could execute a callback through a
   minified lexical binding before the component's initialization completed. */
const retryStart = `  /* =========================================================\n     GUARANTEED SERVER RETRY\n     ========================================================= */`;
const retryEnd = `  /* =========================================================\n     CENTRAL SERVER PULL\n     ========================================================= */`;
const retryIndex = code.indexOf(retryStart);
if (retryIndex >= 0) {
  const endIndex = code.indexOf(retryEnd, retryIndex);
  if (endIndex >= 0) {
    code = code.slice(0, retryIndex) + code.slice(endIndex);
  }
}

const oldCatch = `  } catch (error: any) {\n\n    if (\n      error?.name ===\n      'AbortError'\n    ) {\n\n      console.warn(\n        'Sync request timed out.'\n      );\n\n    } else {\n\n      console.warn(\n        'Sync request failed:',\n        error\n      );\n    }\n\n  } finally {`;

const newCatch = `  } catch (error: any) {\n\n    /* Never lose a mutation when the API/network is temporarily unavailable. */\n    try {\n      localStorage.setItem(\n        'attendance_pending_server_sync',\n        JSON.stringify({ payload, queuedAt: Date.now() })\n      );\n    } catch {}\n\n    if (error?.name === 'AbortError') {\n      console.warn('Sync request timed out; mutation queued for retry.');\n    } else {\n      console.warn('Sync request failed; mutation queued for retry:', error);\n    }\n\n  } finally {`;

if (code.includes(oldCatch)) {
  code = code.replace(oldCatch, newCatch);
}

const successMarker = `      const data =\n        await res.json();`;
const successReplacement = `      const data =\n        await res.json();\n\n      try {\n        localStorage.removeItem('attendance_pending_server_sync');\n      } catch {}`;
if (code.includes(successMarker) && !code.includes("localStorage.removeItem('attendance_pending_server_sync');")) {
  code = code.replace(successMarker, successReplacement);
}

/* Retry is owned by the already-mounted central pull effect. Because pushSync
   is now a hoisted function declaration, this call is safe in the effect. */
const pullNeedle = `      const pullFromServer =\n      async () => {\n\n        if (`;
const pullReplacement = `      const pullFromServer =\n      async () => {\n\n        try {\n          const pendingRaw = localStorage.getItem('attendance_pending_server_sync');\n          if (pendingRaw && !syncInFlightRef.current) {\n            const pending = JSON.parse(pendingRaw);\n            if (pending?.payload && typeof pending.payload === 'object') {\n              await pushSync(pending.payload);\n              return;\n            }\n            localStorage.removeItem('attendance_pending_server_sync');\n          }\n        } catch (error) {\n          console.warn('[sync-retry] pending mutation retry failed:', error);\n        }\n\n        if (`;

if (!code.includes("const pendingRaw = localStorage.getItem('attendance_pending_server_sync');")) {
  if (code.includes(pullNeedle)) {
    code = code.replace(pullNeedle, pullReplacement);
  } else {
    console.warn('[patch_sync_retry_v1] pull function marker not found; retry hook not inserted');
  }
}

fs.writeFileSync(path, code);
console.log('[patch_sync_retry_v1] applied safely');
