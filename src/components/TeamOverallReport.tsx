import React, { useState } from 'react';
import { Calendar, Download, TrendingUp, Users } from 'lucide-react';
import { Employee, AttendanceRecord, LeaveRequest, Language } from '../types';
import { getTodayString } from '../utils/helpers';

interface TeamOverallReportProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  lang: Language;
  teamLeaderId?: string;
  onExportToExcel?: () => void;
}

export const TeamOverallReport: React.FC<TeamOverallReportProps> = ({
  employees,
  attendanceRecords,
  leaveRequests,
  lang,
  teamLeaderId,
  onExportToExcel,
}) => {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(getTodayString());

  // Get team members
  const teamMembers = teamLeaderId
    ? employees.filter(e => e.teamLeaderId === teamLeaderId && e.role === 'employee')
    : employees.filter(e => e.role === 'employee');

  // Calculate daily stats
  const todayRecords = attendanceRecords.filter(r => r.date === selectedDate);
  const todayCheckedIn = todayRecords.filter(r => r.checkIn).length;
  const todayAbsent = teamMembers.length - todayCheckedIn;

  const todayOnLeave = leaveRequests.filter(
    l =>
      l.status === 'approved' &&
      selectedDate >= l.startDate &&
      selectedDate <= l.endDate
  ).length;

  // Calculate monthly stats (current month)
  const currentMonth = selectedDate.substring(0, 7); // YYYY-MM
  const monthRecords = attendanceRecords.filter(r => r.date.startsWith(currentMonth));
  const avgAttendance =
    teamMembers.length > 0
      ? Math.round(
          (monthRecords.filter(r => r.checkIn).length /
            (teamMembers.length * 20)) * // Assuming 20 working days
          100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {lang === 'ar' ? 'تقرير الفريق الشامل' : 'Team Overall Report'}
        </h2>
        {onExportToExcel && (
          <button
            onClick={onExportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-semibold"
          >
            <Download size={16} />
            {lang === 'ar' ? 'تصدير Excel' : 'Export to Excel'}
          </button>
        )}
      </div>

      {/* View Mode Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('daily')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            viewMode === 'daily'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {lang === 'ar' ? 'يومي' : 'Daily'}
        </button>
        <button
          onClick={() => setViewMode('monthly')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            viewMode === 'monthly'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {lang === 'ar' ? 'شهري' : 'Monthly'}
        </button>
      </div>

      {/* Date Picker */}
      {viewMode === 'daily' && (
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-gray-600" />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-semibold">
                {lang === 'ar' ? 'عدد الموظفين' : 'Total Employees'}
              </p>
              <p className="text-3xl font-bold text-blue-900 mt-2">{teamMembers.length}</p>
            </div>
            <Users className="w-10 h-10 text-blue-400" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-semibold">
                {lang === 'ar' ? (viewMode === 'daily' ? 'الحضور اليوم' : 'متوسط الحضور') : viewMode === 'daily' ? 'Today Checked In' : 'Avg Attendance'}
              </p>
              <p className="text-3xl font-bold text-green-900 mt-2">
                {viewMode === 'daily' ? todayCheckedIn : avgAttendance}
                {viewMode === 'monthly' && '%'}
              </p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-400" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-semibold">
                {lang === 'ar' ? 'الغياب' : 'Absent'}
              </p>
              <p className="text-3xl font-bold text-red-900 mt-2">{viewMode === 'daily' ? todayAbsent : '-'}</p>
            </div>
            <Users className="w-10 h-10 text-red-400" />
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-semibold">
                {lang === 'ar' ? 'إجازات معتمدة' : 'Approved Leaves'}
              </p>
              <p className="text-3xl font-bold text-yellow-900 mt-2">{viewMode === 'daily' ? todayOnLeave : '-'}</p>
            </div>
            <Calendar className="w-10 h-10 text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-700">
                  {lang === 'ar' ? 'الموظف' : 'Employee'}
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-700">
                  {lang === 'ar' ? 'الكود' : 'Code'}
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-700">
                  {lang === 'ar' ? 'القسم' : 'Department'}
                </th>
                <th className="px-6 py-3 text-left text-sm font-bold text-gray-700">
                  {lang === 'ar' ? 'الحالة' : 'Status'}
                </th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.slice(0, 10).map(emp => {
                const todayRec = todayRecords.find(r => r.employeeId === emp.id);
                const isOnLeave = leaveRequests.some(
                  l =>
                    l.employeeId === emp.id &&
                    l.status === 'approved' &&
                    selectedDate >= l.startDate &&
                    selectedDate <= l.endDate
                );

                let status = lang === 'ar' ? 'غائب' : 'Absent';
                let statusColor = 'bg-red-100 text-red-700';

                if (isOnLeave) {
                  status = lang === 'ar' ? 'إجازة' : 'On Leave';
                  statusColor = 'bg-yellow-100 text-yellow-700';
                } else if (todayRec?.checkIn) {
                  status = lang === 'ar' ? 'حاضر' : 'Present';
                  statusColor = 'bg-green-100 text-green-700';
                }

                return (
                  <tr key={emp.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                      {lang === 'ar' ? emp.nameAr : emp.nameEn}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{emp.code}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">{emp.department}</td>
                    <td className="px-6 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
