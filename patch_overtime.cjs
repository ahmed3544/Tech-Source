const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// remove import
code = code.replace(/import \{ OvertimeManager \} from '\.\/components\/OvertimeManager';\n?/, '');

// remove block
const blockRegex = /<div className="mt-8">\s*<OvertimeManager[\s\S]*?\/>\s*<\/div>/;
code = code.replace(blockRegex, '');

fs.writeFileSync('src/App.tsx', code);
