const fs = require('fs');

let code = fs.readFileSync('src/index.css', 'utf8');

code += `
#root table th,
#root table td {
  white-space: normal !important;
  word-break: break-word !important;
}
`;
fs.writeFileSync('src/index.css', code);
