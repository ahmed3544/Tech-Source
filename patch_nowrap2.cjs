const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');

code = code.replace(
  /#root table th,\s*#root table td \{\s*white-space: normal;\s*word-break: break-word;\s*\}/,
  `#root table th,
#root table td {
  white-space: normal !important;
  word-wrap: break-word !important;
}`
);

fs.writeFileSync('src/index.css', code);
