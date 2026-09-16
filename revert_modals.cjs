const fs = require('fs');

const glob = require('fs').readdirSync('src/components').filter(f => f.endsWith('.tsx'));
for (const file of glob) {
  const path = `src/components/${file}`;
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes('fixed inset-0 z-50 bg-slate-900/60  flex')) {
      content = content.replace(/fixed inset-0 z-50 bg-slate-900\/60  flex/g, 'fixed inset-0 z-50 bg-slate-900/60 flex');
      fs.writeFileSync(path, content);
  }
}
