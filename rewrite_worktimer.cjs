const fs = require('fs');

let code = fs.readFileSync('src/components/WorkTimer.tsx', 'utf8');

const newComponent = `import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { formatSecondsToHMS } from '../utils/helpers';

interface WorkTimerProps {
  checkIn?: string;
  checkOut?: string;
  breakStart?: string;
  breakEnd?: string;
  shift?: any;
  variant?: 'badge' | 'box';
  className?: string;
  showIcon?: boolean;
}

export const WorkTimer: React.FC<WorkTimerProps> = ({
  checkIn,
  checkOut,
  breakStart,
  breakEnd,
  shift,
  variant = 'badge',
  className = '',
  showIcon = true,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!checkIn) {
      setElapsedSeconds(0);
      return;
    }

    const calc = () => {
      try {
        const now = new Date();
        const parts = checkIn.trim().split(':').map(Number);
        const inDate = new Date();
        inDate.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);

        let endDate = now;
        if (checkOut) {
          const outParts = checkOut.trim().split(':').map(Number);
          const outDate = new Date();
          outDate.setHours(outParts[0] || 0, outParts[1] || 0, outParts[2] || 0, 0);
          endDate = outDate;
        }

        let diff = Math.floor((endDate.getTime() - inDate.getTime()) / 1000);
        if (diff < -43200) diff += 86400; // Handle overnight checkin (if now is next day)

        // Subtract active or completed break duration
        if (breakStart) {
          const bsParts = breakStart.trim().split(':').map(Number);
          const bsDate = new Date();
          bsDate.setHours(bsParts[0] || 0, bsParts[1] || 0, bsParts[2] || 0, 0);
          
          let beDate = now;
          if (breakEnd) {
            const beParts = breakEnd.trim().split(':').map(Number);
            const beEndObj = new Date();
            beEndObj.setHours(beParts[0] || 0, beParts[1] || 0, beParts[2] || 0, 0);
            beDate = beEndObj;
          }
          let breakDiff = Math.floor((beDate.getTime() - bsDate.getTime()) / 1000);
          if (breakDiff < -43200) breakDiff += 86400;
          diff = Math.max(0, diff - Math.max(0, breakDiff));
        }

        setElapsedSeconds(Math.max(0, diff));
      } catch {
        setElapsedSeconds(0);
      }
    };

    calc();
    if (checkOut) return;
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [checkIn, checkOut, breakStart, breakEnd]);

  if (!checkIn) return null;

  if (variant === 'badge') {
    return (
      <span className={\`inline-flex items-center gap-1.5 font-mono font-bold \${className}\`}>
        {showIcon && <Clock className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />}
        <span>{formatSecondsToHMS(elapsedSeconds)}</span>
      </span>
    );
  }

  // Box variant
  const shiftDurationSecs = shift?.durationMinutes ? shift.durationMinutes * 60 : 480 * 60;
  const isOvertime = elapsedSeconds > shiftDurationSecs;
  const overtimeSecs = Math.max(0, elapsedSeconds - shiftDurationSecs);
  const remainingSecs = Math.max(0, shiftDurationSecs - elapsedSeconds);

  return (
    <div className={\`flex flex-col gap-2 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 \${className}\`}>
      <div className="flex justify-between items-center border-b border-emerald-100/50 pb-2 mb-2">
        <span className="text-emerald-800 text-sm font-bold">وقت العمل:</span>
        <span className="text-2xl font-black text-emerald-700 font-mono tracking-wider">
          {formatSecondsToHMS(elapsedSeconds)}
        </span>
      </div>
      
      <div className="flex justify-between items-center text-xs text-slate-600 mb-1">
        <span>الشفت:</span>
        <span className="font-mono font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
          {shift?.startTime || '09:00'} - {shift?.endTime || '17:00'}
        </span>
      </div>
      
      {isOvertime ? (
        <div className="flex justify-between items-center bg-amber-100 px-3 py-2 rounded-lg border border-amber-200 mt-1">
          <span className="text-amber-800 text-xs font-bold animate-pulse">Overtime:</span>
          <span className="font-mono font-bold text-amber-700">
            {formatSecondsToHMS(overtimeSecs)}
          </span>
        </div>
      ) : (
        <div className="flex justify-between items-center bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 mt-1">
          <span className="text-slate-600 text-xs font-bold">المتبقي:</span>
          <span className="font-mono font-bold text-slate-700">
            {formatSecondsToHMS(remainingSecs)}
          </span>
        </div>
      )}
    </div>
  );
};
`;

fs.writeFileSync('src/components/WorkTimer.tsx', newComponent);
