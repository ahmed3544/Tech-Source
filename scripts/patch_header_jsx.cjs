const fs = require('fs');

const file = 'src/components/Header.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');

// The generated Header currently has an unmatched wrapper around the
// search/profile controls. Normalize the exact tail of the component
// instead of relying on a fragile number of closing tags.
const marker = '      {isLeader && <div className="hidden lg:flex justify-center text-[9px] text-slate-500 pb-1">';
const markerIndex = source.indexOf(marker);

if (markerIndex !== -1) {
  const beforeMarker = source.slice(0, markerIndex);
  const afterMarker = source.slice(markerIndex);

  // At this point the Header's top control row must have exactly the
  // following three wrapper closures before the leader status row:
  //   1) right-side control group
  //   2) main header flex row
  //   3) outer header content container
  const normalizedBefore = beforeMarker.replace(/(?:      <\/div>\n){0,5}$/, '      </div>\n      </div>\n      </div>\n');
  source = normalizedBefore + afterMarker;
}

fs.writeFileSync(file, source, 'utf8');
console.log('[patch_header_jsx] Header JSX wrapper tail normalized');
