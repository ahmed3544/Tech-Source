const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(/#root table td \{\s*white-space: normal;\s*word-break: break-word;\s*\}/, '#root table td { white-space: normal; }');
fs.writeFileSync('src/index.css', code);
