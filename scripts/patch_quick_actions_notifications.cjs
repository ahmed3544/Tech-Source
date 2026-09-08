const fs = require('fs');

function patchFile(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

patchFile('src/components/DashboardOverview.tsx', (code) => {
  const start = code.indexOf('        {/* Quick Action Buttons */}');
  if (start === -1) return code;
  const endMarker = '        </div>\n      </div>\n\n      {/* Metric KPI Cards Row */}';
  const end = code.indexOf(endMarker, start);
  if (end === -1) return code;
  const replacement = `        {/* Quick Actions Dropdown */}
        <div className="relative shrink-0 w-full md:w-auto">
          <label htmlFor="dashboard-quick-actions" className="sr-only">
            {lang === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions'}
          </label>
          <select
            id="dashboard-quick-actions"
            defaultValue=""
            aria-label={lang === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions'}
            onChange={(e) => {
              const action = e.target.value;
              if (action === 'manual') onOpenManualPunch();
              else if (action === 'bulk') setActiveTab('attendance');
              else if (action === 'employee') onOpenAddEmployee();
              else if (action === 'export') onExportCSV();
              e.currentTarget.value = '';
            }}
            className="w-full md:w-60 h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="" disabled>
              {lang === 'ar' ? 'الإجراءات السريعة' : 'Quick Actions'}
            </option>
            <option value="manual">{lang === 'ar' ? 'تسجيل يدوي (يوم)' : 'Manual Entry (Day)'}</option>
            <option value="bulk">{lang === 'ar' ? 'تسجيل حضور جماعي (إجمالي الأيام)' : 'Bulk Attendance (Total Days)'}</option>
            <option value="employee">{lang === 'ar' ? 'إضافة موظف' : 'Add Employee'}</option>
            <option value="export">{lang === 'ar' ? 'تصدير اكسل' : 'Export Excel'}</option>
          </select>
        </div>
      </div>
`;
  return code.slice(0, start) + replacement + code.slice(end + endMarker.indexOf('\n\n'));
});

patchFile('src/components/NotificationCenter.tsx', (code) => code.replace(
  /notifications\.filter\(n => n\.recipientId === currentUserId(?: && n\?\.id)?(?: && \(String\(n\.title \|\| ''\)\.trim\(\) \|\| String\(n\.message \|\| ''\)\.trim\(\) \|\| n\.type\))?\)/g,
  "notifications.filter(n => n.recipientId === currentUserId && n?.id && (String(n.title || '').trim() || String(n.message || '').trim()))"
));

patchFile('src/components/NotificationsPage.tsx', (code) => code.replace(
  /notifications\.filter\(n => n\.recipientId === currentUserId(?: && n\?\.id)?(?: && \(String\(n\.title \|\| ''\)\.trim\(\) \|\| String\(n\.message \|\| ''\)\.trim\(\) \|\| n\.type\))?\)/g,
  "notifications.filter(n => n.recipientId === currentUserId && n?.id && (String(n.title || '').trim() || String(n.message || '').trim()))"
));
