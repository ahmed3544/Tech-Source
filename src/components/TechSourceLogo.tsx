import React from 'react';

interface TechSourceLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  className?: string;
  withBg?: boolean;
}

export const TechSourceLogo: React.FC<TechSourceLogoProps> = ({
  size = 'md',
  className = '',
  withBg = true,
}) => {
  const imgHeightClass = {
    sm: 'h-7 sm:h-8',
    md: 'h-9 sm:h-10',
    lg: 'h-12 sm:h-14',
  }[size];

  const containerPadding = {
    sm: 'px-2 py-1 rounded-xl',
    md: 'px-3 py-1.5 rounded-2xl',
    lg: 'px-4 py-2.5 rounded-3xl',
  }[size];

  return (
    <div className={`inline-flex items-center select-none ${className}`}>
      {withBg ? (
        <div className={`bg-white shadow-sm border border-slate-100/90 flex items-center justify-center ${containerPadding} transition-all duration-200 hover:shadow-md`}>
          <img 
            src="logo.png" 
            alt="Tech Source GDS - Global Development" 
            referrerPolicy="no-referrer"
            className={`${imgHeightClass} w-auto max-w-full object-contain`}
          />
        </div>
      ) : (
        <img 
          src="logo.png" 
          alt="Tech Source GDS - Global Development" 
          referrerPolicy="no-referrer"
          className={`${imgHeightClass} w-auto max-w-full object-contain`}
        />
      )}
    </div>
  );
};

