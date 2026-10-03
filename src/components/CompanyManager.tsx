import React, { useEffect, useState } from "react";
import { Building2, Plus, X, RefreshCw } from "lucide-react";
import { Language, Company } from "../types";

interface CompanyManagerProps {
  lang: Language;
  onClose: () => void;
}

export const CompanyManager: React.FC<CompanyManagerProps> = ({ lang, onClose }) => {
  const [companies, setCompanies] = useState<(Company & { employeeCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    nameAr: "", nameEn: "", code: "", adminNameAr: "", adminNameEn: "", adminCode: "", password: "", adminEmail: ""
  });

  const actorId = (() => {
    try { return JSON.parse(localStorage.getItem("logged_in_user") || "null")?.id || ""; } catch { return ""; }
  })();

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/companies?actorId=" + encodeURIComponent(actorId), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "LOAD_FAILED");
      setCompanies(Array.isArray(data.companies) ? data.companies : []);
    } catch (e: any) {
      setError(e?.message || "LOAD_FAILED");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, actorId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "SAVE_FAILED");
      setForm({ nameAr: "", nameEn: "", code: "", adminNameAr: "", adminNameEn: "", adminCode: "", password: "", adminEmail: "" });
      await load();
    } catch (e: any) {
      setError(e?.message || "SAVE_FAILED");
    } finally { setSaving(false); }
  };

  const field = (key: keyof typeof form, ar: string, en: string, type = "text") => (
    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
      {lang === "ar" ? ar : en}
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-normal outline-none"
        required={["nameAr","nameEn","code","adminCode","password"].includes(key)}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{lang === "ar" ? "إدارة الشركات" : "Company Management"}</h2>
              <p className="text-xs text-slate-500">{lang === "ar" ? "إضافة شركات Outsourcing وحساب مدير لكل شركة" : "Add outsourcing companies and a dedicated admin account"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"><X /></button>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <form onSubmit={save} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <h3 className="font-black text-sm">{lang === "ar" ? "إضافة شركة جديدة" : "Add New Company"}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {field("nameAr","اسم الشركة بالعربي","Company Arabic Name")}
              {field("nameEn","اسم الشركة بالإنجليزي","Company English Name")}
              {field("code","كود الشركة","Company Code")}
              {field("adminNameAr","اسم المدير بالعربي","Admin Arabic Name")}
              {field("adminNameEn","اسم المدير بالإنجليزي","Admin English Name")}
              {field("adminCode","كود دخول المدير","Admin Login Code")}
              {field("password","كلمة مرور المدير","Admin Password","password")}
              {field("adminEmail","إيميل المدير","Admin Email","email")}
            </div>
            {error && <div className="rounded-xl bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 text-xs font-bold">{error}</div>}
            <button disabled={saving} className="w-full py-3 rounded-xl bg-slate-900 text-white font-black text-xs disabled:opacity-50">
              <Plus className="inline w-4 h-4 mr-1" />{saving ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : (lang === "ar" ? "إنشاء الشركة وحساب المدير" : "Create Company & Admin")}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-sm">{lang === "ar" ? "الشركات الحالية" : "Current Companies"}</h3>
              <button onClick={() => void load()} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            </div>
            {loading ? <div className="text-xs text-slate-400 py-8 text-center">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div> :
              companies.length ? <div className="space-y-2">{companies.map(company => (
                <div key={company.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div><div className="font-black text-sm">{lang === "ar" ? company.nameAr : company.nameEn}</div><div className="text-[10px] text-slate-500 font-mono">{company.code} • {company.employeeCount ?? 0} {lang === "ar" ? "موظف" : "employees"}</div></div>
                  <span className="text-[10px] font-bold rounded-full px-2 py-1 bg-emerald-100 text-emerald-700">{company.status}</span>
                </div>
              ))}</div> :
              <div className="text-xs text-slate-400 py-8 text-center">{lang === "ar" ? "لا توجد شركات بعد" : "No companies yet"}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
