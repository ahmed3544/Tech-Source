import React, { useState } from 'react';
import { localizeBackendValue } from '../i18n';
import { 
  Users, 
  UserPlus, 
  Search, 
  Mail, 
  Phone, 
  Building2, 
  KeyRound, 
  Calendar, 
  X, 
  CheckCircle2, 
  Clock, 
  ShieldCheck,
  Edit2,
  Edit3,
  Trash2,
  FileText,
  LayoutList,
  LayoutGrid,
  FileSpreadsheet,
  Camera
} from 'lucide-react';
import { Employee, Shift, AttendanceRecord, LeaveRequest, Language } from '../types';
import { UserAvatar } from './UserAvatar';
import { getFirstTwoNames, getTodayString, getLeaveTypeLabel, calculateWorkDaysInPeriod } from '../utils/helpers';
import { AvatarModal } from './AvatarModal';

interface EmployeeManagerProps {
  employees: Employee[];
  shifts: Shift[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  onAddEmployee: (emp: Employee) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onDeleteEmployee: (empId: string) => void;
  lang: Language;
  onOpenImportModal?: () => void;
  globalSearchTerm?: string;
}

export const EmployeeManager: React.FC<EmployeeManagerProps> = ({
  employees,
  shifts,
  attendanceRecords,
  leaveRequests = [],
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  lang,
  onOpenImportModal,
  globalSearchTerm,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [viewEmpDetails, setViewEmpDetails] = useState<Employee | null>(null);

  // Add Form
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState(`EMP${String(employees.length + 1).padStart(3, '0')}`);
  const [department, setDepartment] = useState('CX');
  const [jobTitleAr, setJobTitleAr] = useState('');
  const [jobTitleEn, setJobTitleEn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('Tech_123');
  const [shiftId, setShiftId] = useState(shifts[0]?.id || 'shift-1');
  const [role, setRole] = useState<'employee' | 'leader'>('employee');
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState<number>(15);

  // Edit Form State
  const [editNameAr, setEditNameAr] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editJobTitleAr, setEditJobTitleAr] = useState('');
  const [editJobTitleEn, setEditJobTitleEn] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editShiftId, setEditShiftId] = useState('');
  const [editRole, setEditRole] = useState<'employee' | 'leader'>('employee');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAnnualLeaveBalance, setEditAnnualLeaveBalance] = useState<number>(15);
  const [editAvatar, setEditAvatar] = useState('');
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false);
  const [showAvatarModalForEdit, setShowAvatarModalForEdit] = useState(false);

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditNameAr(emp.nameAr);
    setEditNameEn(emp.nameEn);
    setEditCode(emp.code);
    setEditDepartment(emp.department);
    setEditJobTitleAr(emp.jobTitleAr);
    setEditJobTitleEn(emp.jobTitleEn);
    setEditPin(emp.pin);
    setEditShiftId(emp.shiftId || shifts[0]?.id || 'shift-1');
    setEditRole(emp.role || 'employee');
    setEditEmail(emp.email);
    setEditPhone(emp.phone);
    setEditAnnualLeaveBalance(emp.annualLeaveBalance ?? (emp.casualLeaveBalance ?? 7) + (emp.regularLeaveBalance ?? 8));
    setEditAvatar(emp.avatar || '');
    setIsPhotoRemoved(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !editNameAr) return;

    const finalAvatar = isPhotoRemoved
      ? ''
      : (editAvatar && editAvatar.trim() !== '' ? editAvatar : (editingEmployee.avatar || ''));

    const updated: Employee = {
      ...editingEmployee,
      nameAr: editNameAr,
      nameEn: editNameEn || editNameAr,
      code: editCode,
      department: editDepartment,
      jobTitleAr: editJobTitleAr || 'موظف',
      jobTitleEn: editJobTitleEn || 'Employee',
      pin: editPin,
      shiftId: editShiftId,
      role: editRole,
      email: editEmail,
      phone: editPhone,
      annualLeaveBalance: Number(editAnnualLeaveBalance) >= 0 ? Number(editAnnualLeaveBalance) : 15,
      avatar: finalAvatar,
      _isPhotoRemoved: isPhotoRemoved,
    };

    onUpdateEmployee(updated);
    setEditingEmployee(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr) return;

    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      code,
      nameAr,
      nameEn: nameEn || nameAr,
      avatar: '',
      email: email || `${code.toLowerCase()}@techsource-gds.com`,
      phone: phone || '+966 50 000 0000',
      department,
      jobTitleAr: jobTitleAr || 'موظف',
      jobTitleEn: jobTitleEn || 'Employee',
      shiftId,
      pin: pin || 'Tech_123',
      role,
      joinedDate: getTodayString(),
      status: 'active',
      annualLeaveBalance: Number(annualLeaveBalance) >= 0 ? Number(annualLeaveBalance) : 15,
    };

    onAddEmployee(newEmp);
    setShowAddModal(false);
    // Reset form
    setNameAr('');
    setNameEn('');
    setJobTitleAr('');
    setJobTitleEn('');
    setEmail('');
    setPhone('');
    setPin('Tech_123');
  };

  const activeSearch = globalSearchTerm !== undefined && globalSearchTerm !== '' ? globalSearchTerm : searchTerm;

  const filtered = employees.filter(emp => {
    const q = activeSearch.trim().toLowerCase();
    return (
      emp.nameAr.toLowerCase().includes(q) ||
      emp.nameEn.toLowerCase().includes(q) ||
      emp.code.toLowerCase().includes(q)
    ) && (selectedDept === 'all' || emp.department === selectedDept);
  });
