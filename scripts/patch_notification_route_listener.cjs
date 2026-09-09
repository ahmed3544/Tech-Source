const fs=require('fs');
const path='src/App.tsx';
if(!fs.existsSync(path))process.exit(0);
let code=fs.readFileSync(path,'utf8');
const marker='/* TECH_SOURCE_NOTIFICATION_ROUTE_LISTENER_V1 */';
if(code.includes(marker))process.exit(0);
const anchor=`  const [searchTerm, setSearchTerm] = useState('');`;
if(!code.includes(anchor)){console.warn('[patch_notification_route_listener] anchor not found');process.exit(0);}
const block=`${anchor}\n\n  ${marker}\n  useEffect(() => {\n    const handler = (event: Event) => {\n      const notification = (event as CustomEvent).detail || {};\n      const type = String(notification.type || '');\n      const relatedId = String(notification.relatedLeaveId || notification.relatedOvertimeId || notification.relatedShiftSwapId || '').trim();\n      if (type.startsWith('leave_')) {\n        setActiveTab('leaves');\n        if (relatedId) setSearchTerm(relatedId);\n      } else if (type.startsWith('overtime_')) {\n        setActiveTab('leaves');\n        if (relatedId) setSearchTerm(relatedId);\n      } else if (type.startsWith('shift_')) {\n        setActiveTab('schedule');\n      } else {\n        setActiveTab('notifications');\n      }\n    };\n    window.addEventListener('techsource:navigate-notification', handler);\n    return () => window.removeEventListener('techsource:navigate-notification', handler);\n  }, []);`;
code=code.replace(anchor,block);
fs.writeFileSync(path,code,'utf8');
console.log('[patch_notification_route_listener] applied');
