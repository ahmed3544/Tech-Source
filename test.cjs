const css = require('fs').readFileSync('src/index.css', 'utf8');
console.log(css.includes('word-break: break-word'));
