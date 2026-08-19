const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

if (!code.includes('accounts.google.com/gsi/client')) {
  code = code.replace('</head>', '    <script src="https://accounts.google.com/gsi/client" async defer></script>\n  </head>');
  fs.writeFileSync('index.html', code);
}
