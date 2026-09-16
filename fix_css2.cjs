const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(/#root table \{\s*min-width: 600px;\s*font-size: 0\.75rem;\s*\}/, '#root table { font-size: 0.75rem; }');
fs.writeFileSync('src/index.css', code);
