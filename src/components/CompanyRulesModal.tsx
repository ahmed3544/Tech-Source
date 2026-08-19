import React, { useState } from 'react';
import { 
  X, 
  ShieldAlert, 
  Clock, 
  Palmtree, 
  Scale, 
  CheckCircle2, 
  AlertTriangle,
  Building2,
  Award,
  HeartHandshake,
  DollarSign,
  Globe,
  Phone,
  Users,
  Briefcase,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { Language } from '../types';
import { COMPANY_CONTACTS } from './CompanySocialBar';

interface CompanyRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const CompanyRulesModal: React.FC<CompanyRulesModalProps> = ({
  isOpen,
  onClose,
  lang
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'companyInfo' | 'violations' | 'leaves' | 'general' | 'conduct'>('companyInfo');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-right">
        
        {/* Modal Header */}
        <div className="bg-[#0d2240] text-white p-4 sm:p-6 border-b border-blue-900 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 px-3 py-1.5 rounded-xl bg-white border border-slate-300 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
              <img 
                src="logo.png"
                alt="Tech Source GDS" 
                className="h-full w-auto object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-xl font-extrabold text-white whitespace-nowrap">
                  {lang === 'ar' ? 'معلومات وسياسات شركة Tech Source GDS' : 'Tech Source GDS Info & Policies'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 whitespace-nowrap">
                  {lang === 'ar' ? 'قانون العمل 14 / 2025' : 'Labor Law 14 / 2025'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 whitespace-nowrap truncate">
                {lang === 'ar' ? 'شركة تيك سورس لخدمات تطوير الأعمال العالمية (TECH SOURCE GDS)' : 'TECH SOURCE Global Business Development Services'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 p-2 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
          <button
            onClick={() => setActiveSubTab('companyInfo')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'companyInfo'
                ? 'bg-[#0d2240] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4 text-sky-400" />
            <span>{lang === 'ar' ? 'عن الشركة والمديرين' : 'About & Leadership'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('violations')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'violations'
                ? 'bg-[#0d2240] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>{lang === 'ar' ? 'جدول المخالفات والجزاءات' : 'Attendance Penalties'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('leaves')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'leaves'
                ? 'bg-[#0d2240] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Palmtree className="w-4 h-4 text-emerald-400" />
            <span>{lang === 'ar' ? 'الإجازات والمزايا والأجور' : 'Leaves & Benefits'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('conduct')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'conduct'
                ? 'bg-[#0d2240] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <HeartHandshake className="w-4 h-4 text-indigo-400" />
            <span>{lang === 'ar' ? 'السلوكيات والزي الرسمي' : 'Code of Conduct'}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('general')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeSubTab === 'general'
                ? 'bg-[#0d2240] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-rose-400" />
            <span>{lang === 'ar' ? 'الأخطاء الجسيمة والمبادئ' : 'Gross Misconduct'}</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-xs sm:text-sm">

          {/* TAB 0: COMPANY INFO & MANAGEMENT */}
          {activeSubTab === 'companyInfo' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Company Profile Header */}
              <div className="bg-gradient-to-r from-[#0d2240] via-[#163866] to-[#0d2240] text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-lg bg-sky-500/20 text-sky-300 font-extrabold text-xs border border-sky-400/30">
                        Global Business Development Services
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                      {lang === 'ar' ? 'شركة تيك سورس لتطوير الأعمال العالمية' : 'TECH SOURCE - GDS Global'}
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                      {lang === 'ar'
                        ? 'مؤسسة متخصصة رائدة في خدمات تطوير الأعمال العالمية، إدارة وتصميم تجربة العملاء (CX)، التسويق الإبداعي والتجارة الإلكترونية، وضبط الجودة والأنظمة الذكية.'
                        : 'Leading enterprise delivering global business development services, customer experience management (CX), creative marketing, e-commerce, and enterprise quality assurance.'}
                    </p>
                  </div>

                  {/* Contact Links Box */}
                  <div className="flex flex-col gap-2 shrink-0 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/15 text-xs">
                    <a
                      href={COMPANY_CONTACTS.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sky-300 hover:text-white transition font-mono"
                    >
                      <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>www.techsource-gds.com</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-75" />
                    </a>
                    <a
                      href={`tel:${COMPANY_CONTACTS.phone}`}
                      className="flex items-center gap-2 text-emerald-300 hover:text-white transition font-mono"
                    >
                      <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>01024749636</span>
                    </a>
                  </div>
                </div>
              </div>



              {/* Core Company Policy Summary */}
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-sky-950 font-extrabold text-sm sm:text-base">
                  <Briefcase className="w-5 h-5 text-sky-700 shrink-0" />
                  <span>{lang === 'ar' ? 'ملخص سياسة العمل العامة والتنظيم المؤسسي' : 'General Company Policy Overview'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-700">
                  <div className="bg-white p-3.5 rounded-xl border border-sky-100 space-y-1">
                    <strong className="text-slate-900 font-bold block text-sm">1. المواعيد والسماح</strong>
                    <p className="text-slate-600 leading-relaxed">
                      الوردية الصباحية تبدأ الساعة 09:00 AM. الحضور بعد 9:00 AM بدقيقة واحدة يُحسب "متأخر"، والتأخير بعد 10:00 AM (تجاوز ساعة كاملة) يُسجّل "غائب"، وقبل 9:00 AM يُسجّل "لم يحضر بعد".
                    </p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-sky-100 space-y-1">
                    <strong className="text-slate-900 font-bold block text-sm">2. الإجازات المعتمدة</strong>
                    <p className="text-slate-600 leading-relaxed">
                      يتم تسجيل الإجازات من قبل التيم ليدر والإدارة وتفعيل حظر الحضور التلقائي في أيام الإجازات المعتمدة.
                    </p>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-sky-100 space-y-1">
                    <strong className="text-slate-900 font-bold block text-sm">3. السرية وجودة العمل</strong>
                    <p className="text-slate-600 leading-relaxed">
                      حماية سرية البيانات (NDA) والالتزام بأعلى معايير الأداء والجودة وقانون العمل المصري 14/2025.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 1: VIOLATIONS & PENALTIES */}
          {activeSubTab === 'violations' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-bold block">ملاحظات هامة بخصوص التأخير واستحقاق الجزاءات:</span>
                  <p className="text-amber-800 leading-relaxed">
                    تبدأ الوردية الرسمية الساعة 09:00 صباحاً. التواجد بعد الساعة 09:00 AM بدقيقة واحدة يُسجل كـ "متأخر"، والتأخير بعد تجاوز 60 دقيقة (بعد 10:00 AM) يُعتبر الموظف غائباً وتُطبق عليه الأحكام.
                  </p>
                </div>
              </div>

              {/* Table of Violations */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead>
                      <tr className="bg-[#0d2240] text-white">
                        <th className="py-3 px-4 font-extrabold border-b border-blue-900">نوع المخالفة (التأخير / الحضور)</th>
                        <th className="py-3 px-4 text-center font-bold border-b border-blue-900 bg-blue-950/40">المرة الأولى</th>
                        <th className="py-3 px-4 text-center font-bold border-b border-blue-900 bg-blue-950/40">المرة الثانية</th>
                        <th className="py-3 px-4 text-center font-bold border-b border-blue-900 bg-blue-950/40">المرة الثالثة</th>
                        <th className="py-3 px-4 text-center font-bold border-b border-blue-900 bg-blue-950/40">المرة الرابعة</th>
                        <th className="py-3 px-4 font-bold border-b border-blue-900">ملاحظات والتفاصيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      
                      {/* Row 1 */}
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          1. التأخير حتى 15 دقيقة دون إذن بعد فترة السماح
                        </td>
                        <td className="py-3 px-4 text-center text-amber-700 font-bold">إنذار كتابي</td>
                        <td className="py-3 px-4 text-center text-amber-800 font-bold">خصم ربع يوم (0.25)</td>
                        <td className="py-3 px-4 text-center text-rose-700 font-bold">خصم نصف يوم (0.5)</td>
                        <td className="py-3 px-4 text-center text-rose-800 font-bold">خصم يوم كامل</td>
                        <td className="py-3 px-4 text-slate-500">مع حرمان أجر ساعات التأخير</td>
                      </tr>

                      {/* Row 2 */}
                      <tr className="hover:bg-slate-50 bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          2. التأخير من 15 دقيقة حتى 60 دقيقة دون إذن
                        </td>
                        <td className="py-3 px-4 text-center text-amber-700 font-bold">خصم نصف يوم (0.5)</td>
                        <td className="py-3 px-4 text-center text-rose-700 font-bold">خصم يوم كامل</td>
                        <td className="py-3 px-4 text-center text-rose-800 font-bold">خصم 3 أيام</td>
                        <td className="py-3 px-4 text-center text-rose-900 font-bold">خصم 5 أيام</td>
                        <td className="py-3 px-4 text-slate-500">في حال لم يترتب عليه تعطيل عمال</td>
                      </tr>

                      {/* Row 3 - Crucial Rule */}
                      <tr className="bg-rose-50/80 border-y border-rose-200">
                        <td className="py-3 px-4 font-extrabold text-rose-950">
                          3. التأخير أكثر من 60 دقيقة دون إذن أو عذر
                        </td>
                        <td colSpan={4} className="py-3 px-4 text-center font-extrabold text-rose-900">
                          🚨 يُمنع العامل من الدخول ويعتبر غائباً وتطبق عليه عقوبة الغياب بدون إذن
                        </td>
                        <td className="py-3 px-4 text-rose-800 font-bold">حظر دخول + غياب</td>
                      </tr>

                      {/* Row 4 */}
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          4. الانقطاع عن العمل بدون إذن أو عذر مقبول
                        </td>
                        <td colSpan={4} className="py-3 px-4 text-center text-slate-700">
                          تطبق أحكام المادة 166 (إنذار بخطاب مسجل بعد 10 أيام متتالية أو 20 يوماً متقطعة خلال السنة)
                        </td>
                        <td className="py-3 px-4 text-rose-700 font-bold">اعتبار الموظف مستقيلاً</td>
                      </tr>

                      {/* Row 5 */}
                      <tr className="hover:bg-slate-50 bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          5. ترك مكان العمل أو الانصراف المبكر دون إذن
                        </td>
                        <td className="py-3 px-4 text-center text-amber-700 font-bold">خصم يوم</td>
                        <td className="py-3 px-4 text-center text-rose-700 font-bold">خصم 3 أيام</td>
                        <td className="py-3 px-4 text-center text-rose-800 font-bold">خصم 5 أيام</td>
                        <td className="py-3 px-4 text-center text-rose-950 font-bold">الفصل (المحكمة العمالية)</td>
                        <td className="py-3 px-4 text-slate-500">مع حرمان أجر ساعات الغياب</td>
                      </tr>

                      {/* Row 6 */}
                      <tr className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          6. الامتناع عن استخدام البصمة لإنشاء إثبات حضور/انصراف
                        </td>
                        <td className="py-3 px-4 text-center text-amber-700 font-bold">خصم يوم</td>
                        <td className="py-3 px-4 text-center text-rose-700 font-bold">خصم 3 أيام</td>
                        <td className="py-3 px-4 text-center text-rose-800 font-bold">خصم 5 أيام</td>
                        <td className="py-3 px-4 text-center text-rose-900 font-bold">تأجيل الترقية</td>
                        <td className="py-3 px-4 text-slate-500">مع حرمان أجر أيام عدم الإثبات</td>
                      </tr>

                      {/* Row 7 */}
                      <tr className="hover:bg-slate-50 bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          7. الخروج في وقت الراحة دون إبلاغ (الاستئذان)
                        </td>
                        <td className="py-3 px-4 text-center text-amber-700 font-bold">خصم نصف يوم (في وجود بديل)</td>
                        <td className="py-3 px-4 text-center text-rose-700 font-bold">خصم يوم كامل</td>
                        <td className="py-3 px-4 text-center text-rose-800 font-bold">خصم 3 أيام</td>
                        <td className="py-3 px-4 text-center text-rose-900 font-bold">خصم 5 أيام</td>
                        <td className="py-3 px-4 text-slate-500">الحد الأقصى للاستئذان: ساعتان (مرتان/شهر)</td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: LEAVES & BENEFITS */}
          {activeSubTab === 'leaves' && (
            <div className="space-y-6 animate-fadeIn">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Annual Leaves */}
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                    <Palmtree className="w-5 h-5 text-emerald-600" />
                    <span>رصيد الإجازات السنوية (المادة 125)</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li><strong>السنة الأولى:</strong> 15 يوماً (تحتسب بعد فترة الاختبار 3 أشهر).</li>
                    <li><strong>أكثر من سنة كاملة:</strong> 21 يوماً إجازة سنوية مدفوعة.</li>
                    <li><strong>10 سنوات خدمة أو تجاوز سن 50:</strong> 30 يوماً إجازة سنوية.</li>
                    <li><strong>ذوو الهمم أو الإعاقة:</strong> 45 يوماً سنوياً.</li>
                    <li><strong>تقديم طلب الإجازة:</strong> قبل القيام بها بـ 15 يوماً للإجازات المتصلة.</li>
                  </ul>
                </div>

                {/* Casual Leaves */}
                <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span>الإجازة العارضة (7 أيام سنوياً)</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li>تمنح للأسباب الطارئة بحد أقصى <strong>يومين في المرة الواحدة</strong>.</li>
                    <li>تقتطع من رصيد الإجازات السنوية.</li>
                    <li>يلزم إبلاغ الشركة هاتفياً أو رسمياً <strong>قبل الساعة 10:00 صباحاً</strong> من يوم الغياب.</li>
                  </ul>
                </div>

                {/* Overtime Rates */}
                <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <span>حساب العمل الإضافي والأجور (المادة 121)</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li><strong>ساعات العمل النهارية الإضافية:</strong> يُصرف أجر الساعي الأساسية + <strong className="text-blue-700">35% زيادة</strong>.</li>
                    <li><strong>ساعات العمل الليلية الإضافية:</strong> يُصرف أجر الساعة الأساسية + <strong className="text-blue-700">70% زيادة</strong>.</li>
                    <li><strong>العمل في العطلة الأسبوعية/الرسمية:</strong> أجر يومين كاملين أو منح يوم آخر مدفوع الأجر بديل عنه.</li>
                    <li><strong>صرف الأجور:</strong> يتم صرف الأجور في موعد أقصاه <strong>اليوم الخامس من كل شهر</strong>.</li>
                  </ul>
                </div>

                {/* Special Leaves */}
                <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-purple-900 font-extrabold text-sm">
                    <Award className="w-5 h-5 text-purple-600" />
                    <span>الإجازات الرسمية الخاصة</span>
                  </div>
                  <ul className="text-xs text-slate-700 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li><strong>إجازة الوضع (للعاملات):</strong> 4 أشهر مدفوعة الأجر الكامل (حتى 3 مرات).</li>
                    <li><strong>إجازة الزواج:</strong> 3 أيام مدفوعة الأجر (لمرة واحدة).</li>
                    <li><strong>إجازة الحج/العمرة:</strong> شهر مدفوع الأجر لمن أمضى 5 سنوات متصلة.</li>
                    <li><strong>إجازة الوفاة:</strong> 3 أيام لوفاة أحد الأقارب من الدرجة الأولى.</li>
                  </ul>
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: CODE OF CONDUCT */}
          {activeSubTab === 'conduct' && (
            <div className="space-y-4 animate-fadeIn">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-sm">
                    <HeartHandshake className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span>الواجبات والسلوك الأخلاقي</span>
                  </div>
                  <ul className="text-xs text-indigo-950 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li>أداء العمل المنوط بالموظف بدقة وأمانة وفقاً للوصف الوظيفي.</li>
                    <li>الحفاظ على مواعيد العمل الرسمية واحترام زملائه ورؤسائه ومرؤوسيه.</li>
                    <li>المحافظة على أدوات وأجهزة وممتلكات شركة Tech Source GDS.</li>
                    <li>عدم استغلال سلطته الوظيفية لتحقيق منافع شخصية أو مكاسب ذاتية.</li>
                  </ul>
                </div>

                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sky-900 font-extrabold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0" />
                    <span>المظهر والزي الرسمي</span>
                  </div>
                  <p className="text-xs text-sky-950 leading-relaxed">
                    يلتزم الموظفون بارتداء زي رسمي أو شبه رسمي أنيق ومحترم. يُسمح بملابس غير رسمية لائقة (Casual) في يوم الخميس فقط بشرط ملائمتها لبيئة العمل.
                  </p>
                </div>

              </div>

            </div>
          )}

          {/* TAB 4: GROSS MISCONDUCT & PRINCIPLES */}
          {activeSubTab === 'general' && (
            <div className="space-y-5 animate-fadeIn">
              
              <div className="bg-rose-900 text-white rounded-2xl p-5 space-y-3 shadow-md">
                <div className="flex items-center gap-2 text-amber-300 font-extrabold text-sm sm:text-base">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>الأخطاء الجسيمة الموجبة للفصل الفوري (المادة 148 من قانون العمل)</span>
                </div>
                <ul className="text-xs sm:text-sm text-slate-200 space-y-2 list-disc list-inside leading-relaxed font-medium">
                  <li>إذا ثبت انتحال الموظف شخصية غير صحيحة أو قدم مستندات مزورة.</li>
                  <li>إذا ثبت ارتكاب الموظف لخطأ نشأ عنه أضرار جسيمة بالشركة.</li>
                  <li>إذا ثبت تكرار عدم مراعاة تعليمات السلامة والصحة المهنية رغم التنبيه كتابة.</li>
                  <li>إذا ثبت إفشاء الموظف لأسرار الشركة وتسبب في أضرار جسيمة (خرق اتفاقية NDA).</li>
                  <li>إذا ثبت قيام الموظف بمنافسة الشركة في ذات نشاطها التجاري.</li>
                  <li>إذا وجد الموظف في حالة سكر بين أو تحت تأثير مادة مخدرة أثناء ساعات العمل.</li>
                  <li>إذا ثبت اعتداء الموظف على صاحب العمل أو المدير العام أو رؤسائه أثناء العمل أو بسببه.</li>
                </ul>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>تطبق هذه اللائحة على جميع العاملين بشركة تيك سورس لتطوير الأعمال Global GSD</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#0d2240] hover:bg-[#153460] text-white font-bold text-xs transition shadow-sm"
          >
            {lang === 'ar' ? 'إغلاق اللائحة' : 'Close Regulations'}
          </button>
        </div>

      </div>
    </div>
  );
};
