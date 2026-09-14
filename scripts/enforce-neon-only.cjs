const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcRoot = path.join(root, 'src');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

function stripBrowserStorage(code) {
  code = code.replace(/^[ \t]*(?:window\.)?(?:localStorage|sessionStorage)\.setItem\([\s\S]*?\);[ \t]*$/gm, '');
  code = code.replace(/^[ \t]*(?:window\.)?(?:localStorage|sessionStorage)\.removeItem\([\s\S]*?\);[ \t]*$/gm, '');
  code = code.replace(/^[ \t]*(?:window\.)?(?:localStorage|sessionStorage)\.clear\(\);[ \t]*$/gm, '');
  code = code.replace(/(?:window\.)?(?:localStorage|sessionStorage)\.getItem\([\s\S]*?\)/g, 'null');
  return code;
}

for (const file of walk(srcRoot)) {
  const before = fs.readFileSync(file, 'utf8');
  let after = stripBrowserStorage(before);
  // Never fall back to bundled/mock employee, attendance, or leave datasets.
  after = after.replace(/return\s+INITIAL_EMPLOYEES\s*;/g, 'return [];');
  after = after.replace(/return\s+INITIAL_ATTENDANCE\s*;/g, 'return [];');
  after = after.replace(/return\s+INITIAL_LEAVES\s*;/g, 'return [];');
  after = after.replace(/const\s+missingInitial\s*=\s*INITIAL_EMPLOYEES\.filter\([\s\S]*?\);\s*return\s*\[[\s\S]*?\.\.\.missingInitial[\s\S]*?\];/g, 'return parsed;');
  if (after !== before) fs.writeFileSync(file, after);
}

const serverFile = path.join(root, 'server.ts');
if (fs.existsSync(serverFile)) {
  let code = fs.readFileSync(serverFile, 'utf8');
  code = code.replace(/import \{ recoverMissingLegacyData \} from "\.\/server\/legacy-data-recovery\.js";\n?/, '');
  code = code.replace(/const DATA_FILE = path\.join\(process\.cwd\(\), "server_data\.json"\);\n/, '');
  code = code.replace(/const BACKUP_DIR = path\.join\(process\.cwd\(\), "backups"\);\n/, '');
  code = code.replace(/const USE_DATABASE = Boolean\(process\.env\.DATABASE_URL \|\| process\.env\.SUPABASE_DB_URL\);/, 'const USE_DATABASE = true;');
  code = code.replace(/\napp\.use\(\(req:any,res:any,next:any\)=>\{\n  if \(process\.env\.DATABASE_URL && \(req\.path === '\/api\/data' \|\| req\.path === '\/api\/sync'\)\) \{\n    void recoverMissingLegacyData\(\)\.catch\(\(e:any\)=>console\.error\('\[legacy-recovery\]',e\)\);\n  \}\n  next\(\);\n\}\);\n/, '\n');
  code = code.replace(/if \(!USE_DATABASE\) return res\.json\(emptyState\(\);\n/, '');
  fs.writeFileSync(serverFile, code);
}

console.log('[enforce-neon-only] Neon is the only application data source');