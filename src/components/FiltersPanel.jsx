import React from 'react';

export default function FiltersPanel({ filters, options, onChange, onReset }) {
  const handle = (key) => (event) => onChange(key, event.target.value);

  return (
    <div className="metric-panel rounded-4xl p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slatebrand/45">Interactive filters</div>
          <h3 className="mt-2 text-xl font-semibold text-slatebrand">Slice the district by risk, geography, and school profile</h3>
        </div>
        <button
          onClick={onReset}
          className="rounded-full border border-slatebrand/10 px-4 py-2 text-sm font-medium text-slatebrand transition hover:-translate-y-px"
        >
          Reset
        </button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slatebrand/45">Visited on date</span>
          <input type="date" value={filters.selectedDate} onChange={handle('selectedDate')} className="w-full rounded-2xl border border-slatebrand/10 bg-white px-4 py-3 outline-none focus:border-signal" />
        </label>
        <Select label="Taluka" value={filters.taluka} options={options.talukas} onChange={handle('taluka')} />
        <Select label="Level" value={filters.level} options={options.levels} onChange={handle('level')} />
        <Select label="Gender" value={filters.gender} options={options.genders} onChange={handle('gender')} />
        <Select label="School status" value={filters.status} options={options.statuses} onChange={handle('status')} />
      </div>
    </div>
  );
}

function Select({ label, value, options = [], onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slatebrand/45">{label}</span>
      <select value={value} onChange={onChange} className="w-full rounded-2xl border border-slatebrand/10 bg-white px-4 py-3 outline-none focus:border-signal">
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
