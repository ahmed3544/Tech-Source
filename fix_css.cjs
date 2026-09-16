const fs = require('fs');

let code = fs.readFileSync('src/index.css', 'utf8');

// The `word-break: break-word;` global css applied to ALL TD and TH elements might be causing severe rendering bugs in webkit/blink when combined with fixed widths or flex children that can't wrap.
// Let's remove the global CSS table rules entirely so it returns to Tailwind defaults.

code = code.replace(/#root table th,\s*#root table td \{\s*white-space: normal;\s*\}/, '');
fs.writeFileSync('src/index.css', code);
