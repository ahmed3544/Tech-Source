const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');

code = code.replace(
  /#root table th,\s*#root table td \{\s*white-space: nowrap;\s*\}/g,
  `#root table th,
#root table td {
  white-space: normal;
  word-break: break-word;
}`
);

fs.writeFileSync('src/index.css', code);
