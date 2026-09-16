const fs = require('fs');

let code = fs.readFileSync('src/index.css', 'utf8');

// I also added word-break: break-word earlier. Let's revert the CSS table changes as they might have broken table layout severely leading to crashes on some devices.

code = code.replace(
  /#root table th,\s*#root table td \{\s*white-space: normal !important;\s*word-wrap: break-word !important;\s*\}/g,
  `#root table th,
#root table td {
  white-space: nowrap;
}`
);

fs.writeFileSync('src/index.css', code);
