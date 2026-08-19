const fs = require('fs');
let code = fs.readFileSync('src/utils/helpers.ts', 'utf8');

if (!code.includes("formatHoursToHHMM")) {
  code += `
export function formatHoursToHHMM(hours?: number | null | string): string {
  if (hours === undefined || hours === null || isNaN(Number(hours))) return '--:--';
  const val = Number(hours);
  if (val < 0) return '00:00';
  const totalMinutes = Math.round(val * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return \`\${String(h).padStart(2, '0')}:\${String(m).padStart(2, '0')}\`;
}
`;
  fs.writeFileSync('src/utils/helpers.ts', code);
}
