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
    md: 'h-8 sm:h-9',
    lg: 'h-10 sm:h-12',
  }[size];

  const containerPadding = {
    sm: 'px-2 py-0.5 rounded-lg',
    md: 'px-2 py-1 rounded-xl',
    lg: 'px-3 py-1.5 rounded-2xl',
  }[size];

  return (
    <div className={`tech-source-logo inline-flex items-center select-none shrink-0 ${className}`}>
      {withBg ? (
        <div className={`bg-white shadow-sm border border-slate-200/80 flex items-center justify-center ${containerPadding}`}>
          <img
            src="/logo.png"
            alt="Tech Source GDS - Global Development"
            className={`${imgHeightClass} w-auto max-w-full object-contain`}
          />
        </div>
      ) : (
        <img
          src="/logo.png"
          alt="Tech Source GDS - Global Development"
          className={`${imgHeightClass} w-auto max-w-full object-contain`}
        />
      )}
    </div>
  );
};
