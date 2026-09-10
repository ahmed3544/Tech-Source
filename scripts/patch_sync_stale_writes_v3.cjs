const fs = require('fs');

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
const marker = '/* SYNC_STALE_WRITE_GUARD_V4 */';

if (!app.includes(marker)) {
  const oldStamp = `const now = Date.now();\n\n  lastLocalUpdateRef.current = now;`;
  const at = app.indexOf(oldStamp);
  if (at !== -1) {
    const insert = `const now = Date.now();\n\n  lastLocalUpdateRef.current = now;\n\n  ${marker}\n  // Only changed records receive a new updatedAt. Never re-stamp an unchanged\n  // full-array snapshot, otherwise an old local copy can overwrite another device.\n  const stampChanged = (items, previous, timestamp) => {\n    if (!Array.isArray(items)) return items;\n    const prev = new Map((Array.isArray(previous) ? previous : []).map(x => [String(x?.id ?? ''), x]));\n    const strip = x => { const y = { ...(x || {}) }; delete y.updatedAt; return y; };\n    return items.map(item => {\n      if (!item || item.id == null) return item;\n      const oldItem = prev.get(String(item.id));\n      if (!oldItem) return { ...item, updatedAt: timestamp };\n      try {\n        return JSON.stringify(strip(oldItem)) !== JSON.stringify(strip(item))\n          ? { ...item, updatedAt: timestamp }\n          : item;\n      } catch {\n        return { ...item, updatedAt: timestamp };\n      }\n    });\n  };\n\n  if (overrides?.employees !== undefined) overrides = { ...overrides, employees: stampChanged(overrides.employees, employeesRef.current, new Date(now).toISOString()) };\n  if (overrides?.attendanceRecords !== undefined) overrides = { ...overrides, attendanceRecords: stampChanged(overrides.attendanceRecords, attendanceRecordsRef.current, new Date(now).toISOString()) };\n  if (overrides?.leaveRequests !== undefined) overrides = { ...overrides, leaveRequests: stampChanged(overrides.leaveRequests, leaveRequestsRef.current, new Date(now).toISOString()) };\n  if (overrides?.notifications !== undefined) overrides = { ...overrides, notifications: stampChanged(overrides.notifications, notificationsRef.current, new Date(now).toISOString()) };`;
    app = app.slice(0, at) + insert + app.slice(at + oldStamp.length);
  }

  // Never immediately pull after a successful mutation. The sync response is the
  // authoritative result; the 1.5s poll will reconcile the next server snapshot.
  app = app.replace(/\n\s*\/\*\s*\n?\*?\s*IMPORTANT:\s*\n?\*?\s*اعمل Pull فوري بعد نجاح الـ Sync\.[\s\S]*?void pullFromServerRef\.current\(\);\s*\}/g,
    '\n      // Keep the mutation response authoritative; polling will reconcile later.');
  app = app.replace(/\n\s*\/\*\s*\n?\*?\s*Pull نهائي بعد انتهاء الـ Sync\.[\s\S]*?void pullFromServerRef\.current\(\);\s*\}/g,
    '\n      // Do not pull here; avoid replacing a just-completed mutation.');

  // Do not lose deletion tombstones when several mutations are queued together.
  app = app.replace(
    /syncQueuedPayloadRef\.current = \{\n\s*\.\.\.\(syncQueuedPayloadRef\.current \|\| \{\}\),\n\s*\.\.\.payload,\n\s*lastUpdated: now\n\s*\};/,
    `const previousQueued = syncQueuedPayloadRef.current || {};\n    syncQueuedPayloadRef.current = {\n      ...previousQueued,\n      ...payload,\n      deletedAttendanceIds: Array.from(new Set([...(previousQueued.deletedAttendanceIds || []), ...(payload.deletedAttendanceIds || [])])),\n      deletedEmployeeIds: Array.from(new Set([...(previousQueued.deletedEmployeeIds || []), ...(payload.deletedEmployeeIds || [])])),\n      deletedLeaveIds: Array.from(new Set([...(previousQueued.deletedLeaveIds || []), ...(payload.deletedLeaveIds || [])])),\n      lastUpdated: now\n    };`
  );

  fs.writeFileSync(appPath, app);
}

const serverPath = 'server/device-sync-v2.ts';
let server = fs.readFileSync(serverPath, 'utf8');
const sm = '/* SYNC_STALE_WRITE_GUARD_SERVER_V4 */';

if (!server.includes(sm)) {
  // Missing updatedAt is never a fresh update for an existing row.
  server = server.replace(
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt); return itemTime?stamp(itemTime):stamp(syncTime); };",
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt); return itemTime?stamp(itemTime):''; };"
  );

  // Employee records now have an updatedAt column and must follow the same
  // last-write-wins rule as the other synchronized collections.
  server = server.replace(
    "if(!e?.id)return;const id=String(e.id),v=pick(e,['id','code','nameAr','nameEn','avatar','email','phone','department','jobTitleAr','jobTitleEn','shiftId','pin','role','joinedDate','status','annualLeaveBalance','casualLeaveBalance','regularLeaveBalance','sickLeaveBalance','isPhotoRemoved','updatedAt']);",
    "if(!e?.id)return;const id=String(e.id),v=pick(e,['id','code','nameAr','nameEn','avatar','email','phone','department','jobTitleAr','jobTitleEn','shiftId','pin','role','joinedDate','status','annualLeaveBalance','casualLeaveBalance','regularLeaveBalance','sickLeaveBalance','isPhotoRemoved','updatedAt']);"
  );

  // Attendance is uniquely identified by employee + date. Protect that identity
  // as well as the record id from stale devices after deletion.
  server = server.replace(
    "if(v.id&&tombs.has(String(v.id)))return;v.employeeId=employeeId;date=date;",
    "if((v.id&&tombs.has(String(v.id)))||tombs.has(employeeId+':'+date))return;v.employeeId=employeeId;date=date;"
  );
  server = server.replace(
    "if(v.id&&tombs.has(String(v.id)))return;v.employeeId=employeeId;v.date=date;",
    "if((v.id&&tombs.has(String(v.id)))||tombs.has(employeeId+':'+date))return;v.employeeId=employeeId;v.date=date;"
  );
  server = server.replace(
    "if(!a[0]){await db.insert(schema.attendanceRecords).values(v as any);return;}const incoming=ms(v.updatedAt),current=",
    "if(!a[0]){if(!v.updatedAt)return;await db.insert(schema.attendanceRecords).values(v as any);return;}const incoming=ms(v.updatedAt),current="
  );
  server = server.replace(
    "if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any)",
    "if(!incoming)return;if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any)"
  );

  // Deleting an attendance row also stores employee/date as a tombstone.
  server = server.replace(
    "for(const id of clean)await db.delete(t).where(eq(t.id,id));}",
    "for(const id of clean){ if(t===schema.attendanceRecords){ const rows=await db.select().from(t).where(eq(t.id,id)); const row=rows[0]; if(row?.employeeId&&row?.date) await addTombstones('attendance',[id,String(row.employeeId)+':'+String(row.date).slice(0,10)]); } await db.delete(t).where(eq(t.id,id)); }}"
  );

  server += `\n${sm}\n`;
  fs.writeFileSync(serverPath, server);
}

console.log('[sync_stale_writes_v4] applied');
