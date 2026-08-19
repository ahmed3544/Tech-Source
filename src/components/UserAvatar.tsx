import React, { useState, useEffect } from 'react';

interface UserAvatarProps {
  name?: string;
  code?: string;
  avatar?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  employee?: { nameAr?: string; nameEn?: string; code?: string; avatar?: string; avatarUrl?: string };
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, code, avatar, size = 'md', className = '', employee }) => {
  const [imgError, setImgError] = useState(false);

  const displayName = name || (employee ? (employee.nameEn || employee.nameAr || '') : '');
  const displayCode = code || employee?.code || '';
  const displayAvatar = avatar || employee?.avatar || employee?.avatarUrl || '';

  useEffect(() => {
    setImgError(false);
  }, [displayAvatar]);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px] border',
    sm: 'w-8 h-8 text-xs border',
    md: 'w-10 h-10 text-sm border-2',
    lg: 'w-12 h-12 text-base border-2',
    xl: 'w-16 h-16 text-xl border-2',
  };

  if (displayAvatar && !imgError) {
    return (
      <div
        className={`rounded-full shrink-0 overflow-hidden border-emerald-500/30 shadow-sm ${sizeClasses[size]} ${className}`}
        title={displayName}
      >
        <img
          src={displayAvatar}
          alt={displayName}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Generate 2 initials from name (e.g. "Adham Niazy Jalal" -> "AN")
  const safeName = displayName || '';
  const cleanName = safeName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  
  let initials = '';
  if (words.length >= 2) {
    initials = `${words[0][0]}${words[1][0]}`.toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    initials = words[0].substring(0, 2).toUpperCase();
  } else if (displayCode) {
    initials = displayCode.replace(/[^0-9]/g, '').slice(-2) || 'EP';
  } else {
    initials = 'TS';
  }

  // Consistent pleasant background color based on name hash
  const bgColors = [
    'bg-gradient-to-br from-emerald-600 to-teal-800 text-white border-emerald-400/40',
    'bg-gradient-to-br from-blue-600 to-indigo-800 text-white border-blue-400/40',
    'bg-gradient-to-br from-violet-600 to-purple-800 text-white border-purple-400/40',
    'bg-gradient-to-br from-amber-600 to-orange-800 text-white border-amber-400/40',
    'bg-gradient-to-br from-cyan-600 to-blue-800 text-white border-cyan-400/40',
    'bg-gradient-to-br from-rose-600 to-pink-800 text-white border-rose-400/40',
    'bg-gradient-to-br from-teal-600 to-emerald-800 text-white border-teal-400/40',
    'bg-gradient-to-br from-indigo-600 to-slate-800 text-white border-indigo-400/40',
  ];

  let hash = 0;
  for (let i = 0; i < safeName.length; i++) {
    hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % bgColors.length;
  const colorClass = bgColors[colorIndex];

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 font-mono font-bold tracking-wider shadow-sm select-none ${sizeClasses[size]} ${colorClass} ${className}`}
      title={displayName}
    >
      {initials}
    </div>
  );
};
