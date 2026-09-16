const fs = require('fs');

let code = fs.readFileSync('src/components/AttendanceLogTable.tsx', 'utf8');

// There's a subtle error possible with `lang === 'ar' ? ...` inside elements. But usually that doesn't cause a crash purely on click.
// However, the user said they click on the *table*. They don't say they click a button.
// Is it possible there is an `onClick` on a TR somewhere else?
