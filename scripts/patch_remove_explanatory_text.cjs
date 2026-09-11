const fs = require('fs');
const path = require('path');

const cssPath = path.join(process.cwd(), 'src/index.css');
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* Global compact UI: remove explanatory subtitles/descriptions directly attached to headings. */';

if (!css.includes(marker)) {
  css += `\n\n${marker}\n#root h1 + p,\n#root h2 + p,\n#root h3 + p,\n#root h4 + p {\n  display: none !important;\n}\n\n#root h1 + div > p:first-child,\n#root h2 + div > p:first-child,\n#root h3 + div > p:first-child,\n#root h4 + div > p:first-child {\n  display: none !important;\n}\n`;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('[remove-explanatory-text] explanatory heading subtitles hidden globally');
} else {
  console.log('[remove-explanatory-text] already applied');
}
