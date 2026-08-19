import fs from 'fs';
import path from 'path';

const serverTsPath = path.join(process.cwd(), 'server.ts');
let code = fs.readFileSync(serverTsPath, 'utf-8');

// I replaced app.post('/api/punch') with the Supabase injection, but I probably matched the first instance and didn't remove the original block properly, or I created a duplicate block.
// I will just do a regex replace to clean it up.
// Actually, let's just rewrite /api/punch entirely.

const startRegex = /\/\/ POST \/api\/punch - Direct atomic endpoint for clock-in, clock-out, break actions/g;
let matchCount = 0;
code = code.replace(startRegex, (match) => {
  matchCount++;
  if (matchCount > 1) {
    return "/* DUPLICATE_PUNCH_START */"; // flag it
  }
  return match;
});

if (matchCount > 1) {
    const splitCode = code.split('/* DUPLICATE_PUNCH_START */');
    const firstPart = splitCode[0];
    const secondPartRaw = splitCode[1];
    
    // find the end of the second block (which is the old legacy logic)
    // it ends with "});"
    // To be safe, let's just delete from DUPLICATE_PUNCH_START up to the next route "// POST /api/attendance"
    const secondPartFixed = secondPartRaw.replace(/app\.post\('\/api\/punch'[\s\S]*?\/\/ POST \/api\/attendance/, "// POST /api/attendance");
    
    code = firstPart + secondPartFixed;
}

fs.writeFileSync(serverTsPath, code, 'utf-8');
console.log('Fixed server.ts punch duplicate');
