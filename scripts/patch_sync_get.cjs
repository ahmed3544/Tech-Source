const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'server', 'device-sync-v2.ts');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');
const old = "if(req.method==='GET'&&dataPath)return res.json(await snapshot());if(req.method!=='POST'||!syncPath)return next();";
const next = "if(req.method==='GET'&&(dataPath||syncPath))return res.json(await snapshot());if(req.method!=='POST'||!syncPath)return next();";
if (s.includes(next)) process.exit(0);
if (!s.includes(old)) {
  console.error('[patch-sync-get] target not found');
  process.exit(1);
}
s = s.replace(old, next);
fs.writeFileSync(file, s);
console.log('[patch-sync-get] GET /api/sync now returns the canonical sync snapshot');
