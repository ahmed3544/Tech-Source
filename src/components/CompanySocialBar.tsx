import React from 'react';
import { Globe, Phone, ExternalLink } from 'lucide-react';
import { Language } from '../types';

export const COMPANY_CONTACTS = {
  website: 'https://www.techsource-gds.com',
  websiteDisplay: 'www.techsource-gds.com',
  phone: '01024749636',
  phoneDisplay: '01024749636',
  linkedin: 'https://www.linkedin.com/company/techsource-gds-global-development/about/',
  facebook: 'https://www.facebook.com/people/Tech-Source-GDS/61583497211343/',
  instagram: 'https://www.instagram.com/techsource_gds/',
};

interface CompanySocialBarProps {
  lang: Language;
  variant?: 'footer' | 'header' | 'modal';
}

export const CompanySocialBar: React.FC<CompanySocialBarProps> = ({
  lang,
  variant = 'footer'
}) => {
  if (variant === 'modal') {
    return (
      <div className="w-full pt-3 border-t border-slate-800 text-slate-300">
        <div className="text-[11px] font-bold text-slate-400 mb-2 text-center">
          {lang === 'ar' ? 'تواصل مع Tech Source GDS عبر المنصات الرسمية:' : 'Connect with Tech Source GDS:'}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* Website */}
          <a
            href={COMPANY_CONTACTS.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-950/80 hover:text-sky-300 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition"
            title={lang === 'ar' ? 'زيارة الموقع الرسمي' : 'Official Website'}
          >
            <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span dir="ltr">www.techsource-gds.com</span>
          </a>

          {/* Phone */}
          <a
            href={`tel:${COMPANY_CONTACTS.phone}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-950/80 hover:text-emerald-300 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition"
            title={lang === 'ar' ? 'الاتصال الهاتفي' : 'Call Phone'}
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span dir="ltr">01024749636</span>
          </a>

          {/* LinkedIn */}
          <a
            href={COMPANY_CONTACTS.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-950/80 hover:text-blue-300 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition"
            title="LinkedIn"
          >
            <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
            </svg>
            <span>LinkedIn</span>
          </a>

          {/* Facebook */}
          <a
            href={COMPANY_CONTACTS.facebook}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-900/60 hover:text-blue-200 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition"
            title="Facebook"
          >
            <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H7.5v-3H10V9.69c0-2.47 1.47-3.83 3.73-3.83 1.08 0 2.2.19 2.2.19v2.42h-1.24c-1.23 0-1.62.76-1.62 1.54V12h2.73l-.44 3h-2.29v6.8c4.56-.93 8-4.96 8-9.8z"/>
            </svg>
            <span>Facebook</span>
          </a>

          {/* Instagram */}
          <a
            href={COMPANY_CONTACTS.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-pink-950/80 hover:text-pink-300 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition"
            title="Instagram"
          >
            <svg className="w-3.5 h-3.5 text-pink-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <span>Instagram</span>
          </a>
        </div>
      </div>
    );
  }

  // Footer full representation
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
      {/* Contact Channels */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs">
        {/* Official Website */}
        <a
          href={COMPANY_CONTACTS.website}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-sky-950 hover:text-sky-300 border border-slate-700/80 text-slate-300 font-medium transition shadow-xs"
          title={lang === 'ar' ? 'الموقع الرسمي للشركة' : 'Official Website'}
        >
          <Globe className="w-4 h-4 text-sky-400 group-hover:rotate-12 transition-transform shrink-0" />
          <span className="font-mono" dir="ltr">www.techsource-gds.com</span>
          <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-sky-400 transition-colors" />
        </a>

        {/* Official Phone */}
        <a
          href={`tel:${COMPANY_CONTACTS.phone}`}
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-emerald-950 hover:text-emerald-300 border border-slate-700/80 text-slate-300 font-medium transition shadow-xs"
          title={lang === 'ar' ? 'اتصل بنا المباشر' : 'Call Direct Phone'}
        >
          <Phone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
          <span className="font-mono" dir="ltr">01024749636</span>
        </a>

        {/* LinkedIn */}
        <a
          href={COMPANY_CONTACTS.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-blue-950 hover:text-blue-300 border border-slate-700/80 text-slate-300 font-medium transition shadow-xs"
          title="LinkedIn Profile"
        >
          <svg className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
          </svg>
          <span className="hidden sm:inline">LinkedIn</span>
        </a>

        {/* Facebook */}
        <a
          href={COMPANY_CONTACTS.facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-blue-900/80 hover:text-blue-200 border border-slate-700/80 text-slate-300 font-medium transition shadow-xs"
          title="Facebook Page"
        >
          <svg className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H7.5v-3H10V9.69c0-2.47 1.47-3.83 3.73-3.83 1.08 0 2.2.19 2.2.19v2.42h-1.24c-1.23 0-1.62.76-1.62 1.54V12h2.73l-.44 3h-2.29v6.8c4.56-.93 8-4.96 8-9.8z"/>
          </svg>
          <span className="hidden sm:inline">Facebook</span>
        </a>

        {/* Instagram */}
        <a
          href={COMPANY_CONTACTS.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-pink-950 hover:text-pink-300 border border-slate-700/80 text-slate-300 font-medium transition shadow-xs"
          title="Instagram Page"
        >
          <svg className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          <span className="hidden sm:inline">Instagram</span>
        </a>
      </div>
    </div>
  );
};
