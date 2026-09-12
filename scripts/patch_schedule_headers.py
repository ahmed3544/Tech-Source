from pathlib import Path
p = Path('src/components/WeeklyShiftSchedule.tsx')
s = p.read_text(encoding='utf-8')
old = """    const payload = { dailyShiftAssignments: cleanAssignments };\n    console.log('[Schedule Save] POST /api/sync payload:', JSON.stringify(payload, null, 2));\n\n    try {\n      const response = await fetch('/api/sync', {\n        method: 'POST',\n        credentials: 'include',\n        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },\n        body: JSON.stringify(payload),\n      });"""
new = """    const syncTimestamp = new Date().toISOString();\n    const syncRevision = `${syncTimestamp}-${Math.random().toString(36).slice(2, 10)}`;\n    const payload = { dailyShiftAssignments: cleanAssignments, syncTimestamp, syncRevision };\n    console.log('[Schedule Save] Sync metadata:', { syncTimestamp, syncRevision });\n    console.log('[Schedule Save] POST /api/sync payload:', JSON.stringify(payload, null, 2));\n\n    try {\n      const response = await fetch('/api/sync', {\n        method: 'POST',\n        credentials: 'include',\n        headers: {\n          'Content-Type': 'application/json',\n          Accept: 'application/json',\n          'X-Sync-Timestamp': syncTimestamp,\n          'X-Sync-Revision': syncRevision,\n        },\n        body: JSON.stringify(payload),\n      });"""
if old not in s:
    raise SystemExit('target block not found')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
