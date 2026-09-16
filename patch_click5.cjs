const fs = require('fs');

const glob = require('fs').readdirSync('src/components').filter(f => f.endsWith('.tsx'));
// Backdrop blur can definitely crash some specific browser engines on mobile. Let's remove it completely.
for (const file of glob) {
  const path = `src/components/${file}`;
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes('backdrop-blur')) {
      content = content.replace(/backdrop-blur-[a-z]+/g, '');
      fs.writeFileSync(path, content);
  }
}

