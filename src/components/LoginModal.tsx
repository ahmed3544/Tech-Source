import React, { useState } from 'react';
import { 
  Lock, 
  UserCheck, 
  KeyRound, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight,
  Eye,
  EyeOff,
  Shield
} from 'lucide-react';
import { Employee, Language } from '../types';
import { TechSourceLogo } from './TechSourceLogo';
import { CompanySocialBar } from './CompanySocialBar';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onLoginSuccess: (emp: Employee, pin?: string) => void;
  /** Informational banner (e.g. "session expired, please sign in again"). */
  notice?: string;
  lang: Language;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  employees,
  onLoginSuccess,
  notice,
  lang,
}) => {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const toWesternDigits = (str: string) => {
      return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    };
    
    const rawInput = toWesternDigits(code).trim();
    const cleanPass = toWesternDigits(password).trim();
    
    if (!rawInput || !cleanPass) {
      setError(lang === 'ar' ? 'الرجاء إدخال جميع البيانات' : 'Please enter all fields');
      setLoading(false);
      return;
    }
    


    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ code: rawInput, password: cleanPass }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.employee) {
        // Keep the typed credential for signing later mutating requests
        // (the server-side permission guard re-validates it on every call).
        // sessionStorage is tab-scoped and cleared when the tab closes.
        try { sessionStorage.setItem('auth_pin', cleanPass); } catch {}
        // The typed pin is also handed to the app so it can be persisted with
        // the session: on mobile the WebView is restarted constantly, and a
        // restored session without the credential failed every mutation with
        // "Authentication required. Please sign in again." (401 loop).
        setLoading(false);
        onLoginSuccess(data.employee, cleanPass);
      } else {
        setError(
          data.error === 'ACCOUNT_INACTIVE'
            ? (lang === 'ar' ? 'هذا الحساب غير مفعّل. يرجى التواصل مع الإدارة لتفعيله.' : 'This account is inactive. Please contact management to activate it.')
            : data.error === 'LOGIN_SERVER_ERROR'
              ? (lang === 'ar' ? 'حدث خطأ في الخادم أثناء تسجيل الدخول. حاول مرة أخرى بعد قليل.' : 'The login server encountered an error. Please try again.')
              : (lang === 'ar' ? 'بيانات الدخول غير صحيحة. تأكد من الكود وكلمة المرور.' : 'Invalid employee code or password.')
        );
        setLoading(false);
      }
    } catch (err) {
      console.error('Login error', err);
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? (lang === 'ar' ? 'الخادم لم يستجب خلال 12 ثانية. جرّب مرة أخرى، وإذا تكرر الأمر فالمشكلة تحتاج فحص الخادم.' : 'The server did not respond within 12 seconds. Please try again.')
          : (lang === 'ar' ? 'تعذر الاتصال بخادم تسجيل الدخول. تحقق من الاتصال وحاول مرة أخرى.' : 'Could not reach the login server. Check the connection and try again.')
      );
      setLoading(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85  animate-fade-in">
      <div className="bg-white text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
        
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-6 text-center border-b border-slate-200 bg-slate-50 relative dark:border-slate-800/80 dark:bg-slate-900/60">
          <div className="flex justify-center mb-4">
            <TechSourceLogo size="lg" showSubtitle={true} />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center justify-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>{lang === 'ar' ? 'تسجيل الدخول الآمن' : 'Secure Login'}</span>
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {lang === 'ar' ? 'أدخل كود الموظف وكلمة المرور الخاصة بك للوصول إلى النظام' : 'Enter your employee code & password to access your account'}
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {notice && (
            <div className="p-3.5 rounded-xl bg-blue-500/15 text-blue-200 font-bold text-xs flex items-center gap-2.5 border border-blue-400/30">
              <AlertCircle className="w-4 h-4 shrink-0 text-blue-300" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-600 text-white font-bold text-xs flex items-center gap-2.5 animate-shake shadow-md border border-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-white" />
              <span>{error}</span>
            </div>
          )}

          {/* Employee Code Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {lang === 'ar' ? 'كود الموظف' : 'Employee Code'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="username"
                placeholder={lang === 'ar' ? 'أدخل كود الموظف الخاص بك' : 'Enter your employee code'}
                className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-4 py-3 pl-10 text-sm font-mono placeholder:font-sans placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition dark:bg-slate-950 dark:text-white dark:border-slate-700/80"
              />
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          {/* Password / PIN Input with Visibility Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {lang === 'ar' ? 'كلمة المرور / الرمز السري' : 'Password / PIN'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={lang === 'ar' ? 'أدخل كلمة المرور الخاصة بك' : 'Enter your password'}
                className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-10 py-3 text-sm font-mono caret-slate-900 focus:outline-none focus:border-emerald-500 transition dark:bg-slate-950 dark:text-white dark:caret-white dark:border-slate-700/80"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition focus:outline-none"
                title={showPassword ? (lang === 'ar' ? 'إخفاء كلمة المرور' : 'Hide password') : (lang === 'ar' ? 'إظهار كلمة المرور' : 'Show password')}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Privacy & Security Note */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 dark:bg-slate-950/60 dark:border-slate-800 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {lang === 'ar' 
                ? 'تسجيل دخول مشفّر وخاص بالكامل يحمي بياناتك وحسابك' 
                : 'Fully encrypted and private login protecting your credentials'}
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white font-bold text-sm shadow-lg border border-blue-900/50 hover:border-emerald-500/50 transition flex items-center justify-center gap-2 group mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4 text-emerald-400" />
                <span>{lang === 'ar' ? 'دخول الحساب' : 'Login'}</span>
                <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition" />
              </>
            )}
          </button>
          {/* Social Links & Official Channels */}
          <CompanySocialBar lang={lang} variant="modal" />
        </form>

        {/* Modal Footer Credit */}
        <div className="p-3 bg-slate-100 text-center border-t border-slate-200 text-[11px] text-slate-600 flex flex-col items-center justify-center gap-0.5 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400">
          <div className="font-semibold text-slate-700 dark:text-slate-300" dir="ltr">TECH SOURCE - GDS Global Development</div>
          <div className="text-[10px] text-slate-500 font-mono">by/Ahmed Mahmoud</div>
        </div>

      </div>
    </div>
  );
};

