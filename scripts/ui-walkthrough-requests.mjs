// Visual walkthrough for the 3 new features on the demo environment:
//   1. Export to Excel (week + month) — real .xlsx downloads
//   2. Break change request — employee submits, admin sees pending + approves
//   3. Shift swap panel visible for everyone
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
const requestsToggle = page.getByRole('button', { name: /طلبات الجدول|Schedule requests/ });

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

// ---- Requests section renders both panels ----
await requestsToggle.click();
await page.waitForTimeout(700);
check('break request panel visible', await page.getByText('طلب تغيير البريك', { exact: true }).first().isVisible().catch(() => false));
check('shift swap panel visible', await page.getByText('تبديل الشفت', { exact: true }).first().isVisible().catch(() => false));
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
await requestsToggle.click();
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

console.log(`\nConsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  !', e.slice(0, 200)));
const failed = results.filter((r) => !r.ok);
console.log(`===== WALKTHROUGH: ${results.length - failed.length}/${results.length} checks passed =====`);
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
