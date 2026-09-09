import fs from 'fs';

const path = 'server/notification-system-v2.ts';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* NOTIFICATION_ID_PRESERVE_V1 */';

if (!code.includes(marker)) {
  const anchor = "function stableId(input: Omit<NotificationRecord, 'id'> & { id?: string }) {";
  const at = code.indexOf(anchor);
  if (at === -1) {
    console.warn('[patch_notification_stable_id] anchor not found; skipping safely.');
    process.exit(0);
  }
  const bodyStart = code.indexOf('{', at);
  const bodyEnd = code.indexOf('\n}', bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) {
    console.warn('[patch_notification_stable_id] function body not found; skipping safely.');
    process.exit(0);
  }
  const replacement = `{
  ${marker}
  if (input.id) return String(input.id);
  const basis = [input.recipientId, input.type, input.relatedEmployeeId || '', input.relatedLeaveId || '', input.relatedOvertimeId || '', input.relatedShiftSwapId || '', input.title, input.message].join('|');
  return \`n2_\${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 40)}\`;
}`;
  code = code.slice(0, bodyStart) + replacement + code.slice(bodyEnd + 2);
  fs.writeFileSync(path, code);
}
console.log('[patch_notification_stable_id] applied');
