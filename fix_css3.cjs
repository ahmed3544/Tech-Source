const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');

// The issue "لما بضغط علي الجدول" could be because they click the background `backdrop-blur-sm` overlay of a Modal that crashes?
// No, they said "when I click on the table".
// A table row crash usually comes from an undefined property passed to a handler, or bad CSS.
// Let's remove the transition group on AttendanceLogTable completely, to be 100% sure it's not a React CSS Transition error.

