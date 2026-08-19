const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

if (!code.includes("import crypto from 'crypto';")) {
  code = "import crypto from 'crypto';\n" + code;
}

code = code.replace(/const crypto = require\('crypto'\);/, '');

fs.writeFileSync('server.ts', code);
