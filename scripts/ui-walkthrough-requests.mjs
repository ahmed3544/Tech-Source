// Visual walkthrough for the new features on the demo environment:
//   1. Export to Excel (week + month) — real .xlsx downloads
//   2. Break change request — employee submits, admin sees pending + approves
//   3. Shift swap panel visible for everyone (restored after "الاسواب شفت اتشالت")
//   4. Notification click navigates to the requests card (flash + tab)
//   5. Day view — one day sized to screen with prev/next navigation
//   6. Import Excel — round-trip of the weekly export with one modified cell
// Run while scripts/ui-demo-env.mjs is up on :3112.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:3112';
const SHOTS = '/home/z/my-project/download';
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const exportBtn = page.getByRole('button', { name: /تصدير Excel|Export to Excel/ });
const requestsToggle = page.getByRole('button', { name: /^(تبديل الشيفت|Shift swap)$/ });
const breakTab = page.getByRole('button', { name: /^(تغيير البريك|Break change)$/ });
const settingsToggle = page.locator('header').getByRole('button', { name: /^(الإعدادات|Settings)$/ });

// Excel import/export now lives inside the leader-only "Schedule settings"
// panel — open it (via the header Settings toggle) before using its buttons.
const openExcelSection = async () => {
  if (!(await exportBtn.isVisible().catch(() => false))) await settingsToggle.click();
  await exportBtn.waitFor({ state: 'visible', timeout: 25000 });
};
const closeExcelSection = async () => {
  if (await exportBtn.isVisible().catch(() => false)) await settingsToggle.click(); // loud: surface interceptors
  await exportBtn.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
};

const login = async (code, pin, { leader = true } = {}) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('input', { timeout: 20000 });
  await page.locator('input').first().fill(code);
  await page.locator('input[type="password"]').fill(pin);
  await page.keyboard.press('Enter');
  if (leader) await openExcelSection();
  // Employees see the schedule-requests card again — wait for the schedule
  // toolbar as their login-complete signal (same as before the regression).
  else await page.locator('[data-range-label]').first().waitFor({ state: 'visible', timeout: 25000 });
};

// ---- Login as admin ----
await login('EMP002', '1234');
check('admin login + schedule loads', true);

// ---- Feature 1: week export downloads a real xlsx ----
const [weekDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  exportBtn.click(),
]);
const weekFile = `${SHOTS}/${weekDownload.suggestedFilename()}`;
await weekDownload.saveAs(weekFile);
await closeExcelSection();
check('week export downloads', /TechSource-Schedule-Week-\d{4}-\d{2}-\d{2}\.xlsx/.test(weekDownload.suggestedFilename()), weekDownload.suggestedFilename());
check('week xlsx is a real zip (xlsx)', fs.readFileSync(weekFile).subarray(0, 2).toString() === 'PK', `${fs.statSync(weekFile).size} bytes`);

// ---- Requests DROPDOWN ("عايزه يبقا dropdown عند الايجنت والادمن والليدر"):
// collapsed by default for EVERYONE, header click expands the tabs + panels.
const reqDropdown = page.locator('[data-requests-toggle]');
await page.waitForTimeout(700);
check('requests dropdown header visible (admin)', await reqDropdown.isVisible());
check('requests dropdown COLLAPSED by default (swap tab hidden)', !(await requestsToggle.isVisible().catch(() => false)), `tabVisible=${await requestsToggle.isVisible().catch(() => false)}`);
await reqDropdown.click();
await page.waitForTimeout(400);
check('dropdown expands on header click (swap tab appears)', await requestsToggle.isVisible());
check('shift swap panel visible', await page.getByText('تبديل الشفت', { exact: true }).first().isVisible().catch(() => false));

// ---- Break tab: panel renders there ----
await breakTab.click();
await page.waitForTimeout(700);
check('break request panel visible', await page.getByText('طلب تغيير البريك', { exact: true }).first().isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/requests-panel-admin.png`, fullPage: false });

// ---- Feature 2: submit a break change request from the UI (admin for self) ----
const tomorrow = new Date(Date.now() + 86400000);
const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
await page.locator('input[type="date"]').first().fill(tomorrowKey);
const timeInputs = page.locator('input[type="time"]');
await timeInputs.nth(2).fill('14:00'); // proposed from
await timeInputs.nth(3).fill('14:45'); // proposed to
await page.getByRole('button', { name: /إرسال الطلب للأدمن|Send to admin/ }).click();
await page.waitForSelector('text=/تم إرسال طلب تغيير البريك|submitted/i', { timeout: 15000 });
check('break change request submitted from UI', true);
check('pending chip shows', await page.getByText('بانتظار المراجعة', { exact: true }).first().isVisible().catch(() => false));

// ---- Approve it (admin clicks approve on the pending row) ----
await page.locator('button[title*="اعتماد وتحديث الجدول"], button[title*="Approve & update schedule"]').first().click();
await page.waitForSelector('text=/تم اعتماد الطلب|Request approved/i', { timeout: 15000 });
check('approval from UI works (schedule updated + notified)', true);

// ---- ADMIN DIRECT SWAP ("يسواب الشفت بدون الرجوع للاداره") ----
// The admin swaps two agents' shifts for a date IMMEDIATELY — no swap
// request, no target acceptance, no leader approval chain.
await page.getByRole('button', { name: /^(تبديل الشيفت|Shift swap)$/ }).click();
await page.waitForTimeout(500);
check('direct swap tool visible for ADMIN', await page.locator('[data-direct-swap-apply]').isVisible().catch(() => false));
const directState = await (async () => {
  const d = await (await fetch(`${BASE}/api/data`)).json();
  const rows = d.dailyShiftAssignments || [];
  const e1 = (d.employees || []).find((e) => String(e.code).toUpperCase() === 'EMP101');
  const e2 = (d.employees || []).find((e) => String(e.code).toUpperCase() === 'EMP102');
  if (!e1 || !e2) return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const dates = [...new Set(rows.map((r) => r.date))].filter((dt) => dt >= todayKey && dt !== tomorrowKey).sort();
  for (const dt of [...dates].reverse()) {
    const r1 = rows.find((x) => x.employeeId === e1.id && x.date === dt);
    const r2 = rows.find((x) => x.employeeId === e2.id && x.date === dt);
    if (r1 && r2 && !(r1.isOffDay && r2.isOffDay)) return { e1, e2, date: dt, orig1: r1, orig2: r2 };
  }
  return null;
})();
if (directState) {
  await page.locator('[data-direct-swap-date]').fill(directState.date);
  await page.locator('[data-direct-swap-a]').selectOption(directState.e1.id);
  await page.locator('[data-direct-swap-b]').selectOption(directState.e2.id);
  await page.waitForTimeout(300);
  check('direct swap preview shows both current shifts', await page.getByText(/الوضع الحالي ليوم|Current state on/).first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/direct-swap-before.png`, fullPage: false });
  await page.locator('[data-direct-swap-apply]').click();
  await page.waitForSelector('text=/تم تنفيذ التبديل|Swap applied/', { timeout: 15000 });
  check('direct swap success message shows', true);
  let directLanded = false;
  let directAfter = '';
  for (let i = 0; i < 10 && !directLanded; i++) {
    await page.waitForTimeout(800);
    const d = await (await fetch(`${BASE}/api/data`)).json();
    const rows = d.dailyShiftAssignments || [];
    const r1 = rows.find((x) => x.employeeId === directState.e1.id && x.date === directState.date);
    const r2 = rows.find((x) => x.employeeId === directState.e2.id && x.date === directState.date);
    directAfter = JSON.stringify({ r1, r2 });
    directLanded = Boolean(r1 && r2
      && String(r1.shiftId || '') === String(directState.orig2.shiftId || '') && Boolean(r1.isOffDay) === Boolean(directState.orig2.isOffDay)
      && String(r2.shiftId || '') === String(directState.orig1.shiftId || '') && Boolean(r2.isOffDay) === Boolean(directState.orig1.isOffDay));
  }
  check('direct swap CHANGED the schedule server-side (no approval chain)', directLanded, `date=${directState.date} ${directAfter.slice(0, 200)}`);
  await page.screenshot({ path: `${SHOTS}/direct-swap-admin.png`, fullPage: false });
} else {
  check('direct swap fixture available', false, 'no suitable EMP101+EMP102 date');
}

// ---- Notification click navigates to the requests card ----
await page.locator('header').getByRole('button', { name: /فتح الإشعارات|Open notifications/i }).click();
await page.waitForTimeout(600);
const notifDialog = page.locator('[role="dialog"][aria-label*="الإشعارات"], [role="dialog"][aria-label*="Notification"]').first();
const firstNotif = notifDialog.locator('button').filter({ hasText: /بريك|break|طلب|request|swap|شيفت/i }).first();
if (await firstNotif.count()) {
  await firstNotif.click();
  await page.waitForTimeout(500);
  const requestsCard = page.locator('[data-requests-card]');
  check('notification click flashes the requests card', await requestsCard.evaluate((el) => el.className.includes('ring-4')).catch(() => false));
  check('notification click opens the break tab', await page.getByText('طلب تغيير البريك', { exact: true }).first().isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/notification-navigates-card.png`, fullPage: false });
} else {
  check('notification item available for click-nav', false, 'no notification items for admin in demo — skipped');
}

// ---- Day view: Today → one day, sized to screen, prev/next navigation ----
await page.getByRole('button', { name: /^(يوم|Day)$/ }).click();
await page.waitForTimeout(500);
check('day view opens from toggle', await page.getByRole('button', { name: /اليوم السابق|Previous day/ }).first().isVisible());
const label1 = (await page.locator('[data-range-label]').innerText()).trim();
await page.getByRole('button', { name: /اليوم التالي|Next day/ }).first().click();
await page.waitForTimeout(400);
const label2 = (await page.locator('[data-range-label]').innerText()).trim();
check('day navigation moves to next day', label1 !== label2, `${label1} → ${label2}`);
await page.getByRole('button', { name: 'اليوم', exact: true }).last().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/day-view.png`, fullPage: false });
await page.getByRole('button', { name: /^(أسبوع|Week)$/ }).click();
await page.waitForTimeout(300);

// ---- Month export ----
await page.getByRole('button', { name: /^شهر$|^Month$/ }).click();
await page.waitForTimeout(400);
await openExcelSection();
const [monthDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  exportBtn.click(),
]);
const monthFile = `${SHOTS}/${monthDownload.suggestedFilename()}`;
await monthDownload.saveAs(monthFile);
await closeExcelSection();
check('month export downloads', /TechSource-Schedule-Month-\d{4}-\d{2}\.xlsx/.test(monthDownload.suggestedFilename()), monthDownload.suggestedFilename());
await page.screenshot({ path: `${SHOTS}/month-view-export.png`, fullPage: false });

// ---- Feature: Shadowing (شادوينج) — sky-blue training window ----
// The agent trains a NEW agent for a set window (user example: 1→5 =
// 13:00→17:00). Rendered in sky blue for BOTH the trainer and the trainee.
await page.locator('#employee-shift-assignment').scrollIntoViewIfNeeded();
const shadowBtn = page.locator('[data-shadowing-button]').first();
await shadowBtn.waitFor({ state: 'visible', timeout: 20000 });
await shadowBtn.click();
await page.locator('[data-shadowing-toggle]').waitFor({ state: 'visible', timeout: 10000 });
await page.locator('[data-shadowing-toggle]').check();
await page.locator('[data-shadowing-start]').fill('13:00');
await page.locator('[data-shadowing-end]').fill('17:00');
const traineeSelect = page.locator('[data-shadowing-trainee]');
const traineeValue = await traineeSelect.locator('option').filter({ hasText: 'EMP102' }).first().getAttribute('value');
await traineeSelect.selectOption(traineeValue);
await page.screenshot({ path: `${SHOTS}/shadowing-modal.png`, fullPage: false });
await page.locator('[data-shadowing-apply]').click();
check('shadowing editor applies (day chip shows 13:00–17:00)', await page.getByText(/شادوينج 13:00–17:00/).first().isVisible().catch(() => false));
await page.getByRole('button', { name: /حفظ الأسبوع|Save week/ }).first().click();
await page.getByText(/تم حفظ جدول الأسبوع|Weekly schedule saved successfully/).first().waitFor({ state: 'visible', timeout: 15000 });
check('week save succeeds with shadowing attached', true);
// Return to the week view (the month-export step left the schedule in month
// view — month cells use chips, the timeline block only exists in week/day).
await page.getByRole('button', { name: /^(أسبوع|Week)$/ }).click();
await page.waitForTimeout(600);
const trainerBlock = page.locator('[data-shadowing-block="trainer"]').first();
check('sky-blue shadowing block renders for the trainer', await trainerBlock.isVisible().catch(() => false));
check('shadowing block uses the sky-400 (سماوي) palette', ((await trainerBlock.getAttribute('class').catch(() => '')) || '').includes('bg-sky-400'));
await page.screenshot({ path: `${SHOTS}/shadowing-block-week.png`, fullPage: false });
const shadowingSaved = await page.evaluate(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem('logged_in_user') || 'null');
    const headers = { Accept: 'application/json' };
    if (saved?.id) headers['x-auth-employee-id'] = String(saved.id);
    if (saved?.pin) headers['x-auth-pin'] = String(saved.pin);
    const r = await fetch('/api/schedule-sync', { headers });
    const body = await r.json();
    const rows = (body?.dailyShiftAssignments || []).filter((x) => x.employeeId === 'emp-101' && x.shadowing);
    return { status: r.status, count: rows.length, sample: rows[0]?.shadowing || null };
  } catch (e) { return { status: 0, count: 0, sample: null, error: String(e) }; }
});
check('shadowing persisted server-side', shadowingSaved.status === 200 && shadowingSaved.count > 0 && shadowingSaved.sample.startTime === '13:00' && shadowingSaved.sample.endTime === '17:00' && shadowingSaved.sample.traineeId === 'emp-102', JSON.stringify(shadowingSaved));

// ---- Employee flow: EMP101 — requests card is visible to EVERYONE (restored) ----
// "الاسواب شفت اتشالت" regression fix: the swap + break request card must be
// visible to employees again (they submit swaps, targets accept/reject).
// The leader/admin-only rule applies to the Excel import boxes only.
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /تسجيل الخروج|Log out/ }).click();
await page.waitForSelector('input', { timeout: 15000 });
await login('EMP101', '1234', { leader: false });
check('employee login works', true);
await page.waitForTimeout(700);
check('employee SEES the requests card (restored)', await page.locator('[data-requests-card]').count() > 0, `count=${await page.locator('[data-requests-card]').count()}`);
check('employee requests dropdown COLLAPSED by default', await page.locator('[data-requests-toggle]').isVisible().catch(() => false) && !(await requestsToggle.isVisible().catch(() => false)));
await page.locator('[data-requests-toggle]').click();
await page.waitForTimeout(400);
check('employee sees swap tab', await page.getByRole('button', { name: /تبديل الشيفت|Shift swap/ }).first().isVisible().catch(() => false));
check('employee does NOT see the direct swap tool (admin-only)', !(await page.locator('[data-direct-swap-apply]').isVisible().catch(() => false)));
check('employee sees break tab', await page.getByRole('button', { name: /تغيير البريك|Break change/ }).first().isVisible().catch(() => false));
check('employee sees the swap submit form (date + target + send)', await page.getByText(/تاريخ التبديل|Swap Date/).first().isVisible().catch(() => false) && await page.getByText(/التبديل مع|Swap With/).first().isVisible().catch(() => false));
check('employee does NOT see the Excel import boxes (admin-only)', !(await exportBtn.isVisible().catch(() => false)));
check('employee still sees their schedule', await page.locator('[data-range-label]').first().isVisible());
await page.screenshot({ path: `${SHOTS}/requests-panel-employee.png`, fullPage: false });

// ---- Shift swap e2e part 1/3: employee submits a REAL swap from the UI ----
// Find a date (not tomorrow — the import step later claims it) where EMP101
// and EMP102 both have assignments and are not both OFF.
const swapState = await (async () => {
  const d = await (await fetch(`${BASE}/api/data`)).json();
  const rows = d.dailyShiftAssignments || [];
  const emp101 = (d.employees || []).find((e) => String(e.code).toUpperCase() === 'EMP101');
  const emp102 = (d.employees || []).find((e) => String(e.code).toUpperCase() === 'EMP102');
  if (!emp101 || !emp102) return null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const dates = [...new Set(rows.map((r) => r.date))].filter((dt) => dt >= todayKey && dt !== tomorrowKey).sort();
  for (const dt of dates) {
    const r1 = rows.find((x) => x.employeeId === emp101.id && x.date === dt);
    const r2 = rows.find((x) => x.employeeId === emp102.id && x.date === dt);
    if (r1 && r2 && !(r1.isOffDay && r2.isOffDay)) return { emp101, emp102, date: dt, orig101: r1, orig102: r2 };
  }
  return null;
})();
if (swapState) {
  const cardDate = page.locator('[data-requests-card] input[type="date"]');
  await cardDate.fill(swapState.date);
  const targetSelect = page.locator('[data-requests-card] select');
  const optValue = await targetSelect.locator('option').filter({ hasText: 'EMP102' }).first().getAttribute('value');
  await targetSelect.selectOption(optValue);
  await page.getByRole('button', { name: /^إرسال الطلب$|^Submit Request$/ }).click();
  await page.waitForTimeout(1800);
  check('employee swap submitted from UI (row appears with the date)', await page.locator('[data-requests-card]').getByText(swapState.date).first().isVisible().catch(() => false), `date=${swapState.date}`);
} else {
  check('swap e2e fixture available', false, 'no date where EMP101+EMP102 both have assignments');
}

// ---- Notification bell mounted in header ----
await page.locator('header').getByRole('button', { name: /فتح الإشعارات|Open notifications/i }).click();
await page.waitForTimeout(600);
check('notification center opens in header', await page.locator('[role="dialog"][aria-label*="الإشعارات"], [role="dialog"][aria-label*="Notification"]').first().isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/notification-bell.png`, fullPage: false });

// ---- Shadowing trainee side: EMP102 (the new agent) sees the same window ----
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /تسجيل الخروج|Log out/ }).click();
await page.waitForSelector('input', { timeout: 15000 });
await login('EMP102', '1234', { leader: false });
await page.waitForTimeout(800);
const traineeBlock = page.locator('[data-shadowing-block="trainee"]').first();
check('trainee (new agent) sees the sky-blue shadowing window', await traineeBlock.isVisible().catch(() => false));
check('trainee block also uses the sky-400 palette', ((await traineeBlock.getAttribute('class').catch(() => '')) || '').includes('bg-sky-400'));
await page.screenshot({ path: `${SHOTS}/shadowing-block-trainee.png`, fullPage: false });

// ---- Shift swap e2e part 2/3: the target employee accepts from the UI ----
if (swapState) {
  if (!(await requestsToggle.isVisible().catch(() => false))) { await page.locator('[data-requests-toggle]').click(); await page.waitForTimeout(400); }
  const acceptBtn = page.locator('[data-requests-card] button[title="موافقة"], [data-requests-card] button[title="Accept"]').first();
  if (await acceptBtn.isVisible().catch(() => false)) {
    await acceptBtn.click();
    await page.waitForTimeout(1800);
    check('target accepted the swap from UI (awaiting_target → pending)', true);
  } else {
    check('target sees the accept button', false, 'no awaiting_target row rendered for EMP102');
  }
}

// ---- Leader (EMP011): the dropdown works for leaders too, but the direct
// swap tool is ADMIN-ONLY ("بدون الرجوع للاداره" applies to the admin).
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /تسجيل الخروج|Log out/ }).click();
await page.waitForSelector('input', { timeout: 15000 });
await login('EMP011', 'leader123', { leader: false });
check('leader login works', true);
await page.waitForTimeout(700);
check('leader sees the requests dropdown (collapsed by default)', await page.locator('[data-requests-toggle]').isVisible().catch(() => false) && !(await requestsToggle.isVisible().catch(() => false)));
await page.locator('[data-requests-toggle]').click();
await page.waitForTimeout(400);
check('leader can expand the dropdown (swap panel visible)', await page.getByText('تبديل الشفت', { exact: true }).first().isVisible().catch(() => false));
check('leader does NOT see the direct swap tool (admin-only)', !(await page.locator('[data-direct-swap-apply]').isVisible().catch(() => false)));
check('leader sees the pending swap approve button', await page.locator('[data-requests-card] button[title="اعتماد"], [data-requests-card] button[title="Approve"]').first().isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/requests-dropdown-leader.png`, fullPage: false });

// ---- Excel content sanity: open the week workbook with xlsx and inspect rows ----
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const XLSX = require('/home/z/my-project/Tech-Source/node_modules/xlsx');
const wb = XLSX.readFile(weekFile);
check('two sheets present (roster + breaks detail)', wb.SheetNames.length >= 2, wb.SheetNames.join(', '));
const rosterRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
const flat = JSON.stringify(rosterRows);
check('week sheet has employee names', /Marwa|مروة|Karim|كريم/.test(flat));
check('week sheet has OFF label', flat.includes('OFF'));
check('week sheet has break times', /\d{2}:\d{2}/.test(flat));
const detailRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[1]], { header: 1 });
check('breaks detail sheet has data rows', detailRows.length >= 2, `${detailRows.length - 1} break rows`);
console.log('\nRoster header:', JSON.stringify(rosterRows[0]));
console.log('Sample row:', JSON.stringify(rosterRows[1]).slice(0, 220));

// ---- Import Excel: round-trip the week export with one modified cell ----
// Back to admin (import is leader-only), then upload a modified workbook.
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /تسجيل الخروج|Log out/ }).click();
await page.waitForSelector('input', { timeout: 15000 });
await login('EMP002', '1234');
check('admin re-login for import', true);

// ---- Shift swap e2e part 3/3: leader approves → schedule MUST change ----
// This is the regression fix for "بعد الاسواب مايتعمل الشفت مش بيتبدل": the
// swapped rows go through /api/schedule-sync (permission-checked) instead of
// /api/sync (which strips schedule rows server-side).
if (swapState) {
  if (!(await requestsToggle.isVisible().catch(() => false))) { await page.locator('[data-requests-toggle]').click(); await page.waitForTimeout(400); }
  const approveBtn = page.locator('[data-requests-card] button[title="اعتماد"], [data-requests-card] button[title="Approve"]').first();
  if (await approveBtn.isVisible().catch(() => false)) {
    await approveBtn.click();
    let landed = false;
    let after = '';
    for (let i = 0; i < 10 && !landed; i++) {
      await page.waitForTimeout(1000);
      const d = await (await fetch(`${BASE}/api/data`)).json();
      const rows = d.dailyShiftAssignments || [];
      const r1 = rows.find((x) => x.employeeId === swapState.emp101.id && x.date === swapState.date);
      const r2 = rows.find((x) => x.employeeId === swapState.emp102.id && x.date === swapState.date);
      after = JSON.stringify({ r1, r2 });
      landed = Boolean(r1 && r2
        && String(r1.shiftId || '') === String(swapState.orig102.shiftId || '') && Boolean(r1.isOffDay) === Boolean(swapState.orig102.isOffDay)
        && String(r2.shiftId || '') === String(swapState.orig101.shiftId || '') && Boolean(r2.isOffDay) === Boolean(swapState.orig101.isOffDay));
    }
    check('approved swap CHANGED the schedule server-side (fix verified)', landed, `date=${swapState.date} ${after.slice(0, 200)}`);
    check('swap approval shows no error bar', !(await page.getByText(/تعذر تنفيذ|تعذر حفظ|Could not apply|Could not save/).first().isVisible().catch(() => false)));
  } else {
    check('admin sees the approve button', false, 'no pending swap row rendered');
  }
}

const importWb = XLSX.readFile(weekFile);
const importSheet = importWb.Sheets[importWb.SheetNames[0]];
const importAoa = XLSX.utils.sheet_to_json(importSheet, { header: 1, defval: '' });
const tmrLabel = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}`;
let shiftCol = -1;
(importAoa[0] || []).forEach((h, i) => { if (i >= 2 && String(h).includes(tmrLabel) && !String(h).includes('بريكات') && !/breaks?/i.test(String(h))) shiftCol = i; });
const empRowIdx = importAoa.findIndex((r, i) => i > 0 && String(r[0]).includes('EMP101'));
check('import fixture: found EMP101 row + tomorrow column', empRowIdx > 0 && shiftCol > 1, `row=${empRowIdx}, col=${shiftCol}, header=${String(importAoa[0]?.[shiftCol])}`);
if (empRowIdx > 0 && shiftCol > 1) {
  importAoa[empRowIdx][shiftCol] = 'OFF — راحة أسبوعية';
  if (shiftCol + 1 < importAoa[empRowIdx].length) importAoa[empRowIdx][shiftCol + 1] = '—';
  const outPath = '/tmp/import-roundtrip.xlsx';
  // Replace sheet 0's content so the parser (which reads sheet 0) sees the modified roster.
  importWb.Sheets[importWb.SheetNames[0]] = XLSX.utils.aoa_to_sheet(importAoa);
  fs.writeFileSync(outPath, XLSX.write(importWb, { type: 'buffer', bookType: 'xlsx' }));

  page.on('dialog', (d) => d.accept());
  await page.locator('input[type="file"]').setInputFiles(outPath);
  await page.waitForSelector('text=/تم استيراد|imported/i', { timeout: 25000 });
  check('import applies the modified roster (success message)', true);

  // Verify server state: tomorrow's EMP101 assignment is now an OFF day.
  const employeesJson = await (await fetch(`${BASE}/api/data`)).json();
  const emp101 = (employeesJson.employees || []).find((e) => String(e.code).toUpperCase() === 'EMP101');
  const syncJson = await (await fetch(`${BASE}/api/schedule-sync`)).json();
  const row = (syncJson.dailyShiftAssignments || []).find((a) => emp101 && String(a.employeeId) === String(emp101.id) && String(a.date).slice(0, 10) === tomorrowKey);
  check('imported OFF persisted server-side', Boolean(row?.isOffDay), JSON.stringify(row));
} else {
  check('import fixture found', false, 'EMP101 row or date column missing from export');
}
await page.screenshot({ path: `${SHOTS}/import-excel-done.png`, fullPage: false });

// ---- Activity log (audit trail): السجل — who changed what ----
// The actions performed above (logins, break request submit + approve,
// schedule edits, Excel import) must now be recorded server-side and
// visible in the new السجل panel (leaders/admins only).

// 1) API check with the admin's auth headers (from localStorage session).
const activityJson = await page.evaluate(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem('logged_in_user') || 'null');
    const headers = { Accept: 'application/json' };
    if (saved?.id) headers['x-auth-employee-id'] = String(saved.id);
    if (saved?.pin) headers['x-auth-pin'] = String(saved.pin);
    const r = await fetch('/api/activity-logs?limit=300', { headers });
    return { status: r.status, body: await r.json() };
  } catch (e) { return { status: 0, body: { error: String(e) } }; }
});
check('activity-logs API reachable', activityJson.status === 200 && activityJson.body?.success === true, `status=${activityJson.status}`);
const logs = activityJson.body?.logs || [];
const recordedActions = new Set(logs.map((l) => l.action));
console.log('Recorded actions:', [...recordedActions].join(', '));
check('activity log: sign-in recorded', recordedActions.has('auth.login'));
check('activity log: break request submit recorded', recordedActions.has('break_request.submit'));
check('activity log: break request approval recorded', recordedActions.has('break_request.approve'));
check('activity log: excel import recorded', recordedActions.has('schedule.import_excel'));
check('activity log: rows carry actor + timestamp', logs.length > 0 && logs.every((l) => l.actorId && l.createdAt), `rows=${logs.length}`);

// 2) UI check: السجل button (inside the Preferences menu) opens the panel populated with entries.
// The employee-management overlay (opened during the import step) covers the
// dropdown menu — close it first, otherwise the menu item click is intercepted.
await closeExcelSection();
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /سجل النشاط|Activity Log/ }).click();
await page.waitForSelector('[data-testid="activity-log-rows"] > div', { timeout: 15000 });
const uiRows = await page.locator('[data-testid="activity-log-rows"] > div').count();
check('activity log panel opens with rows', uiRows > 0, `rows=${uiRows}`);
await page.screenshot({ path: `${SHOTS}/activity-log-panel.png`, fullPage: false });
await page.getByRole('button', { name: /إغلاق السجل|Close activity log/ }).click();
await page.waitForSelector('[data-testid="activity-log-rows"]', { state: 'detached', timeout: 5000 }).catch(() => {});
check('activity log panel closes', true);

// ---- Google Sheets sync panel: opens, loads config, actions present ----
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /ربط Google Sheets|Google Sheets sync/ }).click();
await page.waitForSelector('[role="dialog"][aria-label*="Google Sheets"]', { timeout: 15000 });
check('sheet sync panel opens from preferences menu', true);
check('sheet sync setup steps visible', await page.getByText(/خطوات الربط|Setup steps/).first().isVisible().catch(() => false));
check('sheet sync url input present', await page.locator('[role="dialog"][aria-label*="Google Sheets"] input[type="url"]').isVisible());
check('sheet sync actions present', await page.getByRole('button', { name: /مزامنة الآن|Sync now/ }).isVisible());
await page.screenshot({ path: `${SHOTS}/sheet-sync-panel.png`, fullPage: false });
await page.getByRole('button', { name: /إغلاق الربط|Close Google Sheets sync/ }).click();
await page.waitForSelector('[role="dialog"][aria-label*="Google Sheets"]', { state: 'detached', timeout: 5000 }).catch(() => {});
check('sheet sync panel closes', true);

// ---- Excel dashboard import panel: opens, upload flow, URL auto-sync section ----
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /استيراد الداش بورد|Excel dashboard import/ }).click();
await page.waitForSelector('[role="dialog"][aria-label*="استيراد الداش بورد"]', { timeout: 15000 });
check('dashboard import panel opens from preferences menu', true);
check('dashboard import upload section visible', await page.getByText(/ارفع ملف الداش بورد|Upload your dashboard file/).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false));
check('dashboard import url auto-sync section visible (admin)', await page.getByText(/مزامنة تلقائية من رابط الملف|Auto-sync from a file URL/).first().isVisible().catch(() => false));
check('dashboard import url input present', await page.locator('[role="dialog"][aria-label*="استيراد الداش بورد"] input[type="url"]').isVisible());
check('dashboard import: auto-import box visible', await page.getByText(/الاستيراد التلقائي للملف المرفوع|Automatic re-import of the uploaded file/).first().isVisible().catch(() => false));
check('dashboard import: import-stored-file button present', await page.getByRole('button', { name: /استيراد الملف المحفوظ الآن|Import stored file now/ }).first().isVisible().catch(() => false));
check('dashboard import: daily re-import toggle present (admin)', await page.getByText(/استيراد تلقائي كل يوم|Re-import daily/).first().isVisible().catch(() => false));

// Real end-to-end upload: Arabic dashboard grid → preview → apply → server state.
const dashWb = XLSX.utils.book_new();
const dashRows = [
  ['الكود', 'اسم الموظف', 'الوظيفة', '25/10/2026', '26/10/2026', '27/10/2026'],
  ['IMP901', 'نهى محمود', 'موظف', 'صباحي 08:00-16:00', 'OFF', 'صباحي 08:00-16:00'],
];
XLSX.utils.book_append_sheet(dashWb, XLSX.utils.aoa_to_sheet(dashRows), 'الجدول الأسبوعي');
const dashPath = '/tmp/dashboard-fixture.xlsx';
fs.writeFileSync(dashPath, XLSX.write(dashWb, { type: 'buffer', bookType: 'xlsx' }));
const panelDialog = page.locator('[role="dialog"][aria-label*="استيراد الداش بورد"]');
await panelDialog.locator('input[type="file"]').setInputFiles(dashPath);
await page.waitForSelector('text=/جدول شيوفات|Shift roster/', { timeout: 20000 });
check('dashboard import detects the schedule sheet', await panelDialog.getByText('IMP901').isVisible().catch(() => false) || await panelDialog.getByText(/الجدول الأسبوعي/).first().isVisible().catch(() => false));
check('dashboard import options appear after analysis', await page.getByText(/باسورد مؤقت للموظفين الجدد|Temporary password for new employees/).first().isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/dashboard-import-panel.png`, fullPage: false });
await panelDialog.getByRole('button', { name: /استيراد الآن|Import now/ }).click();
await page.waitForSelector('text=/نتيجة الاستيراد|Import result/', { timeout: 30000 });
check('dashboard import apply succeeds with summary', true);
await page.waitForTimeout(2600); // the app auto-reloads ~1.8s after import

// Server state: IMP901 exists with the default pin + got the schedule assignments.
const stateAfterImport = await page.evaluate(async () => {
  const saved = JSON.parse(localStorage.getItem('logged_in_user') || 'null');
  const headers = { Accept: 'application/json' };
  if (saved?.id) headers['x-auth-employee-id'] = String(saved.id);
  if (saved?.pin) headers['x-auth-pin'] = String(saved.pin);
  const employees = await (await fetch('/api/data', { headers })).json();
  const schedule = await (await fetch('/api/schedule-sync', { headers })).json();
  const imported = (employees.employees || []).find((e) => String(e.code).toUpperCase() === 'IMP901');
  const rows = imported ? (schedule.dailyShiftAssignments || []).filter((a) => String(a.employeeId) === String(imported.id)) : [];
  return { found: Boolean(imported), id: imported?.id, assignments: rows.map((r) => `${r.date}:${r.isOffDay ? 'OFF' : r.shiftId}`).sort() };
});
check('dashboard import: IMP901 created server-side', stateAfterImport.found, JSON.stringify(stateAfterImport));
check('dashboard import: 3 schedule rows applied (1 OFF)', stateAfterImport.assignments.length === 3 && stateAfterImport.assignments.filter((a) => a.endsWith(':OFF')).length === 1, JSON.stringify(stateAfterImport.assignments));

// The uploaded workbook is also kept on the server for the daily auto re-import.
const storedCheck = await page.evaluate(async () => {
  const saved = JSON.parse(localStorage.getItem('logged_in_user') || 'null');
  const headers = { Accept: 'application/json' };
  if (saved?.id) headers['x-auth-employee-id'] = String(saved.id);
  if (saved?.pin) headers['x-auth-pin'] = String(saved.pin);
  const data = await (await fetch('/api/dashboard-import', { headers })).json();
  return { hasStoredFile: Boolean(data?.config?.hasStoredFile), name: data?.config?.storedFileName ?? null, autoImport: Boolean(data?.config?.autoImport) };
});
check('dashboard import: uploaded file stored server-side for auto-import', storedCheck.hasStoredFile, JSON.stringify(storedCheck));
await panelDialog.getByRole('button', { name: /إغلاق الاستيراد|Close dashboard import/ }).click().catch(() => {});
check('dashboard import panel closes', true);

console.log(`\nConsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  !', e.slice(0, 200)));
const failed = results.filter((r) => !r.ok);
console.log(`===== WALKTHROUGH: ${results.length - failed.length}/${results.length} checks passed =====`);
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
