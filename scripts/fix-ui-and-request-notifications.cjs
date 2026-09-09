const fs = require('fs');

function patch(path, replacements) {
  let code = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (!code.includes(from)) continue;
    code = code.replace(from, to);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, code);
}

// Keep the logo visually stable in dark mode and keep login credentials readable in light mode.
patch('src/components/TechSourceLogo.tsx', [
  [
    'className={`${imgHeightClass} w-auto max-w-full object-contain`}',
    'className={`${imgHeightClass} w-auto max-w-full object-contain dark:filter-none`}'
  ]
]);

patch('src/components/LoginModal.tsx', [
  [
    '<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">',
    '<div className="login-modal fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">'
  ]
]);

patch('src/components/NotificationCenter.tsx', [
  [
    "    seen.add(id);\n    return true;",
    "    // Ignore malformed legacy/demo notifications that have no real request relation.\n    const hasRelation = Boolean(n.relatedLeaveId || n.relatedShiftSwapId || n.relatedOvertimeId);\n    const allowedStandalone = n.type === 'admin_notice';\n    if (!hasRelation && !allowedStandalone) return false;\n    seen.add(id);\n    return true;"
  ],
  [
    '      onMarkAsRead?.(id);',
    '      // The notification endpoint is the source of truth; do not push stale parent state back. '
  ],
  [
    '      onMarkAllAsRead?.();',
    '      // The notification endpoint is the source of truth; do not push stale parent state back. '
  ]
]);

// Send a real pending-leave notification to leaders when an employee submits a request.
patch('src/App.tsx', [
  [
    "      /*\n       * Pending request:\n       * Send the complete current leave list.\n       */\n\n      await pushSync({\n        leaveRequests:\n          nextLeaves\n      });",
    "      /* Pending request: notify the leader(s) and persist the request together. */\n      const nextNotifications = [...notificationsRef.current];\n      const leaderRecipients = employeesRef.current\n        .filter(emp => (emp.role === 'leader' || emp.role === 'admin') && emp.id !== req.employeeId)\n        .map(emp => emp.id);\n      for (const recipientId of leaderRecipients) {\n        const exists = nextNotifications.some(n =>\n          n.type === 'leave_requested' &&\n          n.recipientId === recipientId &&\n          n.relatedLeaveId === req.id\n        );\n        if (!exists) {\n          nextNotifications.push(createNotification(\n            recipientId,\n            'leave_requested',\n            lang === 'ar' ? 'طلب إجازة جديد' : 'New Leave Request',\n            lang === 'ar'\n              ? `${req.employeeId} أرسل طلب إجازة من ${req.startDate} إلى ${req.endDate}.`\n              : `${req.employeeId} submitted a leave request from ${req.startDate} to ${req.endDate}.`,\n            req.employeeId,\n            req.id\n          ));\n        }\n      }\n      notificationsRef.current = nextNotifications;\n      setNotifications(nextNotifications);\n      try { localStorage.setItem('notifications', JSON.stringify(nextNotifications)); } catch {}\n      await pushSync({ leaveRequests: nextLeaves, notifications: nextNotifications });"
  ]
]);

// Make the leader see a submitted swap immediately; review remains disabled until the target accepts.
patch('src/components/ShiftSwapPanel.tsx', [
  [
    "    const nextRequests = [...requests, req];\n    const nextNotifications = [...notifications, makeNotification(targetId, 'shift_swap_requested', lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request', lang === 'ar' ? `${name(currentUser.id)} أرسل لك طلب تبديل شفت ليوم ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. راجع الطلب واضغط موافقة أو رفض.` : `${name(currentUser.id)} sent you a shift swap request for ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. Review it and accept or reject.`, req.id, now)];",
    "    const nextRequests = [...requests, req];\n    const leaderRecipients = employees.filter(e => (e.role === 'leader' || e.role === 'admin') && e.id !== currentUser.id).map(e => e.id);\n    const requestNotifications = [makeNotification(targetId, 'shift_swap_requested', lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request', lang === 'ar' ? `${name(currentUser.id)} أرسل لك طلب تبديل شفت ليوم ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. راجع الطلب واضغط موافقة أو رفض.` : `${name(currentUser.id)} sent you a shift swap request for ${date}: ${shiftLabel(mine)} ↔ ${shiftLabel(theirs)}. Review it and accept or reject.`, req.id, now), ...leaderRecipients.map(recipientId => makeNotification(recipientId, 'shift_swap_requested', lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request', lang === 'ar' ? `${name(currentUser.id)} أرسل طلب تبديل شفت مع ${name(targetId)} ليوم ${date}. الطلب بانتظار موافقة الموظف الآخر.` : `${name(currentUser.id)} submitted a shift swap with ${name(targetId)} for ${date}. Waiting for the other employee.`, req.id, now))];\n    const nextNotifications = [...notifications, ...requestNotifications];"
  ],
  [
    "  const visibleRequests = isLeader\n    ? requests.filter(r => r.status !== 'awaiting_target' && team.some(e => e.id === r.requesterId || e.id === r.targetEmployeeId))",
    "  const visibleRequests = isLeader\n    ? requests.filter(r => team.some(e => e.id === r.requesterId || e.id === r.targetEmployeeId))"
  ]
]);
