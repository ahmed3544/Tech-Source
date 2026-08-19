const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// In /api/punch, we want to make sure serverState.employees and serverState.shifts are populated
if (!code.includes("serverState.shifts = await db.select().from(schema.shifts);")) {
  code = code.replace(
    "const existingQuery = await db.select().from(schema.attendanceRecords).where(sql\\`id = \\${canonicalId}\\`);",
    "if (!serverState.employees) serverState.employees = await db.select().from(schema.employees);\n      if (!serverState.shifts) serverState.shifts = await db.select().from(schema.shifts);\n      const existingQuery = await db.select().from(schema.attendanceRecords).where(sql\`id = \${canonicalId}\`);"
  );
}
fs.writeFileSync('server.ts', code);
