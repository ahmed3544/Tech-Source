const fs = require('fs');

const schedulePath = 'src/components/WeeklyShiftSchedule.tsx';
const headerPath = 'src/components/Header.tsx';

// Keep Agent-to-Agent shift swap visible at the top of the weekly schedule.
if (fs.existsSync(schedulePath)) {
  let code = fs.readFileSync(schedulePath, 'utf8');
  const panel = '          <ShiftSwapPanel employees={employees} shifts={shifts} assignments={assignments} currentUser={currentUser} lang={lang} />';
  const marker = '          {isLeader && <>\n';
  if (code.includes(panel) && code.includes(marker) && !code.includes('/* AGENT SHIFT SWAP TOP */')) {
    code = code.replace(panel + '\n', '');
    const block = '          {/* AGENT SHIFT SWAP TOP */}\n' + panel + '\n\n';
    code = code.replace(marker, block + marker);
    fs.writeFileSync(schedulePath, code);
  }
}

// Restore the Leader-only "سجل الحضور" navigation item.
// The attendance log component and its edit controls are already present in App.tsx;
// this patch only restores the missing navigation entry.
if (fs.existsSync(headerPath)) {
  let header = fs.readFileSync(headerPath, 'utf8');
  const kioskButton = "<button onClick={() => setActiveTab('kiosk')}";
  if (header.includes(kioskButton) && !header.includes("setActiveTab('attendance')") ) {
    const start = header.indexOf(kioskButton);
    const end = header.indexOf('</button>', start);
    if (end !== -1) {
      const after = end + '</button>'.length;
      const attendanceButton = "<button onClick={() => setActiveTab('attendance')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'attendance' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><UserCheck className=\"inline w-3.5 h-3.5 mr-1\" />{lang === 'ar' ? 'سجل الحضور' : 'Attendance Log'}</button>";
      header = header.slice(0, after) + attendanceButton + header.slice(after);
      fs.writeFileSync(headerPath, header);
    }
  }
}
