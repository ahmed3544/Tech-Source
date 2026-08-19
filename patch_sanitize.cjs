const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Inside sanitizeRecordServer, default to serverState if maps are empty
code = code.replace(
  "function sanitizeRecordServer(r, employeesMap = {}, shiftsMap = {}) {",
  `function sanitizeRecordServer(r, employeesMap = null, shiftsMap = null) {
  if (!employeesMap && serverState.employees) {
    employeesMap = {};
    serverState.employees.forEach(e => { employeesMap[e.id] = e; });
  }
  if (!shiftsMap && serverState.shifts) {
    shiftsMap = {};
    serverState.shifts.forEach(s => { shiftsMap[s.id] = s; });
  }
  employeesMap = employeesMap || {};
  shiftsMap = shiftsMap || {};
`
);

fs.writeFileSync('server.ts', code);
