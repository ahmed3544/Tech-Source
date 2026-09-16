const fs = require('fs');
const glob = require('fs').readdirSync('src/components').filter(f => f.endsWith('.tsx'));

for (const file of glob) {
  const path = `src/components/${file}`;
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes('whitespace-nowrap') && !file.includes('DashboardOverview')) {
      content = content.replace(/whitespace-nowrap/g, '');
      fs.writeFileSync(path, content);
  }
}
