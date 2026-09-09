import fs from 'fs';

const path = 'src/App.tsx';
let code = fs.readFileSync(path, 'utf8');
const marker = '/* MUTATION_TIMESTAMP_NORMALIZATION_V1 */';

if (!code.includes(marker)) {
  const anchor = `  const now = Date.now();\n\n  lastLocalUpdateRef.current = now;`;
  const at = code.indexOf(anchor);
  if (at === -1) {
    console.warn('[patch_mutation_timestamps] pushSync anchor not found; skipping safely.');
    process.exit(0);
  }

  const insertion = `  ${marker}\n\n  const normalizeMutationArray = <T extends Record<string, any>>(\n    items: T[] | undefined,\n    previous: T[] | undefined,\n    timestamp: string\n  ): T[] | undefined => {\n    if (!Array.isArray(items)) return items;\n    const oldMap = new Map<string, T>();\n    for (const item of Array.isArray(previous) ? previous : []) {\n      if (item?.id != null) oldMap.set(String(item.id), item);\n    }\n    return items.map((item) => {\n      if (!item || item.id == null) return item;\n      const old = oldMap.get(String(item.id));\n      if (!old) return { ...item, updatedAt: timestamp };\n      const strip = (value: any) => {\n        const copy = { ...(value || {}) };\n        delete copy.updatedAt;\n        return copy;\n      };\n      try {\n        if (JSON.stringify(strip(old)) !== JSON.stringify(strip(item))) {\n          return { ...item, updatedAt: timestamp };\n        }\n      } catch {\n        return { ...item, updatedAt: timestamp };\n      }\n      return item;\n    });\n  };\n\n  const mutationTimestamp = new Date(now).toISOString();\n\n  if (overrides?.employees !== undefined) {\n    overrides = { ...overrides, employees: normalizeMutationArray(overrides.employees as any, employeesRef.current as any, mutationTimestamp) as any };\n  }\n  if (overrides?.attendanceRecords !== undefined) {\n    overrides = { ...overrides, attendanceRecords: normalizeMutationArray(overrides.attendanceRecords as any, attendanceRecordsRef.current as any, mutationTimestamp) as any };\n  }\n  if (overrides?.leaveRequests !== undefined) {\n    overrides = { ...overrides, leaveRequests: normalizeMutationArray(overrides.leaveRequests as any, leaveRequestsRef.current as any, mutationTimestamp) as any };\n  }\n  if (overrides?.notifications !== undefined) {\n    overrides = { ...overrides, notifications: normalizeMutationArray(overrides.notifications as any, notificationsRef.current as any, mutationTimestamp) as any };\n  }\n`;

  code = code.slice(0, at) + insertion + code.slice(at);
}

fs.writeFileSync(path, code);
console.log('[patch_mutation_timestamps] applied');
