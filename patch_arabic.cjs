const fs = require('fs');

function replaceInFile(path, replacements) {
  let code = fs.readFileSync(path, 'utf8');
  let originalCode = code;
  for (const [search, replace] of replacements) {
    if (typeof search === 'string') {
      code = code.split(search).join(replace);
    } else {
      code = code.replace(search, replace);
    }
  }
  if (code !== originalCode) {
    fs.writeFileSync(path, code);
  }
}

replaceInFile('src/components/AttendanceLogTable.tsx', [
  ['<option value="on_time">حاضر (في الوقت)</option>', `{lang === 'ar' ? <option value="on_time">حاضر (في الوقت)</option> : <option value="on_time">On Time</option>}`],
  ['<option value="late">متأخر (بعد 09:00 AM)</option>', `{lang === 'ar' ? <option value="late">متأخر (بعد 09:00 AM)</option> : <option value="late">Late (After 09:00 AM)</option>}`],
  ['<option value="early_leave">انصراف مبكر</option>', `{lang === 'ar' ? <option value="early_leave">انصراف مبكر</option> : <option value="early_leave">Early Leave</option>}`],
  ['<option value="overtime">ساعات إضافية</option>', `{lang === 'ar' ? <option value="overtime">ساعات إضافية</option> : <option value="overtime">Overtime</option>}`],
  ['<option value="weekend">عطلة أسبوعية 🏖️</option>', `{lang === 'ar' ? <option value="weekend">عطلة أسبوعية 🏖️</option> : <option value="weekend">Weekend 🏖️</option>}`],
  ['<option value="absent">غائب</option>', `{lang === 'ar' ? <option value="absent">غائب</option> : <option value="absent">Absent</option>}`],
  ['<option value="on_leave">في إجازة</option>', `{lang === 'ar' ? <option value="on_leave">في إجازة</option> : <option value="on_leave">On Leave</option>}`],
  [/\<option value="2026-08">أغسطس 2026 \(الشهر الحالي\)<\/option>/g, `{lang === 'ar' ? <option value="2026-08">أغسطس 2026 (الشهر الحالي)</option> : <option value="2026-08">August 2026 (Current Month)</option>}`],
  [/\<option value="2026-07">يوليو 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-07">يوليو 2026</option> : <option value="2026-07">July 2026</option>}`],
  [/\<option value="2026-06">يونيو 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-06">يونيو 2026</option> : <option value="2026-06">June 2026</option>}`],
  [/\<option value="2026-05">مايو 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-05">مايو 2026</option> : <option value="2026-05">May 2026</option>}`],
  [/\<option value="2026-04">أبريل 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-04">أبريل 2026</option> : <option value="2026-04">April 2026</option>}`],
  [/\<option value="2026-03">مارس 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-03">مارس 2026</option> : <option value="2026-03">March 2026</option>}`],
  [/\<option value="2026-02">فبراير 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-02">فبراير 2026</option> : <option value="2026-02">February 2026</option>}`],
  [/\<option value="2026-01">يناير 2026<\/option>/g, `{lang === 'ar' ? <option value="2026-01">يناير 2026</option> : <option value="2026-01">January 2026</option>}`],
  [/<span>في استراحة:<\/span>/g, `<span>{lang === 'ar' ? 'في استراحة:' : 'On break:'}</span>`],
  [/title="إرجاع الموظف من الاستراحة"/g, `title={lang === 'ar' ? "إرجاع الموظف من الاستراحة" : "End break"}`],
  [/title="تعديل السجل"/g, `title={lang === 'ar' ? "تعديل السجل" : "Edit record"}`],
  [/title="حذف السجل"/g, `title={lang === 'ar' ? "حذف السجل" : "Delete record"}`],
  [/\(currentUser\?\.nameAr \|\| 'تيم ليدر'\)/g, `(currentUser?.[lang === 'ar' ? 'nameAr' : 'nameEn'] || (lang === 'ar' ? 'تيم ليدر' : 'Team Leader'))`],
  [/\(formExcusedReason \|\| 'إعفاء إداري من التيم ليدر'\)/g, `(formExcusedReason || (lang === 'ar' ? 'إعفاء إداري من التيم ليدر' : 'Admin Excuse'))`],
]);

replaceInFile('src/components/NotificationsPage.tsx', [
  [/'طلب إجازة جديد'/g, "lang === 'ar' ? 'طلب إجازة جديد' : 'New Leave Request'"],
  [/'تم قبول الإجازة'/g, "lang === 'ar' ? 'تم قبول الإجازة' : 'Leave Approved'"],
  [/'تم رفض الإجازة'/g, "lang === 'ar' ? 'تم رفض الإجازة' : 'Leave Rejected'"],
  [/'طلب عمل إضافي جديد'/g, "lang === 'ar' ? 'طلب عمل إضافي جديد' : 'New Overtime Request'"],
  [/'تم اعتماد العمل الإضافي'/g, "lang === 'ar' ? 'تم اعتماد العمل الإضافي' : 'Overtime Approved'"],
  [/'تم رفض العمل الإضافي'/g, "lang === 'ar' ? 'تم رفض العمل الإضافي' : 'Overtime Rejected'"],
  [/'تم تغيير الشفت'/g, "lang === 'ar' ? 'تم تغيير الشفت' : 'Shift Changed'"],
  [/'طلب تبديل شفت جديد'/g, "lang === 'ar' ? 'طلب تبديل شفت جديد' : 'New Shift Swap Request'"],
  [/'تمت الموافقة على تبديل الشفت'/g, "lang === 'ar' ? 'تمت الموافقة على تبديل الشفت' : 'Shift Swap Accepted'"],
  [/'تم رفض تبديل الشفت'/g, "lang === 'ar' ? 'تم رفض تبديل الشفت' : 'Shift Swap Rejected'"],
  [/'إشعار إداري'/g, "lang === 'ar' ? 'إشعار إداري' : 'Admin Notice'"],
  [/'إشعار جديد'/g, "lang === 'ar' ? 'إشعار جديد' : 'New Notification'"],
  [/\`تمت الموافقة على طلب تبديل الشفت ليوم \$\{request\.date\}\. الطلب الآن جاهز للمراجعة\.\`/g, "lang === 'ar' ? `تمت الموافقة على طلب تبديل الشفت ليوم ${request.date}. الطلب الآن جاهز للمراجعة.` : `Shift swap for ${request.date} accepted. Ready for review.`"]
]);

replaceInFile('src/components/UrgentNoticeModal.tsx', [
  [/'الإدارة \/ Team Leader'/g, "lang === 'ar' ? 'الإدارة / Team Leader' : 'Admin / Team Leader'"],
  [/'أمر عاجل وتنبيه هام'/g, "lang === 'ar' ? 'أمر عاجل وتنبيه هام' : 'Urgent Notice'"],
  [/'أمر عاجل وتنبيه هام لجميع الموظفين'/g, "lang === 'ar' ? 'أمر عاجل وتنبيه هام لجميع الموظفين' : 'Urgent Notice to all staff'"],
  [/'يظهر التنبيه لجميع الموظفين في الصفحة الرئيسية\.'/g, "lang === 'ar' ? 'يظهر التنبيه لجميع الموظفين في الصفحة الرئيسية.' : 'Notice appears for all employees on the dashboard.'"],
  [/'تنبيه هام جداً بخصوص الالتزام بمواعيد العمل'/g, "lang === 'ar' ? 'تنبيه هام جداً بخصوص الالتزام بمواعيد العمل' : 'Important Notice regarding attendance'"],
  [/'برجاء من جميع الموظفين الالتزام التام بالبصمة في تمام الساعة 09:00 صباحاً وعدم التأخير لتجنب تطبيق الجزاءات الآلية وفق لائحة العمل\.'/g, "lang === 'ar' ? 'برجاء من جميع الموظفين الالتزام التام بالبصمة في تمام الساعة 09:00 صباحاً وعدم التأخير لتجنب تطبيق الجزاءات الآلية وفق لائحة العمل.' : 'Please ensure to punch in exactly at 09:00 AM.'"],
  [/الالتزام بالمواعيد/g, "{lang === 'ar' ? 'الالتزام بالمواعيد' : 'Attendance'}"],
  [/'أمر عاجل بخصوص تسليم التخارير الأسبوعية'/g, "lang === 'ar' ? 'أمر عاجل بخصوص تسليم التقارير الأسبوعية' : 'Urgent notice regarding reports'"],
  [/'يرجى من جميع موظفي الأقسام إنهاء وتسليم التقارير المطلوبة قبل نهاية الدوام اليوم بدون تأخير\.'/g, "lang === 'ar' ? 'يرجى من جميع موظفي الأقسام إنهاء وتسليم التقارير المطلوبة قبل نهاية الدوام اليوم بدون تأخير.' : 'Please finish and deliver required reports before end of shift.'"],
  [/تسليم التقارير/g, "{lang === 'ar' ? 'تسليم التقارير' : 'Submit Reports'}"],
  [/'اجتماع طارئ لجميع فريق العمل'/g, "lang === 'ar' ? 'اجتماع طارئ لجميع فريق العمل' : 'Urgent team meeting'"],
  [/'يرجى حضور جميع الموظفين اجتماع عاجل اليوم في تمام الساعة 02:00 مساءً لمناقشة خطة العمل\.'/g, "lang === 'ar' ? 'يرجى حضور جميع الموظفين اجتماع عاجل اليوم في تمام الساعة 02:00 مساءً لمناقشة خطة العمل.' : 'Please attend the urgent team meeting today at 02:00 PM.'"],
  [/اجتماع طارئ/g, "{lang === 'ar' ? 'اجتماع طارئ' : 'Urgent Meeting'}"]
]);

replaceInFile('src/components/AvatarModal.tsx', [
  [/'تيم ليدر'/g, "lang === 'ar' ? 'تيم ليدر' : 'Team Leader'"]
]);

