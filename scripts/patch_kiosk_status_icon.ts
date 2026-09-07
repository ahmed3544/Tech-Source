import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/components/KioskPunch.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const replacements: Array<[string, string]> = [
  [
    'className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto"',
    'className="flex items-center gap-2.5 bg-slate-900 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-sm shrink-0 w-full sm:w-auto min-h-[48px]"'
  ],
  [
    'className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700"',
    'className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 text-emerald-400 border border-slate-700 shrink-0"'
  ],
  [
    '<Clock className="w-4 h-4" />',
    '<Clock className="w-3.5 h-3.5" strokeWidth={2.25} />'
  ],
  [
    'className="text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap w-full min-w-0 overflow-visible"',
    'className="text-[11px] leading-4 font-mono font-bold flex items-center gap-1.5 whitespace-nowrap min-w-0 overflow-visible"'
  ],
  [
    '<span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-xs" />',
    '<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" strokeWidth={2.25} />'
  ],
  [
    '<span className={`w-2 h-2 rounded-full ${currentRecord.status === \'absent\' ? \'bg-rose-400\' : currentRecord.status === \'late\' ? \'bg-amber-400\' : \'bg-emerald-400\'} animate-pulse shrink-0`} />',
    '<span className={`w-2 h-2 rounded-full ${currentRecord.status === \'absent\' ? \'bg-rose-400\' : currentRecord.status === \'late\' ? \'bg-amber-400\' : \'bg-emerald-400\'} animate-pulse shrink-0`} aria-hidden="true" />'
  ]
];

let changed = false;
for (const [from, to] of replacements) {
  if (code.includes(from)) {
    code = code.replace(from, to);
    changed = true;
  }
}

if (!changed) {
  if (code.includes('min-h-[48px]') && code.includes('strokeWidth={2.25}')) {
    console.log('Kiosk status icon sizing already patched.');
    process.exit(0);
  }
  throw new Error('Could not find the expected Kiosk status markup.');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Patched Kiosk attendance status icon sizing and alignment.');
