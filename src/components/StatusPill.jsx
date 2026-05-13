import React from 'react';

const tones = {
  good: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-slatebrand/10 text-slatebrand'
};

export default function StatusPill({ children, tone = 'neutral' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] ${tones[tone]}`}>
      {children}
    </span>
  );
}
