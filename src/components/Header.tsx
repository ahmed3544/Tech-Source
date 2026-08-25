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
  X
} from 'lucide-react';

import { Employee, Language, AttendanceRecord, LeaveRequest } from '../types';
import { TechSourceLogo } from './TechSourceLogo';
import { UserAvatar } from './UserAvatar';
import {
  formatTime,
  formatDate,
  getFirstTwoNames,
  getTodayString
} from '../utils/helpers';
import { AvatarModal } from './AvatarModal';

interface HeaderProps {
  activeTab:
    | 'dashboard'
    | 'kiosk'
    | 'attendance'
    | 'employees'
    | 'leaves'
    | 'import_leaves'
    | 'analytics'
    | 'portal';

  setActiveTab: (
    tab:
      | 'dashboard'
      | 'kiosk'
      | 'attendance'
      | 'employees'
      | 'leaves'
      | 'import_leaves'
      | 'analytics'
      | 'portal'
  ) => void;

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
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  searchTerm,
  setSearchTerm,
  pendingLeavesCount,
  companyNameAr,
  companyNameEn,
  onOpenRulesModal,
  onOpenNoticeModal,
  currentUser,
  onOpenLoginModal,
  onLogout,
  onUpdateEmployee,
  employees = [],
  attendanceRecords = [],
  leaveRequests = [],
}) => {
  const [now, setNow] = useState<Date>(new Date());
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const timeStr = formatTime(now, lang);
  const dateStr = formatDate(now.toISOString(), lang);

  const isLeader = currentUser?.role === 'leader' || !currentUser;

  const matchingEmployees = React.useMemo(() => {
    if (!searchTerm.trim() || !employees.length) {
      return [];
    }

    const q = searchTerm.trim().toLowerCase();

    return employees.filter(e =>
      (e.nameAr && e.nameAr.toLowerCase().includes(q)) ||
      (e.nameEn && e.nameEn.toLowerCase().includes(q)) ||
      (e.code && e.code.toLowerCase().includes(q)) ||
      (e.department && e.department.toLowerCase().includes(q)) ||
      (e.jobTitleAr && e.jobTitleAr.toLowerCase().includes(q))
    );
  }, [searchTerm, employees]);

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">

      {/* =========================
          Top Main Bar
      ========================== */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[72px] py-2 flex items-center justify-between gap-4">

        {/* Unified Logo */}
        <div className="flex items-center gap-3">
          <TechSourceLogo size="md" showSubtitle={true} />
        </div>

        {/* =========================
            Global Search - Leader Only
        ========================== */}
        {isLeader && (
          <div className="hidden md:block relative flex-1 max-w-sm">

            <div className="relative flex items-center">

              <Search
                className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  lang === 'ar'
                    ? 'بحث عن موظف، كود، قسم...'
                    : 'Search employee, code...'
                }
                className="w-full bg-slate-800/80 text-slate-100 text-xs pr-9 pl-8 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-500 font-sans"
              />

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Search Live Dropdown */}
            {searchTerm.trim().length > 0 && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl z-50 overflow-hidden text-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">

                <div className="p-3 bg-slate-800/90 border-b border-slate-700/70 flex items-center justify-between">

                  <span className="text-xs font-bold text-slate-200">
                    {lang === 'ar'
                      ? `نتائج البحث (${matchingEmployees.length})`
                      : `Search Results (${matchingEmployees.length})`}
                  </span>

                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-slate-400 hover:text-white text-xs font-bold px-2 py-0.5 rounded hover:bg-slate-700"
                  >
                    {lang === 'ar' ? 'إغلاق ✕' : 'Close ✕'}
                  </button>

                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">

                  {matchingEmployees.length > 0 ? (

                    matchingEmployees.slice(0, 8).map(emp => {

                      const today = getTodayString();

                      const todayRec = attendanceRecords.find(
                        r =>
                          r.employeeId === emp.id &&
                          r.date === today
                      );

                      const isOnLeave = leaveRequests.some(
                        l =>
                          l.employeeId === emp.id &&
                          l.status === 'approved' &&
                          today >= l.startDate &&
                          today <= l.endDate
                      );

                      let statusBadge = (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          {lang === 'ar' ? 'غائب' : 'Absent'}
                        </span>
                      );

                      if (isOnLeave) {

                        statusBadge = (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800">
                            {lang === 'ar'
                              ? 'إجازة معتمدة'
                              : 'On Leave'}
                          </span>
                        );

                      } else if (todayRec?.checkIn) {

                        if (todayRec.breakStart && !todayRec.breakEnd) {

                          statusBadge = (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                              {lang === 'ar'
                                ? 'في استراحة'
                                : 'On Break'}
                            </span>
                          );

                        } else {

                          statusBadge = (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                              {lang === 'ar'
                                ? `حاضر (${todayRec.checkIn})`
                                : `Present (${todayRec.checkIn})`}
                            </span>
                          );

                        }
                      }

                      return (
                        <div
                          key={emp.id}
                          className="p-3 hover:bg-slate-800/80 transition flex items-center justify-between gap-3"
                        >

                          <div className="flex items-center gap-2.5 min-w-0">

                            <UserAvatar
                              name={emp.nameEn || emp.nameAr}
                              code={emp.code}
                              avatar={emp.avatar}
                              size="sm"
                            />

                            <div className="min-w-0">

                              <div className="flex items-center gap-1.5">

                                <p className="text-xs font-bold text-white truncate">
                                  {lang === 'ar'
                                    ? emp.nameAr
                                    : emp.nameEn}
                                </p>

                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                                  #{emp.code}
                                </span>

                              </div>

                              <p className="text-[11px] text-slate-400 truncate">
                                {emp.department} •{' '}
                                {lang === 'ar'
                                  ? (
                                    emp.jobTitleAr ||
                                    emp.jobTitleEn ||
                                    ''
                                  )
                                  : (
                                    emp.jobTitleEn ||
                                    emp.jobTitleAr ||
                                    ''
                                  )}
                              </p>

                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">

                            {statusBadge}

                            <div className="flex items-center gap-1">

                              <button
                                onClick={() => {
                                  setActiveTab('employees');
                                  setSearchTerm(emp.nameAr);
                                }}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded-md transition"
                              >
                                {lang === 'ar' ? 'عرض' : 'View'}
                              </button>

                              <button
                                onClick={() => {
                                  setActiveTab('analytics');
                                  setSearchTerm(emp.nameAr);
                                }}
                                className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold px-2 py-1 rounded-md transition"
                              >
                                {lang === 'ar' ? 'التقرير' : 'Report'}
                              </button>

                            </div>

                          </div>

                        </div>
                      );
                    })

                  ) : (

                    <div className="p-6 text-center text-xs text-slate-400 font-medium">
                      {lang === 'ar'
                        ? 'لا توجد نتائج مطابقة لمصطلح البحث'
                        : 'No matching employees found'}
                    </div>

                  )}

                </div>
              </div>
            )}

          </div>
        )}

        {/* =========================
            Right Section
        ========================== */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Language Switcher */}
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold transition shadow-xs"
            title={
              lang === 'ar'
                ? 'Switch to English'
                : 'التحويل للغة العربية'
            }
          >
            <Globe className="w-4 h-4 text-sky-400" />

            <span className="font-sans text-[11px] font-extrabold uppercase tracking-wide">
              {lang === 'ar' ? 'English' : 'عربي'}
            </span>
          </button>

          {/* Company Rules */}
          <button
            onClick={onOpenRulesModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition shadow-xs"
            title={
              lang === 'ar'
                ? 'عرض لائحة العمل والجزاءات المعتمدة (قانون العمل 2025)'
                : 'Company Work Regulations'
            }
          >
            <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0" />

            <span className="whitespace-nowrap hidden sm:inline">
              {lang === 'ar'
                ? 'لائحة الشركة'
                : 'Company Rules'}
            </span>
          </button>

          {/* Urgent Announcement */}
          {isLeader && onOpenNoticeModal && (
            <button
              onClick={onOpenNoticeModal}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition shadow-xs animate-pulse"
              title={
                lang === 'ar'
                  ? 'نشر وإدارة التنبيهات والأوامر العاجلة للموظفين'
                  : 'Manage Urgent Notices'
              }
            >
              <Megaphone className="w-3.5 h-3.5 text-rose-400 shrink-0" />

              <span className="whitespace-nowrap hidden sm:inline">
                {lang === 'ar'
                  ? 'تنبيه عاجل'
                  : 'Urgent Notice'}
              </span>
            </button>
          )}

          {/* Live Digital Clock */}
          <div className="hidden lg:flex items-center gap-2.5 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">

            <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />

            <div className="text-right">

              <div className="text-xs font-mono font-bold text-white tracking-wider">
                {timeStr}
              </div>

              <div className="text-[10px] text-slate-400">
                {dateStr}
              </div>

            </div>

          </div>

          {/* =========================
              User Status
          ========================== */}
          {currentUser ? (

            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1">

              {/* Avatar */}
              <button
                type="button"
                onClick={() => setShowAvatarModal(true)}
                className="relative group cursor-pointer"
                title={
                  lang === 'ar'
                    ? 'تغيير صورة البروفايل'
                    : 'Change profile photo'
                }
              >

                <UserAvatar
                  name={currentUser.nameEn || currentUser.nameAr}
                  code={currentUser.code}
                  avatar={currentUser.avatar}
                  size="xs"
                />

                <div className="absolute inset-0 rounded-full bg-slate-950/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">

                  <Camera className="w-3 h-3 text-emerald-400" />

                </div>

              </button>

              <div
                className="hidden sm:block text-right cursor-pointer"
                onClick={() => setShowAvatarModal(true)}
                title={
                  lang === 'ar'
                    ? 'تغيير صورة البروفايل'
                    : 'Change profile photo'
                }
              >

                <div
                  className="text-xs font-bold text-white whitespace-nowrap"
                  title={
                    lang === 'ar'
                      ? currentUser.nameAr
                      : currentUser.nameEn
                  }
                >
                  {getFirstTwoNames(
                    lang === 'ar'
                      ? currentUser.nameAr
                      : currentUser.nameEn
                  )}
                </div>

                <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 justify-end">

                  <span>
                    {currentUser.role === 'leader'
                      ? 'TL'
                      : (
                        lang === 'ar'
                          ? 'حساب موظف'
                          : 'Employee Account'
                      )}
                  </span>

                  <Camera className="w-2.5 h-2.5 text-slate-400 hover:text-emerald-400" />

                </div>

              </div>

              {/* Logout */}
              <button
                onClick={onLogout}
                className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 transition mr-1"
                title={
                  lang === 'ar'
                    ? 'تسجيل الخروج'
                    : 'Logout'
                }
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>

            </div>

          ) : (

            <button
              onClick={onOpenLoginModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white border border-blue-900 text-xs font-bold transition shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-400" />

              <span>
                {lang === 'ar'
                  ? 'تسجيل الدخول'
                  : 'Login'}
              </span>
            </button>

          )}

          {/* Notifications */}
          {isLeader && pendingLeavesCount > 0 && (
            <button
              onClick={() => setActiveTab('leaves')}
              className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title={`${pendingLeavesCount} طلبات معلقة`}
            >
              <Bell className="w-4 h-4 text-amber-400" />

              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full flex items-center justify-center animate-bounce font-mono">
                {pendingLeavesCount}
              </span>
            </button>
          )}

        </div>
      </div>

      {/* =========================
          Navigation Sub-bar
      ========================== */}
      <nav className="bg-slate-950/80 border-t border-slate-800/80 px-4 sm:px-6">

        <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto py-1.5 scrollbar-none">

          {/* LEADER NAVIGATION */}
          {isLeader ? (

            <>

              {/* Dashboard */}
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                <span>
                  {lang === 'ar'
                    ? 'لوحة التحكم'
                    : 'Dashboard'}
                </span>
              </button>

              {/* Kiosk */}
              <button
                onClick={() => setActiveTab('kiosk')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'kiosk'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <QrCode className="w-4 h-4 text-teal-400" />
                <span>
                  {lang === 'ar'
                    ? 'تسجيل الحضور'
                    : 'Kiosk Punch'}
                </span>
              </button>

              {/* Attendance */}
              <button
                onClick={() => setActiveTab('attendance')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'attendance'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <CalendarCheck className="w-4 h-4 text-blue-400" />
                <span>
                  {lang === 'ar'
                    ? 'سجل اليوم'
                    : 'Attendance Logs'}
                </span>
              </button>

              {/* Employees */}
              <button
                onClick={() => setActiveTab('employees')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'employees'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-400" />
                <span>
                  {lang === 'ar'
                    ? 'الموظفين'
                    : 'Employees'}
                </span>
              </button>

              {/* Requests */}
              <button
                onClick={() => setActiveTab('leaves')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap relative ${
                  activeTab === 'leaves'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <UserCheck className="w-4 h-4 text-purple-400" />

                <span>
                  {lang === 'ar'
                    ? 'الطلبات'
                    : 'Requests'}
                </span>

                {pendingLeavesCount > 0 && (
                  <span className="bg-amber-500 text-slate-950 font-bold text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                    {pendingLeavesCount}
                  </span>
                )}
              </button>

              {/* Employee Portal */}
              <button
                onClick={() => setActiveTab('portal')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'portal'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <User className="w-4 h-4 text-emerald-400" />

                <span>
                  {lang === 'ar'
                    ? 'حساب الموظف'
                    : 'Employee Portal'}
                </span>
              </button>

              {/* Reports */}
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'analytics'
                    ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-amber-400" />

                <span>
                  {lang === 'ar'
                    ? 'التقارير'
                    : 'Reports'}
                </span>
              </button>

            </>

          ) : (

            /* EMPLOYEE ONLY NAVIGATION */
            <button
              onClick={() => setActiveTab('portal')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'portal'
                  ? 'bg-[#0d2240] text-white font-bold border border-blue-900 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
              }`}
            >
              <User className="w-4 h-4 text-emerald-400" />

              <span>
                {lang === 'ar'
                  ? 'لوحة الموظف'
                  : 'My Account Dashboard'}
              </span>
            </button>

          )}

        </div>
      </nav>

      {/* =========================
          Avatar Modal
      ========================== */}
      {currentUser && (
        <AvatarModal
          isOpen={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
          employee={currentUser}
          onSaveAvatar={(newUrl) => {
            if (onUpdateEmployee) {
              onUpdateEmployee({
                ...currentUser,
                avatar: newUrl,
                _isPhotoRemoved: newUrl === '',
              });
            }
          }}
          lang={lang}
        />
      )}

    </header>
  );
};