const fs = require('fs');

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
const marker = '/* SYNC_STALE_WRITE_GUARD_V3 */';
if (!app.includes(marker)) {
  const old = `const now = Date.now();\n\n  lastLocalUpdateRef.current = now;`;
  const at = app.indexOf(old);
  if (at !== -1) {
    const insert = `const now = Date.now();\n\n  lastLocalUpdateRef.current = now;\n\n  ${marker}\n  // Never stamp an unchanged full-array item as a fresh mutation.\n  // Only records whose contents actually changed get a new updatedAt.\n  const stampChanged = (items, previous, timestamp) => {\n    if (!Array.isArray(items)) return items;\n    const prev = new Map((Array.isArray(previous) ? previous : []).map(x => [String(x?.id ?? ''), x]));\n    return items.map(item => {\n      if (!item || item.id == null) return item;\n      const oldItem = prev.get(String(item.id));\n      if (!oldItem) return { ...item, updatedAt: timestamp };\n      const strip = x => { const y = { ...(x || {}) }; delete y.updatedAt; return y; };\n      try {\n        return JSON.stringify(strip(oldItem)) !== JSON.stringify(strip(item))\n          ? { ...item, updatedAt: timestamp }\n          : item;\n      } catch { return { ...item, updatedAt: timestamp }; }\n    });\n  };\n\n  if (overrides?.employees !== undefined) overrides = { ...overrides, employees: stampChanged(overrides.employees, employeesRef.current, new Date(now).toISOString()) };\n  if (overrides?.attendanceRecords !== undefined) overrides = { ...overrides, attendanceRecords: stampChanged(overrides.attendanceRecords, attendanceRecordsRef.current, new Date(now).toISOString()) };\n  if (overrides?.leaveRequests !== undefined) overrides = { ...overrides, leaveRequests: stampChanged(overrides.leaveRequests, leaveRequestsRef.current, new Date(now).toISOString()) };\n  if (overrides?.notifications !== undefined) overrides = { ...overrides, notifications: stampChanged(overrides.notifications, notificationsRef.current, new Date(now).toISOString()) };`;
    app = app.slice(0, at) + insert + app.slice(at + old.length);
  }

  // Do not pull immediately after a mutation. The sync response is already authoritative.
  app = app.replace(/\n\s*\/\*\s*\n?\*?\s*IMPORTANT:\s*\n?\*?\s*اعمل Pull فوري بعد نجاح الـ Sync\.[\s\S]*?void pullFromServerRef\.current\(\);\s*\}/g, '\n      // Keep the mutation result; polling will reconcile later.');
  app = app.replace(/\n\s*\/\*\s*\n?\*?\s*Pull نهائي بعد انتهاء الـ Sync\.[\s\S]*?void pullFromServerRef\.current\(\);\s*\}/g, '\n      // Do not pull here; avoid replacing a just-completed local mutation.');

  fs.writeFileSync(appPath, app);
}

const serverPath = 'server/device-sync-v2.ts';
let server = fs.readFileSync(serverPath, 'utf8');
const sm = '/* SYNC_STALE_WRITE_GUARD_SERVER_V3 */';
if (!server.includes(sm)) {
  // Missing updatedAt must never be treated as a new update for an existing row.
  server = server.replace(
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt); return itemTime?stamp(itemTime):stamp(syncTime); };",
    "const newestStamp = (item:any,syncTime:any) => { const itemTime=ms(item?.updatedAt); return itemTime?stamp(itemTime):''; };"
  );

  // Attendance deletion must be protected by both record id and employee/date identity.
  server = server.replace(
    "async function upsertAttendance(r:any,syncTime:any,tombs:Set<string>){",
    "async function upsertAttendance(r:any,syncTime:any,tombs:Set<string>){"
  );
  server = server.replace(
    "if(v.id&&tombs.has(String(v.id)))return;v.employeeId=employeeId;v.date=date;v.updatedAt=newestStamp(r,syncTime);const a=",
    "if((v.id&&tombs.has(String(v.id)))||tombs.has(employeeId+':'+date))return;v.employeeId=employeeId;v.date=date;v.updatedAt=newestStamp(r,syncTime);const a="
  );
  server = server.replace(
    "if(!a[0]){await db.insert(schema.attendanceRecords).values(v as any);return;}const incoming=ms(v.updatedAt),current=",
    "if(!a[0]){if(!v.updatedAt)return;await db.insert(schema.attendanceRecords).values(v as any);return;}const incoming=ms(v.updatedAt),current="
  );
  server = server.replace(
    "if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any)",
    "if(!incoming)return;if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any)"
  );

  // Existing rows in every collection cannot be overwritten by an item with no timestamp.
  server = server.replace(
    "if(!incoming)return; if(!current||incoming>=current)return db.update(table).set(values as any).where(eq(table.id,id));",
    "if(!incoming)return; if(!current||incoming>=current)return db.update(table).set(values as any).where(eq(table.id,id));"
  );

  // Add composite attendance tombstones when deleting by id.
  server = server.replace(
    "for(const id of clean)await db.delete(t).where(eq(t.id,id));}",
    "for(const id of clean){ if(t===schema.attendanceRecords){ const rows=await db.select().from(t).where(eq(t.id,id)); const row=rows[0]; if(row?.employeeId&&row?.date) await addTombstones('attendance',[id,String(row.employeeId)+':'+String(row.date).slice(0,10)]); } await db.delete(t).where(eq(t.id,id)); }}"
  );

  server += `\n${sm}\n`;
  fs.writeFileSync(serverPath, server);
}

console.log('[sync_stale_writes_v3] applied');
