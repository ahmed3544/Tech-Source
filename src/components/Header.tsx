import React, { useState, useEffect } from 'react';
import {
  Clock,
  LayoutDashboard,
  QrCode,
  Users,
  CalendarCheck,
  BarChart3,
  UserCheck,
  Globe,
  Bell,
  Search,
  User,
  LogOut,
  LogIn,
  Scale,
  Camera,
  Megaphone,
  Moon,
  Sun,
  ChevronDown,
  X
} from 'lucide-react';

import { Employee, Language, AttendanceRecord, LeaveRequest, Notification, NotificationType } from '../types';
import { TechSourceLogo } from './TechSourceLogo';
import { UserAvatar } from './UserAvatar';
import { NotificationCenter } from './NotificationCenter';
import {
  formatTime,
  formatDate,
  getFirstTwoNames,
  getTodayString
} from '../utils/helpers';
import { AvatarModal } from './AvatarModal';

interface HeaderProps {
  activeTab: 'dashboard' | 'kiosk' | 'attendance' | 'employees' | 'leaves' | 'import_leaves' | 'analytics' | 'schedule' | 'notifications' | 'portal';
  setActiveTab: (tab: 'dashboard' | 'kiosk' | 'attendance' | 'employees' | 'leaves' | 'import_leaves' | 'analytics' | 'schedule' | 'notifications' | 'portal') => void;
  lang: Language;
  setLang: (lang: Language) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  pendingLeavesCount: number;
  companyNameAr: string;
  companyNameEn: string;
  onOpenRulesModal: () => void;
  onOpenNoticeModal?: () => void;
  currentUser: Employee | null;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  onUpdateEmployee?: (emp: Employee) => void;
  employees?: Employee[];
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  notifications?: Notification[];
  currentUserId?: string;
  onMarkNotificationAsRead?: (notificationId: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onOpenNotificationsPage?: () => void;
}

export const Header: React.FC<HeaderProps> = (props) => {
  const {
    activeTab, setActiveTab, lang, setLang, searchTerm, setSearchTerm,
    pendingLeavesCount, companyNameAr, companyNameEn, onOpenRulesModal,
    onOpenNoticeModal, currentUser, onOpenLoginModal, onLogout,
    onUpdateEmployee, employees = [], attendanceRecords = [], leaveRequests = [],
    notifications = [], currentUserId, onMarkNotificationAsRead,
    onMarkAllNotificationsAsRead, onOpenNotificationsPage,
  } = props;
  const [now, setNow] = useState<Date>(new Date());
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  useEffect(() => { const savedTheme = localStorage.getItem('tech-source-theme'); const dark = savedTheme !== 'light'; setIsDarkMode(dark); document.documentElement.classList.toggle('dark', dark); }, []);
  const toggleDarkMode = () => { setIsDarkMode(prev => { const next = !prev; localStorage.setItem('tech-source-theme', next ? 'dark' : 'light'); document.documentElement.classList.toggle('dark', next); return next; }); };
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const timeStr = formatTime(now, lang);
  const dateStr = formatDate(now.toISOString(), lang);
  const isLeader = currentUser?.role === 'leader' || !currentUser;
  const matchingEmployees = React.useMemo(() => { if (!searchTerm.trim() || !employees.length) return []; const q = searchTerm.trim().toLowerCase(); return employees.filter(e => (e.nameAr && e.nameAr.toLowerCase().includes(q)) || (e.nameEn && e.nameEn.toLowerCase().includes(q)) || (e.code && e.code.toLowerCase().includes(q)) || (e.department && e.department.toLowerCase().includes(q)) || (e.jobTitleAr && e.jobTitleAr.toLowerCase().includes(q))); }, [searchTerm, employees]);

  return (
    <header dir={lang === 'ar' ? 'rtl' : 'ltr'} className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
      <div className="w-full max-w-full mx-auto px-3 sm:px-6 min-h-[60px] sm:min-h-[72px] py-2 flex items-center justify-between gap-2 sm:gap-4 overflow-visible">
        <div className="flex items-center gap-3"><TechSourceLogo size="md" showSubtitle={true} /></div>
        {isLeader && <div className="hidden md:block relative flex-1 max-w-sm"><div className="relative flex items-center"><Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /><input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder={lang === 'ar' ? 'بحث عن موظف، كود، قسم...' : 'Search employee, code...'} className="w-full bg-slate-800/80 text-slate-100 text-xs pr-9 pl-8 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-500 font-sans" />{searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white transition"><X className="w-3.5 h-3.5" /></button>}</div>{searchTerm.trim().length > 0 && <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl z-50 overflow-hidden text-slate-100 animate-in fade-in slide-in-from-top-2 duration-150"><div className="p-3 bg-slate-800/90 border-b border-slate-700/70 flex items-center justify-between"><span className="text-xs font-bold text-slate-200">{lang === 'ar' ? `نتائج البحث (${matchingEmployees.length})` : `Search Results (${matchingEmployees.length})`}</span><button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-white text-xs font-bold px-2 py-0.5 rounded hover:bg-slate-700">{lang === 'ar' ? 'إغلاق ✕' : 'Close ✕'}</button></div><div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">{matchingEmployees.length > 0 ? matchingEmployees.slice(0, 8).map(emp => { const today = getTodayString(); const todayRec = attendanceRecords.find(r => r.employeeId === emp.id && r.date === today); const isOnLeave = leaveRequests.some(l => l.employeeId === emp.id && l.status === 'approved' && today >= l.startDate && today <= l.endDate); let statusBadge = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">{lang === 'ar' ? 'غائب' : 'Absent'}</span>; if (isOnLeave) statusBadge = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800">{lang === 'ar' ? 'إجازة معتمدة' : 'On Leave'}</span>; else if (todayRec?.checkIn) statusBadge = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">{lang === 'ar' ? `حاضر (${todayRec.checkIn})` : `Present (${todayRec.checkIn})`}</span>; return <div key={emp.id} className="p-3 hover:bg-slate-800/80 transition flex items-center justify-between gap-3"><div className="flex items-center gap-2.5 min-w-0"><UserAvatar name={emp.nameEn || emp.nameAr} code={emp.code} avatar={emp.avatar} size="sm" /><div className="min-w-0"><div className="flex items-center gap-1.5"><p className="text-xs font-bold text-white truncate">{lang === 'ar' ? emp.nameAr : emp.nameEn}</p><span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">#{emp.code}</span></div><p className="text-[11px] text-slate-400 truncate">{emp.department} • {lang === 'ar' ? (emp.jobTitleAr || emp.jobTitleEn || '') : (emp.jobTitleEn || emp.jobTitleAr || '')}</p></div></div><div className="flex flex-col items-end gap-1.5 shrink-0">{statusBadge}<div className="flex items-center gap-1"><button onClick={() => { setActiveTab('employees'); setSearchTerm(emp.nameAr); }} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded-md transition">{lang === 'ar' ? 'عرض' : 'View'}</button><button onClick={() => { setActiveTab('analytics'); setSearchTerm(emp.nameAr); }} className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold px-2 py-1 rounded-md transition">{lang === 'ar' ? 'التقرير' : 'Report'}</button></div></div></div>; }) : <div className="p-6 text-center text-xs text-slate-400 font-medium">{lang === 'ar' ? 'لا توجد نتائج مطابقة لمصطلح البحث' : 'No matching employees found'}</div>}</div></div>}</div>}
        <div className="flex items-center gap-2 sm:gap-3"><div className="flex items-center justify-between gap-2 sm:gap-3 w-full min-w-0"><div className="flex items-center gap-2 min-w-0 shrink-0"><button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="h-9 min-w-9 flex items-center justify-center gap-1.5 px-2 sm:px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-100 border border-slate-700/70 text-xs font-bold transition shrink-0" title={lang === 'ar' ? 'Switch to English' : 'التحويل للغة العربية'}><Globe className="w-4 h-4 text-sky-400 shrink-0" /><span className="hidden sm:inline text-[11px] font-extrabold whitespace-nowrap">{lang === 'ar' ? 'English' : 'عربي'}</span></button><button onClick={onOpenRulesModal} className="hidden sm:flex h-9 items-center justify-center gap-1.5 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition shrink-0"><Scale className="w-3.5 h-3.5 text-amber-400" /><span className="whitespace-nowrap">{lang === 'ar' ? 'لائحة الشركة' : 'Company Rules'}</span></button>{isLeader && onOpenNoticeModal && <button onClick={onOpenNoticeModal} className="hidden md:flex h-9 items-center justify-center gap-1.5 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition shrink-0"><Megaphone className="w-3.5 h-3.5 text-rose-400" /><span className="whitespace-nowrap">{lang === 'ar' ? 'تنبيه عاجل' : 'Urgent Notice'}</span></button>}</div><div className="flex items-center gap-2 shrink-0">{isLeader && pendingLeavesCount > 0 && <button onClick={() => setActiveTab('leaves')} className="relative h-9 w-9 flex items-center justify-center rounded-lg bg-slate-800/70 hover:bg-slate-700 text-slate-300 transition shrink-0" title={`${pendingLeavesCount} طلبات معلقة`}><Bell className="w-4 h-4 text-amber-400" /><span className="absolute -top-1 -end-1 min-w-4 h-4 px-0.5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full flex items-center justify-center">{pendingLeavesCount}</span></button>}{currentUser ? <div className="relative shrink-0"><button type="button" onClick={() => setShowProfileMenu(v => !v)} className="h-9 flex items-center justify-center gap-1.5 rounded-lg px-1.5 sm:px-2 hover:bg-slate-800 transition"><UserAvatar name={currentUser.nameEn || currentUser.nameAr} code={currentUser.code} avatar={currentUser.avatar} size="sm" /><ChevronDown className="w-3.5 h-3.5 text-slate-400" /></button>{showProfileMenu && <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50"><button onClick={() => { setShowProfileMenu(false); setShowAvatarModal(true); }} className="w-full text-right px-3 py-2 rounded-lg hover:bg-slate-800 text-sm">{lang === 'ar' ? 'الصورة الشخصية' : 'Profile picture'}</button><button onClick={() => { setShowProfileMenu(false); toggleDarkMode(); }} className="w-full text-right px-3 py-2 rounded-lg hover:bg-slate-800 text-sm flex items-center gap-2">{isDarkMode ? <Sun size={16} /> : <Moon size={16} />}{isDarkMode ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light mode') : (lang === 'ar' ? 'الوضع الداكن' : 'Dark mode')}</button><button onClick={() => { setShowProfileMenu(false); onLogout(); }} className="w-full text-right px-3 py-2 rounded-lg hover:bg-slate-800 text-sm flex items-center gap-2"><LogOut size={16} />{lang === 'ar' ? 'تسجيل الخروج' : 'Logout'}</button></div>}</div> : <button onClick={onOpenLoginModal} className="h-9 flex items-center gap-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"><LogIn className="w-4 h-4" />{lang === 'ar' ? 'تسجيل الدخول' : 'Login'}</button>}</div></div></div>
      </div>
      <div className="border-t border-slate-800/70"><div className="w-full max-w-full mx-auto px-3 sm:px-6 h-10 flex items-center justify-between gap-3 overflow-x-auto"><nav className="flex items-center gap-1 shrink-0">{isLeader && <><button onClick={() => setActiveTab('dashboard')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><LayoutDashboard className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'الرئيسية' : 'Dashboard'}</button><button onClick={() => setActiveTab('kiosk')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'kiosk' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><QrCode className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'الحضور' : 'Attendance'}</button><button onClick={() => setActiveTab('employees')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'employees' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><Users className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'الموظفين' : 'Employees'}</button><button onClick={() => setActiveTab('leaves')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'leaves' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><CalendarCheck className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'الإجازات' : 'Leaves'}</button><button onClick={() => setActiveTab('schedule')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'schedule' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><Clock className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'الجدول' : 'Schedule'}</button><button onClick={() => setActiveTab('analytics')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'analytics' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><BarChart3 className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'التقارير' : 'Reports'}</button></>}{currentUser && !isLeader && <button onClick={() => setActiveTab('portal')} className={`px-2.5 py-1.5 rounded-md text-xs font-bold ${activeTab === 'portal' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}><UserCheck className="inline w-3.5 h-3.5 mr-1" />{lang === 'ar' ? 'بوابتي' : 'My Portal'}</button>}</nav><div className="flex items-center gap-1 shrink-0">{currentUser && <NotificationCenter notifications={notifications} currentUserId={currentUserId} lang={lang} onMarkAsRead={onMarkNotificationAsRead} onMarkAllAsRead={onMarkAllNotificationsAsRead} onOpenPage={onOpenNotificationsPage} />}</div></div></div>
      {showAvatarModal && currentUser && <AvatarModal employee={currentUser} onClose={() => setShowAvatarModal(false)} onSave={(avatar) => { if (onUpdateEmployee) onUpdateEmployee({ ...currentUser, avatar }); setShowAvatarModal(false); }} lang={lang} />}
    </header>
  );
};
