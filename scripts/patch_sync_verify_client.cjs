const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(file)) process.exit(0);
let s = fs.readFileSync(file, 'utf8');

const marker = '/* NEON_WRITE_VERIFICATION_CLIENT_V1 */';
if (s.includes(marker)) process.exit(0);

const target = `      const data =\n        await res.json();`;
if (!s.includes(target)) {
  console.error('[patch-sync-verify-client] target not found');
  process.exit(1);
}

const replacement = `${target}\n\n      ${marker}\n      if (data?.success === false) {\n        throw new Error(String(data?.error || 'NEON_SYNC_WRITE_FAILED'));\n      }\n      if (data?.neonWriteVerified === false) {\n        throw new Error('NEON_WRITE_VERIFICATION_FAILED');\n      }`;
s = s.replace(target, replacement);
fs.writeFileSync(file, s);
console.log('[patch-sync-verify-client] client now surfaces Neon persistence failures');
