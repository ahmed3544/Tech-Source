# 🚀 Quick Start Guide - New Features

## Notifications System

### How Notifications Work
1. **Automatic:** Notifications are auto-created when:
   - Leave request is approved
   - Leave request is rejected
   - Permission request is approved
   - Permission request is rejected

2. **Persistent:** All notifications are stored in:
   - Database: `notifications` table (Supabase)
   - Browser: localStorage (immediate load)

3. **Real-time Sync:** Changes sync between devices within 1-3 seconds

### How to Use Notifications

#### For Employees
1. **View Notifications:**
   - Click the Bell icon 🔔 in the header
   - See all notifications in the dropdown
   - Badge shows unread count (red)

2. **Mark as Read:**
   - Click on any notification to mark it as read
   - Click "Mark all read" button to mark all unread

#### For Developers
To create notifications programmatically:

```typescript
// In App.tsx, use the createNotification helper:
const notification = createNotification(
  employeeId,           // Who receives it
  'leave_approved',      // Type
  'إجازة معتمدة',       // Title
  'تمت الموافقة على إجازتك', // Message
  employeeId,           // Related employee
  leaveRequestId        // Related leave
);

// It's automatically added when handleUpdateLeaveStatus is called
```

---

## Shift Management

### How to Use Shift Manager

1. **Access Shift Manager:**
   - Import in your component:
   ```typescript
   import { ShiftManager } from './components/ShiftManager';
   ```

2. **Add to Your View:**
   ```typescript
   <ShiftManager
     shifts={shifts}
     lang={lang}
     onAddShift={handleAddShift}
     onUpdateShift={handleUpdateShift}
     onDeleteShift={handleDeleteShift}
   />
   ```

3. **Operations:**
   - **Create:** Click "Shift Baru / New Shift" button
   - **Edit:** Click edit icon on any shift card
   - **Delete:** Click delete icon and confirm

4. **Fields:**
   - Name (Arabic & English)
   - Start Time (HH:MM format)
   - End Time (HH:MM format)
   - Duration (minutes, auto-calculated)
   - Grace Period (minutes before marking late)

---

## Team Overall Report

### How to Use Team Report

1. **Access Report:**
   ```typescript
   import { TeamOverallReport } from './components/TeamOverallReport';
   ```

2. **Add to Your View:**
   ```typescript
   <TeamOverallReport
     employees={employees}
     attendanceRecords={attendanceRecords}
     leaveRequests={leaveRequests}
     lang={lang}
     teamLeaderId={currentUser?.id}
     onExportToExcel={handleExportToExcel}
   />
   ```

3. **View Modes:**
   - **Daily:** Select a date, see all team members' status for that day
   - **Monthly:** See average attendance for current month

4. **Statistics Cards:**
   - Total Employees
   - Today's Attendance / Monthly Average
   - Absent Count
   - Approved Leaves

5. **Export:**
   - Click "Export to Excel" button
   - Downloads team report with all selected data

---

## NotificationCenter Component

### Location
The NotificationCenter is already integrated in the Header component. It appears automatically when a user logs in.

### Features
- Bell icon with unread badge
- Dropdown list of recent notifications
- Click to mark individual as read
- "Mark all as read" button
- Bilingual (Arabic/English)
- Auto-filtered by current user

### Props (if using standalone)
```typescript
<NotificationCenter
  notifications={notifications}
  currentUserId={currentUser?.id}
  lang={lang}
  onMarkAsRead={handleMarkNotificationAsRead}
  onMarkAllAsRead={handleMarkAllNotificationsAsRead}
/>
```

---

## Export to Excel

### How to Export Team Report

```typescript
import { exportTeamReportToExcel } from './utils/helpers';

// Prepare your report data
const reportData = employees.map(emp => ({
  employeeName: emp.nameAr,
  code: emp.code,
  department: emp.department,
  status: 'Present', // or 'Absent', 'On Leave'
  workHours: 8,
  lateMinutes: 5,
  earlyLeaveMinutes: 0,
  notes: ''
}));

// Export
exportTeamReportToExcel(
  'Engineering Team',
  reportData,
  'team_report_engineering_2025.xlsx'
);
```

---

## State Management

### Notifications State in App.tsx
```typescript
// State
const [notifications, setNotifications] = useState<Notification[]>(...)

// Ref (for cross-render access)
const notificationsRef = useRef(notifications)

// Sync with server every 1500ms (automatic)
// Persist to localStorage (automatic)

// Handlers
handleMarkNotificationAsRead(notificationId)
handleMarkAllNotificationsAsRead()
```

### Adding to Header
```typescript
<Header
  // ... existing props
  notifications={notifications}
  currentUserId={currentUser?.id}
  onMarkNotificationAsRead={handleMarkNotificationAsRead}
  onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead}
/>
```

---

## Database Schema

### Notifications Table
```sql
CREATE TABLE notifications (
  id VARCHAR PRIMARY KEY,
  recipientId VARCHAR NOT NULL REFERENCES employees(id),
  type VARCHAR NOT NULL, -- leave_approved, leave_rejected, etc.
  title VARCHAR,
  message VARCHAR,
  relatedEmployeeId VARCHAR,
  relatedLeaveId VARCHAR,
  relatedOvertimeId VARCHAR,
  isRead BOOLEAN DEFAULT false,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### API Endpoints
```
GET  /api/notifications?userId=<id>           -- Fetch notifications
PUT  /api/notifications/:id/mark-read         -- Mark single as read
PUT  /api/notifications/mark-all-read         -- Mark all as read
POST /api/sync                                 -- Sync (includes notifications)
```

---

## Sync Architecture

### How Cross-Device Sync Works

1. **Device A** creates/updates notifications
2. **Device A** sends via `POST /api/sync` to server
3. **Server** stores in database
4. **Device B** polls every 1500ms via `GET /api/data`
5. **Device B** receives notifications in response
6. **Device B** updates local state and localStorage
7. **UI updates** automatically ✨

### Conflict Resolution
- If two changes happen simultaneously, **newer `updatedAt` wins**
- Timestamp format: ISO 8601 (e.g., `2025-01-22T15:30:45.123Z`)
- Each notification has `createdAt` (immutable) and `updatedAt` (mutable)

---

## Common Tasks

### How to Display Employee's Leave Status
```typescript
const emp = employees.find(e => e.id === employeeId);
const isOnLeave = leaveRequests.some(
  l => l.employeeId === employeeId &&
       l.status === 'approved' &&
       date >= l.startDate &&
       date <= l.endDate
);

return isOnLeave ? 'On Leave' : 'Present';
```

### How to Calculate Team Attendance %
```typescript
const teamMembers = employees.filter(e => e.teamLeaderId === teamLeaderId);
const presentToday = attendanceRecords.filter(
  r => r.date === today && r.checkIn
).length;

const percentage = (presentToday / teamMembers.length) * 100;
```

### How to Trigger Notification on Custom Event
```typescript
// In your handler:
const newNotif = createNotification(
  targetEmployeeId,
  'admin_notice',
  'Important Notice',
  'Your custom message here',
  undefined,
  undefined,
  undefined
);

const updated = [...notificationsRef.current, newNotif];
notificationsRef.current = updated;
setNotifications(updated);

void pushSync({ notifications: updated });
```

---

## Troubleshooting

### Notifications Not Showing
- [ ] User is logged in?
- [ ] Notifications state updated?
- [ ] Server endpoint `/api/notifications` working?
- [ ] Browser localStorage enabled?

### Notifications Not Syncing
- [ ] Internet connection active?
- [ ] /api/sync endpoint responding?
- [ ] No TypeScript errors in console?
- [ ] Check browser DevTools Network tab

### Shift Manager Not Opening
- [ ] Component imported correctly?
- [ ] Props passed correctly?
- [ ] `lang` prop set to 'ar' or 'en'?

---

## Next Steps

1. **Test in browser:** Click bell icon, see notifications
2. **Test on mobile:** Same URL, different device - see sync work
3. **Test export:** Run export, open Excel file
4. **Test shifts:** Create/edit/delete a shift
5. **Monitor console:** No errors = success! ✅

---

**All ready to go! Happy coding! 🎉**
