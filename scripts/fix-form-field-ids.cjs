const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd(), 'src');
const FIELD_TAG = /<(input|textarea|select)\b[\s\S]*?>/g;
const HAS_ID_OR_NAME = /\b(?:id|name)\s*=/;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(tsx|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function safeId(relative, index) {
  const base = relative
    .replace(/\\/g, '-')
    .replace(/\.(tsx|jsx)$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `form-${base || 'field'}-${index}`;
}

let changedFiles = 0;
let fixedFields = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  let index = 0;
  const relative = path.relative(ROOT, file);
  const updated = original.replace(FIELD_TAG, (tag) => {
    index += 1;
    if (HAS_ID_OR_NAME.test(tag)) return tag;
    fixedFields += 1;
    return tag.replace(/^<(input|textarea|select)\b/, `<$1 id="${safeId(relative, index)}"`);
  });

  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    changedFiles += 1;
  }
}

console.log(`[form-field-ids] checked native fields; fixed ${fixedFields} field(s) across ${changedFiles} file(s).`);
