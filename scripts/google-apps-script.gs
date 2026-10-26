/**
 * Tech-Source → Google Sheets (dashboard feed) — reference copy.
 *
 * The same code is embedded in src/components/SheetSyncPanel.tsx with a
 * copy button inside the app (Preferences → ربط Google Sheets). This file
 * exists for versioning/reference only — always copy the newest version
 * from inside the app.
 *
 * Setup:
 *  1. Open your dashboard spreadsheet → Extensions → Apps Script.
 *  2. Replace all code with this file, optionally set SYNC_TOKEN below.
 *  3. Deploy → New deployment → Web app → Execute as: Me,
 *     Who has access: Anyone → Deploy.
 *  4. Copy the /exec URL into the website (Preferences → Google Sheets sync).
 *
 * The script writes these feed tabs (existing tabs are never touched):
 *   Employees, Attendance, Leaves, Overtime, Schedule, Breaks,
 *   BreakRequests, Swaps, Shifts + _SyncInfo.
 * Optional Excel archive: set SAVE_EXCEL_TO_DRIVE = true and DRIVE_FOLDER_ID.
 */

var SYNC_TOKEN = ''; // optional: same token from the website (recommended)
var SAVE_EXCEL_TO_DRIVE = false;
var DRIVE_FOLDER_ID = '';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(28000);
    var body = JSON.parse(e.postData.contents);
    if (SYNC_TOKEN && String(body.token || '') !== SYNC_TOKEN) return reply({ ok: false, error: 'invalid token' });
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = body.sheets || {};
    var written = [];
    for (var name in sheets) {
      var block = sheets[name] || {};
      var rows = (block.rows || []).map(function (r) { return r.map(function (c) { return (c === null || c === undefined) ? '' : c; }); });
      var header = block.header || [];
      var sh = getOrCreate(ss, name);
      sh.clearContents();
      var values = header.length ? [header].concat(rows) : rows;
      if (values.length && values[0].length) {
        sh.getRange(1, 1, values.length, values[0].length).setValues(values);
      }
      sh.setFrozenRows(header.length ? 1 : 0);
      written.push(name + '=' + rows.length);
    }
    var meta = getOrCreate(ss, '_SyncInfo');
    meta.clearContents();
    meta.getRange(1, 1, 3, 2).setValues([
      ['Last sync (UTC)', body.generatedAt || new Date().toISOString()],
      ['Source', body.source || 'tech-source'],
      ['Rows', written.join(', ')]
    ]);
    if (SAVE_EXCEL_TO_DRIVE && DRIVE_FOLDER_ID) {
      var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd_HH-mm');
      var blob = ss.getBlob().setName('Tech-Source-' + stamp + '.xlsx');
      DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
    }
    return reply({ ok: true, written: written.join(', ') });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function doGet() {
  return reply({ ok: true, service: 'tech-source-sheet-sync', time: new Date().toISOString() });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreate(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}
