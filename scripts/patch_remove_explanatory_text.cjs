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

// Keep the Leaves month filter strictly text-only.
const leavePath = path.join(process.cwd(), 'src/components/LeaveManager.tsx');
let leaveSource = fs.readFileSync(leavePath, 'utf8');
const leaveUpdated = leaveSource.replace(
  "{lang === 'ar' ? 'جميع الشهور 📅' : 'All Months'}",
  "{lang === 'ar' ? 'جميع الشهور' : 'All Months'}"
);
if (leaveUpdated !== leaveSource) {
  fs.writeFileSync(leavePath, leaveUpdated, 'utf8');
  console.log('[remove-explanatory-text] removed calendar emoji from Leaves month filter');
} else {
  console.log('[remove-explanatory-text] Leaves month filter already text-only');
}

// Improve contrast for the main splash/login logo on the dark shell.
// This targets only the main App logo, not the white-backed reusable logo component.
const appPath = path.join(process.cwd(), 'src/App.tsx');
let appSource = fs.readFileSync(appPath, 'utf8');
const logoMarker = 'alt="Tech Source GDS"';
const logoIndex = appSource.indexOf(logoMarker);
if (logoIndex >= 0) {
  const before = appSource.slice(0, logoIndex);
  const after = appSource.slice(logoIndex);
  const classMatch = after.match(/className="([\s\S]*?)"/);
  if (classMatch && !classMatch[1].includes('brightness-0') && !classMatch[1].includes('invert')) {
    const nextClass = classMatch[1].replace(/\s+/g, ' ').trim() + ' brightness-0 invert';
    appSource = before + after.replace(classMatch[0], `className="${nextClass}"`);
    fs.writeFileSync(appPath, appSource, 'utf8');
    console.log('[remove-explanatory-text] brightened main Tech Source logo for dark splash/login');
  } else {
    console.log('[remove-explanatory-text] main Tech Source logo contrast already applied');
  }
} else {
  console.log('[remove-explanatory-text] main Tech Source logo marker not found');
}
