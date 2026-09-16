const fs = require('fs');

let content = fs.readFileSync('src/components/CompanyRulesModal.tsx', 'utf8');

// The file is huge. I'll just use a smart regex or simply provide the full translated strings for the most obvious parts, or wrap it using a function.
