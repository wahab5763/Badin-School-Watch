import React from 'react';
import { School } from 'lucide-react';

export default function LogoMark({ light = false, compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${light ? 'bg-white/15' : 'bg-signal/10'}`}>
        <School className={`h-5 w-5 ${light ? 'text-white' : 'text-signal'}`} />
      </div>
      <div>
        <div className={`text-base font-bold tracking-tight leading-tight ${light ? 'text-white' : 'text-slatebrand'}`}>
          Badin School Watch
        </div>
        {!compact && (
          <div className={`text-[11px] leading-tight ${light ? 'text-white/55' : 'text-slatebrand/50'}`}>
            Public service accountability
          </div>
        )}
      </div>
    </div>
  );
}
