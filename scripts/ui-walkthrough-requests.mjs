// Visual walkthrough for the new features on the demo environment:
//   1. Export to Excel (week + month) — real .xlsx downloads
//   2. Break change request — employee submits, admin sees pending + approves
//   3. Shift swap panel visible for everyone
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

const login = async (code, pin) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('input', { timeout: 20000 });
  await page.locator('input').first().fill(code);
  await page.locator('input[type="password"]').fill(pin);
  await page.keyboard.press('Enter');
  await exportBtn.waitFor({ state: 'visible', timeout: 25000 });
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
check('week export downloads', /TechSource-Schedule-Week-\d{4}-\d{2}-\d{2}\.xlsx/.test(weekDownload.suggestedFilename()), weekDownload.suggestedFilename());
check('week xlsx is a real zip (xlsx)', fs.readFileSync(weekFile).subarray(0, 2).toString() === 'PK', `${fs.statSync(weekFile).size} bytes`);

// ---- Requests card is open by default with the swap tab active ----
await page.waitForTimeout(700);
check('shift swap tab visible by default', await requestsToggle.isVisible());
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
const [monthDownload] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  exportBtn.click(),
]);
const monthFile = `${SHOTS}/${monthDownload.suggestedFilename()}`;
await monthDownload.saveAs(monthFile);
check('month export downloads', /TechSource-Schedule-Month-\d{4}-\d{2}\.xlsx/.test(monthDownload.suggestedFilename()), monthDownload.suggestedFilename());
await page.screenshot({ path: `${SHOTS}/month-view-export.png`, fullPage: false });

// ---- Employee flow: EMP101 sees the request form ----
await page.getByRole('button', { name: /التفضيلات|Preferences/ }).click();
await page.getByRole('menuitem', { name: /تسجيل الخروج|Log out/ }).click();
await page.waitForSelector('input', { timeout: 15000 });
await login('EMP101', '1234');
check('employee login works', true);
await breakTab.click();
await page.waitForTimeout(700);
check('employee sees break request form', await page.getByRole('button', { name: /إرسال الطلب للأدمن|Send to admin/ }).isVisible());
await page.screenshot({ path: `${SHOTS}/requests-panel-employee.png`, fullPage: false });

// ---- Notification bell mounted in header ----
await page.locator('header').getByRole('button', { name: /فتح الإشعارات|Open notifications/i }).click();
await page.waitForTimeout(600);
check('notification center opens in header', await page.locator('[role="dialog"][aria-label*="الإشعارات"], [role="dialog"][aria-label*="Notification"]').first().isVisible().catch(() => false));
await page.screenshot({ path: `${SHOTS}/notification-bell.png`, fullPage: false });

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

console.log(`\nConsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  !', e.slice(0, 200)));
const failed = results.filter((r) => !r.ok);
console.log(`===== WALKTHROUGH: ${results.length - failed.length}/${results.length} checks passed =====`);
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
