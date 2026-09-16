const fs = require('fs');

const file = 'src/components/Header.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
const marker = '      {isLeader && <div className="hidden lg:flex justify-center text-[9px] text-slate-500 pb-1">';
const markerIndex = source.indexOf(marker);

if (markerIndex !== -1) {
  const beforeMarker = source.slice(0, markerIndex);
  const afterMarker = source.slice(markerIndex);

  // patch_quick_actions adds one closing wrapper before this marker.
  // The second navigation row needs four closing divs here in the
  // generated Header: the notification row, its inner container,
  // the navigation strip, and the surrounding header row wrapper.
  const normalizedBefore = beforeMarker.replace(/(?:      <\/div>\n){0,6}$/, '      </div>\n');
  source = normalizedBefore + afterMarker;
}

fs.writeFileSync(file, source, 'utf8');
console.log('[patch_header_jsx] Header JSX wrapper tail normalized');
