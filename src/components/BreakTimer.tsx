import React, { useState, useEffect } from 'react';
import { Coffee } from 'lucide-react';
import { formatSecondsToHMS, toWesternDigits } from '../utils/helpers';

interface BreakTimerProps {
  breakStart?: string;
  className?: string;
  showIcon?: boolean;
}

export const BreakTimer: React.FC<BreakTimerProps> = ({ 
  breakStart, 
  className = '', 
  showIcon = true 
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!breakStart) {
      setElapsedSeconds(0);
      return;
    }

    const calcElapsed = () => {
      try {
        const now = new Date();
        let str = breakStart.trim();
        const isPM = str.toUpperCase().includes('PM');
        const isAM = str.toUpperCase().includes('AM');
        str = str.replace(/AM|PM/gi, '').trim();

        const parts = str.split(':').map(Number);
        if (parts.length >= 2) {
          let hours = parts[0] || 0;
          const minutes = parts[1] || 0;
          const seconds = parts[2] || 0;

          if (isPM && hours < 12) hours += 12;
          if (isAM && hours === 12) hours = 0;

          const startDate = new Date();
          startDate.setHours(hours, minutes, seconds, 0);

          const diffMs = now.getTime() - startDate.getTime();
          setElapsedSeconds(Math.max(0, Math.floor(diffMs / 1000)));
        }
      } catch {
        setElapsedSeconds(0);
      }
    };

    calcElapsed();
    const timer = setInterval(calcElapsed, 1000);
    return () => clearInterval(timer);
  }, [breakStart]);

  return (
    <span className={`inline-flex items-center gap-1 font-mono font-bold ${className}`}>
      {showIcon && <Coffee className="w-3.5 h-3.5 text-amber-600 animate-pulse" />}
      <span>{toWesternDigits(formatSecondsToHMS(elapsedSeconds))}</span>
    </span>
  );
};
