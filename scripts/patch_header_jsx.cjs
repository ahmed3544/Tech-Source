const fs = require('fs');

const file = 'src/components/Header.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
const marker = '      {isLeader && <div className="hidden lg:flex justify-center text-[9px] text-slate-500 pb-1">';
const current = '      </div>\n      </div>\n' + marker;
const fixed = '      </div>\n      </div>\n      </div>\n' + marker;

if (source.includes(current) && !source.includes(fixed)) {
  source = source.replace(current, fixed);
  fs.writeFileSync(file, source, 'utf8');
}

console.log('[patch_header_jsx] Header JSX closing tags normalized');
