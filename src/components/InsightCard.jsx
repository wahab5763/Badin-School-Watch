import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function InsightCard({ title, detail, tag }) {
  return (
    <div className="metric-panel card-hover rounded-4xl p-5 shadow-soft">
      <div className="inline-flex rounded-full bg-signal/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.25em] text-signal">
        {tag}
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-slatebrand">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slatebrand/68">{detail}</p>
      <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-signal">
        Stakeholder insight
        <ArrowRight className="h-4 w-4" />
      </div>
    </div>
  );
}
