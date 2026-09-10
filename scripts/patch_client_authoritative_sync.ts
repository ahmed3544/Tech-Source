import fs from 'fs';

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');

const fetchMarker = [
  '      const data =',
  '        await res.json();'
].join('\n');

const authoritativeMarker = '/* DEVICE_SYNC_AUTHORITATIVE_SNAPSHOT_V3 */';

if (!code.includes(authoritativeMarker)) {
  const at = code.indexOf(fetchMarker);
  if (at === -1) {
    console.warn('[patch_client_authoritative_sync] sync response marker not found; skipping safely.');
    process.exit(0);
  }

  const insertion = `

      ${authoritativeMarker}
      if (data?.success) {
        if (Array.isArray(data.attendanceRecords)) {
          const serverAttendance = data.attendanceRecords.map(ensureSanitizedRecord).filter((r: AttendanceRecord) => r && r.date);
          attendanceRecordsRef.current = serverAttendance;
          setAttendanceRecords(serverAttendance);
          try { localStorage.setItem('attendance_records', JSON.stringify(serverAttendance)); } catch {}
        }
        if (Array.isArray(data.employees)) {
          employeesRef.current = data.employees;
          setEmployees(data.employees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(data.employees)); } catch {}
          if (currentUser?.id) {
            const canonicalUser = data.employees.find((e: Employee) => e?.id === currentUser.id);
            if (canonicalUser) { setCurrentUser(canonicalUser); try { localStorage.setItem('logged_in_user', JSON.stringify(canonicalUser)); } catch {} }
          }
        }
        if (Array.isArray(data.leaveRequests)) {
          const serverLeaves = applyPendingLeaveDecisions(data.leaveRequests);
          leaveRequestsRef.current = serverLeaves;
          setLeaveRequests(serverLeaves);
          try { localStorage.setItem('attendance_leaves', JSON.stringify(serverLeaves)); } catch {}
        }
        if (Array.isArray(data.notifications)) {
          notificationsRef.current = data.notifications;
          setNotifications(data.notifications);
          try { localStorage.setItem('notifications', JSON.stringify(data.notifications)); } catch {}
        }
        if (Array.isArray(data.shifts)) { setShifts(data.shifts); try { localStorage.setItem('attendance_shifts', JSON.stringify(data.shifts)); } catch {} }
        if (Array.isArray(data.dailyShiftAssignments)) { setDailyShiftAssignments(data.dailyShiftAssignments); try { localStorage.setItem('daily_shift_assignments', JSON.stringify(data.dailyShiftAssignments)); } catch {} }
      }`;

  code = code.slice(0, at + fetchMarker.length) + insertion + code.slice(at + fetchMarker.length);
}

const employeeStateMarker = `        employeesRef.current = data.employees;
          setEmployees(data.employees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(data.employees)); } catch {}
          if (currentUser?.id) {
            const canonicalUser = data.employees.find((e: Employee) => e?.id === currentUser.id);`;
const employeeStateReplacement = `        const serverShifts = Array.isArray(data.shifts) ? data.shifts : [];
          const shiftIds = new Set(serverShifts.map((s: Shift) => String(s?.id || '')));
          const fallbackShiftId = String(serverShifts[0]?.id || '');
          const canonicalEmployees = data.employees.map((employee: Employee) => {
            const currentShiftId = String(employee?.shiftId || '');
            return currentShiftId && shiftIds.has(currentShiftId) ? employee : fallbackShiftId ? { ...employee, shiftId: fallbackShiftId } : employee;
          });
          employeesRef.current = canonicalEmployees;
          setEmployees(canonicalEmployees);
          try { localStorage.setItem('attendance_employees', JSON.stringify(canonicalEmployees)); } catch {}
          if (currentUser?.id) {
            const canonicalUser = canonicalEmployees.find((e: Employee) => e?.id === currentUser.id);`;
if (code.includes(employeeStateMarker) && !code.includes('const serverShifts = Array.isArray(data.shifts)')) code = code.replace(employeeStateMarker, employeeStateReplacement);

code = code.replace(/\n\s*if \(\s*pullFromServerRef\.current\s*\)\s*\{\s*void pullFromServerRef\.current\(\);\s*\}/g, '\n      // Authoritative snapshot already applied; polling remains as a safety net.');
code = code.replace(/window\.setInterval\(\s*pullFromServer,\s*1500\s*\)/g, 'window.setInterval(\n        pullFromServer,\n        15000\n      )');

// V4: preserve a locally-read notification when a stale server snapshot is older.
const notificationConsistencyMarker = '/* NOTIFICATION_READ_CONSISTENCY_V4 */';
if (!code.includes(notificationConsistencyMarker)) {
  const notificationBlock = /const serverNotifications\s*=\s*data\.notifications;[\s\S]*?localStorage\.setItem\(['"]notifications['"],\s*JSON\.stringify\(serverNotifications\)\);/;
  if (notificationBlock.test(code)) {
    const replacement = `const serverNotifications = data.notifications;

            ${notificationConsistencyMarker}
            const localNotificationById = new Map(notificationsRef.current.map((n: Notification) => [String(n.id), n]));
            const mergedNotifications = serverNotifications.map((serverItem: Notification) => {
              const localItem = localNotificationById.get(String(serverItem.id));
              if (!localItem || !localItem.isRead || serverItem.isRead) return serverItem;
              const localTime = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
              const serverTime = new Date(serverItem.updatedAt || serverItem.createdAt || 0).getTime();
              return localTime >= serverTime ? localItem : serverItem;
            });
            const serverIds = new Set(serverNotifications.map((n: Notification) => String(n.id)));
            const preservedLocal = notificationsRef.current.filter((n: Notification) => n.isRead && !serverIds.has(String(n.id)));
            const nextNotifications = [...mergedNotifications, ...preservedLocal];
            notificationsRef.current = nextNotifications;
            setNotifications(nextNotifications);
            try { localStorage.setItem('notifications', JSON.stringify(nextNotifications)); } catch {}`;
    code = code.replace(notificationBlock, replacement);
  }
}

/* SERVER SYNC HARDENING V2
 * The old snapshot returned Date.now(), even when the POST /api/sync failed.
 * That made a failed sync look newer than the local mutation and caused the
 * next poll to overwrite the user's change. Also, deleted attendance rows had
 * no tombstone, so a stale device could recreate them on its next full-array sync.
 */
const serverPath = 'server/device-sync-v2.ts';
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');
  const serverMarker = '/* SERVER_SYNC_HARDENING_V2 */';
  if (!server.includes(serverMarker)) {
    const oldAttendance = `async function upsertAttendance(r:any,syncTime:any){if(!r?.employeeId||!r?.date)return;const employeeId=String(r.employeeId),date=String(r.date).slice(0,10),v=pick(r,['id','employeeId','date','checkIn','checkOut','breakStart','breakEnd','breaks','totalBreakSeconds','location','deviceInfo','lateMinutes','lateSeconds','earlyLeaveMinutes','workHours','overtimeHours','minusHours','status','leaveType','notes','verifiedByFace','isExcused','excusedBy','excusedReason','updatedAt','isExplicitCancelCheckOut']);v.employeeId=employeeId;v.date=date;v.updatedAt=newestStamp(r,syncTime);const a=await db.select().from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.employeeId,employeeId),eq(schema.attendanceRecords.date,date)));if(!a[0]){await db.insert(schema.attendanceRecords).values(v as any);return;}const incoming=ms(v.updatedAt),current=ms((a[0] as any).updatedAt||(a[0] as any).createdAt);if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any).where(eq(schema.attendanceRecords.id,(a[0] as any).id));}`;
    const newAttendance = `async function upsertAttendance(r:any,syncTime:any){if(!r?.employeeId||!r?.date)return;const employeeId=String(r.employeeId),date=String(r.date).slice(0,10),v=pick(r,['id','employeeId','date','checkIn','checkOut','breakStart','breakEnd','breaks','totalBreakSeconds','location','deviceInfo','lateMinutes','lateSeconds','earlyLeaveMinutes','workHours','overtimeHours','minusHours','status','leaveType','notes','verifiedByFace','isExcused','excusedBy','excusedReason','updatedAt','isExplicitCancelCheckOut']);v.employeeId=employeeId;v.date=date;v.updatedAt=newestStamp(r,syncTime);const tomb=await db.select().from(schema.settings).where(eq(schema.settings.key,'__deleted_attendance:'+String(v.id||employeeId+':'+date)));const deletedAt=ms(tomb[0]?.value);const incoming=ms(v.updatedAt);if(deletedAt&&incoming<=deletedAt)return;const a=await db.select().from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.employeeId,employeeId),eq(schema.attendanceRecords.date,date)));if(!a[0]){await db.insert(schema.attendanceRecords).values(v as any);return;}const current=ms((a[0] as any).updatedAt||(a[0] as any).createdAt);if(current&&incoming<current)return;await db.update(schema.attendanceRecords).set(v as any).where(eq(schema.attendanceRecords.id,(a[0] as any).id));}`;
    if (server.includes(oldAttendance)) server = server.replace(oldAttendance, newAttendance);

    const oldDel = `async function del(t:any,ids:any){if(!Array.isArray(ids))return;for(const x of ids){const id=String(x||'').trim();if(id)await db.delete(t).where(eq(t.id,id));}}`;
    const newDel = `async function del(t:any,ids:any){if(!Array.isArray(ids))return;for(const x of ids){const id=String(x||'').trim();if(!id)continue;await db.delete(t).where(eq(t.id,id));if(t===schema.attendanceRecords){await db.insert(schema.settings).values({key:'__deleted_attendance:'+id,value:new Date().toISOString()} as any).onConflictDoUpdate({target:schema.settings.key,set:{value:new Date().toISOString()} as any});}}}`;
    if (server.includes(oldDel)) server = server.replace(oldDel, newDel);

    const oldSnapshot = `employeeShiftAssignments,lastUpdated:Date.now()}`;
    const newSnapshot = `employeeShiftAssignments,lastUpdated:Math.max(0,...[...employees,...attendanceRecords,...leaveRequests,...overtimeRequests,...shifts,...notifications,...employeeShiftAssignments,...settings].map((x:any)=>ms(x?.updatedAt||x?.createdAt||x?.value)).filter((x:number)=>Number.isFinite(x)&&x>0))}`;
    if (server.includes(oldSnapshot)) server = server.replace(oldSnapshot, newSnapshot);

    server = server.replace(/^(import React[\s\S]*?)/, '$1');
    server = server + `\n${serverMarker}\n`;
    fs.writeFileSync(serverPath, server, 'utf8');
    console.log('[patch_client_authoritative_sync] server sync hardening applied');
  }
}

fs.writeFileSync(path, code);
console.log('[patch_client_authoritative_sync] applied');
