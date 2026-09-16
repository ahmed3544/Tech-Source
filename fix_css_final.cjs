const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(/#root table th,\s*#root table td \{\s*white-space: normal;\s*word-break: break-word;\s*\}/g, '');
fs.writeFileSync('src/index.css', code);
