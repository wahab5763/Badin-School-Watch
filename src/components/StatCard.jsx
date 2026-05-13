import React from 'react';

export default function StatCard({ icon: Icon, label, value, hint, tone = 'text-signal' }) {
  return (
    <div className="metric-panel card-hover rounded-4xl p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slatebrand/45">{label}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-slatebrand">{value}</div>
          <div className="mt-2 text-sm leading-6 text-slatebrand/62">{hint}</div>
        </div>
        {Icon ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-signal/10">
            <Icon className={`h-5 w-5 ${tone}`} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
