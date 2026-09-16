import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Filter,
  GraduationCap,
  Loader2,
  MapPinned,
  RefreshCw,
  School,
  Users,
  X
} from 'lucide-react';

import LogoMark from '../components/LogoMark';
import StatCard from '../components/StatCard';
import FiltersPanel from '../components/FiltersPanel';
import StatusPill from '../components/StatusPill';
import { useAuth } from '../context/AuthContext';
import {
  buildMonitorAssignmentsReportUrl,
  buildVisitedSchoolsReportUrl,
  buildEmployeeAttendanceReportUrl,
  fetchSchoolVisitDetail
} from '../lib/api';
import { useDashboard } from '../lib/useDashboard';
import { formatCompact, formatDateTime, formatNumber, formatPercent } from '../lib/format';

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getInitialFilters() {
  return {
    taluka: 'all',
    level: 'all',
    gender: 'all',
    status: 'all',
    selectedDate: formatDateInput(new Date()),
    daysRange: 0,
    minRisk: 0
  };
}

function getInitialAttendanceFilters() {
  return { startMonth: '', endMonth: '' };
}

function matches(value, selected) {
  return selected === 'all' || value === selected;
}

function visitDateMatches(value, selectedDate) {
  if (!value || !selectedDate) return false;
  return String(value).slice(0, 10) === selectedDate;
}

function normalizeMonthRange(startMonth, endMonth) {
  const normalizedStart = String(startMonth || '').trim();
  const normalizedEnd = String(endMonth || '').trim();

  if (!normalizedStart && !normalizedEnd) {
    return { startMonth: '', endMonth: '' };
  }

  if (!normalizedStart) {
    return { startMonth: normalizedEnd, endMonth: normalizedEnd };
  }

  if (!normalizedEnd) {
    return { startMonth: normalizedStart, endMonth: normalizedStart };
  }

  return normalizedStart <= normalizedEnd
    ? { startMonth: normalizedStart, endMonth: normalizedEnd }
    : { startMonth: normalizedEnd, endMonth: normalizedStart };
}

function monthOnlyIso(value) {
  const iso = String(value || '').slice(0, 10);
  return iso ? iso.slice(0, 7) : '';
}

function visitInMonthRange(visitDateValue, startMonth, endMonth) {
  if (!visitDateValue) return false;
  const visitMonth = monthOnlyIso(visitDateValue);
  if (!visitMonth) return false;

  const range = normalizeMonthRange(startMonth, endMonth);
  if (!range.startMonth) return false;

  return visitMonth >= range.startMonth && visitMonth <= range.endMonth;
}

function hasVisitOnDate(school, selectedDate, daysRange = 0, startMonth = '', endMonth = '') {
  const visitDates = Array.isArray(school.visitDates) && school.visitDates.length
    ? school.visitDates
    : school.lastVisitDate
      ? [school.lastVisitDate]
      : [];

  if (startMonth || endMonth) {
    return visitDates.some((visitDate) => visitInMonthRange(visitDate, startMonth, endMonth));
  }

  if (!selectedDate) return false;
  const targetDate = new Date(selectedDate + 'T00:00:00Z');
  if (Number.isNaN(targetDate.getTime())) return false;

  return visitDates.some((visitDate) => {
    if (!visitDate) return false;
    const visitDateStr = String(visitDate).slice(0, 10);
    const targetDateStr = selectedDate;

    if (daysRange === 0) {
      return visitDateStr === targetDateStr;
    }

    const vDate = new Date(visitDateStr + 'T00:00:00Z');
    if (Number.isNaN(vDate.getTime())) return false;
    const diffInMs = Math.abs(vDate.getTime() - targetDate.getTime());
    const diffInDays = Math.round(diffInMs / (1000 * 60 * 60 * 24));
    return diffInDays <= daysRange;
  });
}

function VisitedSchoolsTable({ schools, onPickSchool, onDownloadReport }) {
  if (!schools.length) return null;

  const sortedSchools = [...schools].sort((a, b) => {
    const monitorA = (a.monitor?.name || '').trim().toLowerCase();
    const monitorB = (b.monitor?.name || '').trim().toLowerCase();
    return monitorA.localeCompare(monitorB);
  });

  return (
    <div className="metric-panel rounded-5xl p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slatebrand/45">Visited schools roster</div>
          <h3 className="mt-2 text-xl font-semibold text-slatebrand">Schools visited in selected period</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDownloadReport}
            className="rounded-full border border-slatebrand/10 bg-white px-4 py-2 text-sm font-medium text-slatebrand transition hover:-translate-y-px"
          >
            Download visited schools PDF
          </button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-slatebrand/45">
              <th className="px-3 py-2">SEMIS</th>
              <th className="px-3 py-2">School name</th>
              <th className="px-3 py-2">Union Council</th>
              <th className="px-3 py-2">Last monitor visit</th>
              <th className="px-3 py-2">Monitor name</th>
            </tr>
          </thead>
          <tbody>
            {sortedSchools.map((school) => (
              <tr
                key={school.schoolId}
                className="rounded-3xl bg-white transition hover:bg-signal/5 cursor-pointer"
                onClick={() => onPickSchool(school)}
              >
                <td className="rounded-l-3xl px-3 py-3 font-mono text-xs font-semibold text-slatebrand">{school.semis}</td>
                <td className="px-3 py-3">
                  <div className="font-medium text-slatebrand">{school.schoolName}</div>
                </td>
                <td className="px-3 py-3 text-slatebrand/70">{school.uc || 'N/A'}</td>
                <td className="px-3 py-3 text-slatebrand/70 text-xs">{school.lastVisitDate ? formatDateTime(school.lastVisitDate) : 'N/A'}</td>
                <td className="rounded-r-3xl px-3 py-3 text-slatebrand/70">{school.monitor?.name || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SchoolDetailDialog({ school, selectedDate, daysRange, onClose }) {
  if (!school) return null;

  const [activeRoster, setActiveRoster] = React.useState(null);
  const [detailSchool, setDetailSchool] = React.useState(school);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState('');

  useEffect(() => {
    let active = true;
    setDetailSchool(school);
    setDetailError('');
    setActiveRoster(null);

    if (!school?.schoolId || !selectedDate) {
      return () => {
        active = false;
      };
    }

    setDetailLoading(true);
    fetchSchoolVisitDetail(school.schoolId, selectedDate, daysRange)
      .then((payload) => {
        if (!active) return;
        setDetailSchool(payload);
      })
      .catch((error) => {
        if (!active) return;
        setDetailError(error.message || 'Failed to load visit details.');
      })
      .finally(() => {
        if (!active) return;
        setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [school, selectedDate, daysRange]);

  const currentSchool = detailSchool || school;

  const evidenceItems = Array.isArray(currentSchool.visitEvidence?.items) ? currentSchool.visitEvidence.items : [];
  const allEvidenceItems = evidenceItems;
  const evidenceByCategory = allEvidenceItems.reduce(
    (acc, item) => {
      const key = acc[item.category] ? item.category : 'other';
      acc[key].push(item);
      return acc;
    },
    {
      school: [],
      musterRoll: [],
      washroom: [],
      visit: [],
      other: []
    }
  );
  const evidenceSections = [
    { key: 'school', title: 'School images' },
    { key: 'musterRoll', title: 'Muster roll' },
    { key: 'washroom', title: 'Washroom' },
    { key: 'visit', title: 'Visit images' },
    { key: 'other', title: 'Other evidence' }
  ];
  const washroomAvailability = currentSchool.census?.washroomsTotal > 0
    ? `${formatNumber(currentSchool.census.washroomsFunctional)} functional of ${formatNumber(currentSchool.census.washroomsTotal)}`
    : 'Not available';
  const enrollmentDetails = [
    { label: 'Total enrollment', value: formatNumber(currentSchool.enrollment.total) },
    { label: 'Boys', value: formatNumber(currentSchool.enrollment.boys) },
    { label: 'Girls', value: formatNumber(currentSchool.enrollment.girls) }
  ];
  const facilityDetails = [
    { label: 'Building ownership', value: currentSchool.census?.buildingOwnership || 'Unknown' },
    { label: 'Building condition', value: currentSchool.census?.buildingCondition || 'Unknown' },
    { label: 'Boundary wall status', value: currentSchool.census?.boundaryWall || 'Unknown' },
    { label: 'Washroom availability', value: washroomAvailability },
    { label: 'Electricity', value: currentSchool.census?.electricity || 'Unknown' },
    { label: 'Drinking water', value: currentSchool.census?.drinkingWater || 'Unknown' }
  ];

  const teachers = Array.isArray(currentSchool.attendance?.teachers) ? currentSchool.attendance.teachers : [];

  const rosterConfig = {
    Present: {
      filter: (t) => t.present === true,
      className: 'border-ok/25 bg-ok/10 text-ok',
      activeClassName: 'border-ok bg-ok/15 text-ok ring-2 ring-ok/30',
      pillTone: 'ok',
      badgeClass: 'bg-ok/15 text-ok'
    },
    Absent: {
      filter: (t) => !t.present && !t.leaveType,
      className: 'border-danger/25 bg-danger/10 text-danger',
      activeClassName: 'border-danger bg-danger/15 text-danger ring-2 ring-danger/30',
      pillTone: 'danger',
      badgeClass: 'bg-danger/15 text-danger'
    },
    Leave: {
      filter: (t) => Boolean(t.leaveType),
      className: 'border-warn/25 bg-warn/10 text-warn',
      activeClassName: 'border-warn bg-warn/15 text-warn ring-2 ring-warn/30',
      pillTone: 'warn',
      badgeClass: 'bg-warn/15 text-warn'
    }
  };

  const attendanceCards = [
    { label: 'Present', value: currentSchool.attendance.present },
    { label: 'Absent', value: currentSchool.attendance.absent },
    { label: 'Leave', value: currentSchool.attendance.leave }
  ];

  const rosterTeachers = activeRoster ? teachers.filter(rosterConfig[activeRoster].filter) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1417]/45 px-4 py-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-5xl border border-slatebrand/10 bg-white p-6 shadow-soft md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slatebrand/45">School monitoring detail</div>
            <h3 className="mt-2 text-2xl font-semibold text-slatebrand">{currentSchool.schoolName}</h3>
            <p className="mt-2 text-sm text-slatebrand/62">SEMIS {currentSchool.semis} · ID {currentSchool.schoolId} · {currentSchool.taluka}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slatebrand/12 p-2 text-slatebrand/70 transition hover:bg-slatebrand/5"
            aria-label="Close school detail"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          {(detailLoading || detailError) && (
            <div className={`mb-4 rounded-3xl border px-4 py-3 text-sm ${detailError ? 'border-danger/20 bg-danger/8 text-danger' : 'border-signal/20 bg-signal/8 text-slatebrand/72'}`}>
              {detailError || 'Loading monitoring data for the selected visit...'}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {attendanceCards.map((card) => {
              const cfg = rosterConfig[card.label];
              const isActive = activeRoster === card.label;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => setActiveRoster(isActive ? null : card.label)}
                  className={`rounded-3xl border px-4 py-3 text-left transition hover:opacity-90 active:scale-[0.98] ${isActive ? cfg.activeClassName : cfg.className}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.2em]">{card.label}</div>
                    {teachers.length > 0 && (
                      <svg className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={isActive ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                      </svg>
                    )}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{formatNumber(card.value)}</div>
                  {teachers.length > 0 && (
                    <div className="mt-1 text-xs opacity-60">{isActive ? 'Click to hide' : 'Click to see names'}</div>
                  )}
                </button>
              );
            })}
          </div>

          {activeRoster && (
            <div className={`mt-3 rounded-3xl border p-4 ${rosterConfig[activeRoster].className}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.18em]">
                  {activeRoster} employees — {rosterTeachers.length}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRoster(null)}
                  className="rounded-full p-1 opacity-60 hover:opacity-100"
                  aria-label="Close roster"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {rosterTeachers.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {rosterTeachers.map((teacher, idx) => (
                    <div
                      key={teacher.id || idx}
                      className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-2.5"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-bold opacity-70">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{teacher.name}</div>
                        {(teacher.leaveType || teacher.absentReason || teacher.remarks) && (
                          <div className="mt-0.5 truncate text-xs opacity-70">
                            {teacher.leaveType || teacher.absentReason || teacher.remarks}
                          </div>
                        )}
                        {teacher.cnic && (
                          <div className="mt-0.5 font-mono text-xs opacity-50">{teacher.cnic}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm opacity-70">No employee records found for this category.</div>
              )}
            </div>
          )}


          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-4xl border border-slatebrand/8 bg-surface/50 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slatebrand/48">Visit context</div>
              <div className="mt-2 text-sm text-slatebrand/72">Selected date: <strong>{selectedDate || 'today'}</strong></div>
              <div className="mt-1 text-sm text-slatebrand/72">Visit time: <strong>{formatDateTime(currentSchool.lastVisitDate)}</strong></div>
              <div className="mt-1 text-sm text-slatebrand/72">Visits in year: <strong>{formatNumber(currentSchool.visitCount)}</strong></div>
              <div className="mt-1 text-sm text-slatebrand/72">Monitor: <strong>{currentSchool.monitor?.name || 'N/A'}</strong></div>
            </div>
            <div className="rounded-4xl border border-slatebrand/8 bg-surface/50 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slatebrand/48">Enrollment snapshot</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {enrollmentDetails.map((item) => (
                  <div key={item.label} className="rounded-3xl bg-white/70 px-3 py-2.5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slatebrand/45">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-slatebrand">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-4xl border border-slatebrand/8 bg-surface/50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slatebrand/48">School facilities</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {facilityDetails.map((item) => (
                <div key={item.label} className="rounded-3xl bg-white/70 px-3 py-2.5">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slatebrand/45">{item.label}</div>
                  <div className="mt-1 text-sm font-semibold text-slatebrand">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-4xl border border-slatebrand/8 bg-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slatebrand/48">Visit evidence gallery</div>
                <div className="mt-1 text-sm text-slatebrand/72">Photos captured during monitoring visit: school, muster roll, washroom, and related evidence.</div>
              </div>
              <StatusPill tone="neutral">{formatNumber(allEvidenceItems.length)} images</StatusPill>
            </div>

            {allEvidenceItems.length ? (
              <div className="mt-4 space-y-5">
                {evidenceSections.map((section) => {
                  const rows = Array.isArray(evidenceByCategory[section.key]) ? evidenceByCategory[section.key] : [];
                  if (!rows.length) return null;
                  return (
                    <div key={section.key}>
                      <div className="mb-2 flex items-center gap-3">
                        <div className="text-sm font-semibold text-slatebrand">{section.title}</div>
                        <StatusPill tone="neutral">{formatNumber(rows.length)}</StatusPill>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {rows.map((item) => (
                          <a
                            key={item.id || item.url}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block overflow-hidden rounded-3xl border border-slatebrand/10 bg-white"
                          >
                            <div className="flex h-52 w-full items-center justify-center bg-slatebrand/5 p-2">
                              <img
                                src={item.url}
                                alt={item.title || section.title}
                                className="max-h-full w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                                loading="lazy"
                              />
                            </div>
                            <div className="p-3 text-sm text-slatebrand/72">{item.title || section.title}</div>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-3xl border border-slatebrand/10 bg-white p-4 text-sm text-slatebrand/62">
                No visit evidence images were found in this school monitoring record.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [filters, setFilters] = useState(getInitialFilters());
  const [attendanceFilters, setAttendanceFilters] = useState(getInitialAttendanceFilters());
  const [selectedSchool, setSelectedSchool] = useState(null);
  const { loading, error, data, refreshing, refresh } = useDashboard();
  const { logout } = useAuth();

  // Auto-adjust selectedDate to mostRecentVisitDate on first data load if no visits on selected date
  useEffect(() => {
    if (!data?.schools || loading) return;
    
    const allSchools = data.schools;
    const timestamps = allSchools.flatMap((school) => {
      const visitDates = Array.isArray(school.visitDates) && school.visitDates.length
        ? school.visitDates
        : school.lastVisitDate
          ? [school.lastVisitDate]
          : [];
      return visitDates
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .map((date) => date.getTime());
    });
    
    if (timestamps.length === 0) return;
    const mostRecentDate = new Date(Math.max(...timestamps)).toISOString().slice(0, 10);
    
    // Only auto-adjust on first load (when filter.selectedDate is still today's initial value)
    const hasVisitOnSelectedDate = allSchools.some((school) => hasVisitOnDate(school, filters.selectedDate, 0));
    if (!hasVisitOnSelectedDate && mostRecentDate !== filters.selectedDate) {
      setFilters((prev) => ({ ...prev, selectedDate: mostRecentDate }));
    }
  }, [data?.schools, loading]);

  const filteredSchools = useMemo(() => {
    if (!data?.schools) return [];
    return data.schools.filter((school) => {
      return (
        matches(school.taluka, filters.taluka) &&
        matches(school.level, filters.level) &&
        matches(school.gender, filters.gender) &&
        matches(school.schoolStatus, filters.status) &&
        school.riskScore >= Number(filters.minRisk)
      );
    });
  }, [data, filters]);

  const visitedSchoolsOnDate = useMemo(
    () => filteredSchools.filter((school) => hasVisitOnDate(school, filters.selectedDate, Number(filters.daysRange))),
    [filteredSchools, filters.selectedDate, filters.daysRange]
  );

  const mostRecentVisitDate = useMemo(() => {
    const timestamps = filteredSchools.flatMap((school) => {
      const visitDates = Array.isArray(school.visitDates) && school.visitDates.length
        ? school.visitDates
        : school.lastVisitDate
          ? [school.lastVisitDate]
          : [];
      return visitDates
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .map((date) => date.getTime());
    });

    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps)).toISOString().slice(0, 10);
  }, [filteredSchools]);

  const recentVisitedSchools = useMemo(
    () => (mostRecentVisitDate ? filteredSchools.filter((school) => hasVisitOnDate(school, mostRecentVisitDate)) : []),
    [filteredSchools, mostRecentVisitDate]
  );

  const effectiveVisitLabel = filters.selectedDate || 'today';

  const dashboard = useMemo(() => {
    if (!data?.summary) return null;
    const schools = filteredSchools;
    const totalSchools = schools.length;
    const attendanceRate = schools.reduce((sum, school) => sum + school.attendance.rate, 0) / Math.max(totalSchools, 1);
    const presentTeachers = schools.reduce((sum, school) => sum + school.attendance.present, 0);
    const totalTeachers = schools.reduce((sum, school) => sum + school.attendance.total, 0);
    const totalEnrollment = schools.reduce((sum, school) => sum + school.enrollment.total, 0);
    const totalShortage = schools.reduce((sum, school) => sum + school.textbooks.shortage, 0);
    const criticalFlags = schools.filter((school) => school.riskScore >= 80).length;
    const censusReady = schools.filter((school) => school.census.readiness >= 70).length;
    return {
      totalSchools,
      visitedTodayOrSelected: visitedSchoolsOnDate.length,
      recentVisitDate: mostRecentVisitDate,
      recentVisitedSchoolsCount: recentVisitedSchools.length,
      attendanceRate,
      presentTeachers,
      totalTeachers,
      totalEnrollment,
      totalShortage,
      criticalFlags,
      censusReady,
      visitedSchools: visitedSchoolsOnDate
    };
  }, [
    data,
    filteredSchools,
    visitedSchoolsOnDate,
    mostRecentVisitDate,
    recentVisitedSchools.length
  ]);

  const options = data?.options || { talukas: [], levels: [], genders: [], statuses: [] };

  const handleDownloadReport = React.useCallback(() => {
    const reportUrl = buildVisitedSchoolsReportUrl(filters);
    window.open(reportUrl, '_blank', 'noopener,noreferrer');
  }, [filters]);

  const handleDownloadMonitorAssignments = React.useCallback(() => {
    const reportUrl = buildMonitorAssignmentsReportUrl(filters);
    window.open(reportUrl, '_blank', 'noopener,noreferrer');
  }, [filters]);

  const handleDownloadEmployeeAttendance = React.useCallback(() => {
    const reportUrl = buildEmployeeAttendanceReportUrl({
      selectedDate: filters.selectedDate,
      startMonth: attendanceFilters.startMonth,
      endMonth: attendanceFilters.endMonth
    });
    window.open(reportUrl, '_blank', 'noopener,noreferrer');
  }, [filters.selectedDate, attendanceFilters]);

  return (
    <div className="min-h-screen bg-[#ECF2F6] text-slatebrand">
      <div className="sticky top-0 z-40 border-b border-slatebrand/8 bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
          <LogoMark />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                refresh().catch(() => {});
              }}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-full border border-slatebrand/10 bg-white px-4 py-2 text-base font-medium text-slatebrand transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-signal" /> : <RefreshCw className="h-4 w-4 text-signal" />}
              Refresh data
            </button>
            <Link to="/" className="rounded-full border border-slatebrand/10 bg-white px-4 py-2 text-base font-medium text-slatebrand transition hover:-translate-y-px">Landing page</Link>
            <button
              onClick={logout}
              className="rounded-full border border-slatebrand/10 bg-white px-4 py-2 text-base font-medium text-slatebrand transition hover:-translate-y-px"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
        {loading ? (
          <div className="flex items-center justify-center rounded-5xl border border-slatebrand/8 bg-white/70 px-6 py-16 shadow-soft">
            <div className="inline-flex items-center gap-3 text-lg font-medium text-slatebrand"><Loader2 className="h-5 w-5 animate-spin text-signal" /> Loading dashboard data...</div>
          </div>
        ) : error ? (
          <div className="rounded-5xl border border-danger/20 bg-danger/5 p-6 shadow-soft">
            <p className="font-semibold text-danger">{error}</p>
            {/MNE_API_HEADERS_JSON/i.test(error) && (
              <div className="mt-5 rounded-4xl bg-white/80 p-5 text-sm text-slatebrand">
                <p className="font-semibold text-slatebrand">How to connect real live data:</p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-slatebrand/70">
                  <li>Log in to <strong>mne.seld.gos.pk</strong> in your browser</li>
                  <li>Open DevTools (F12) → Network tab → click any <code className="rounded bg-slatebrand/8 px-1">/api/</code> request and copy its headers as a JSON object</li>
                  <li>Paste that JSON into <code className="rounded bg-slatebrand/8 px-1">MNE_API_HEADERS_JSON</code> in your <code className="rounded bg-slatebrand/8 px-1">.env</code> file</li>
                  <li>Restart the server using <code className="rounded bg-slatebrand/8 px-1">npm run dev</code> so new headers are loaded</li>
                </ol>
              </div>
            )}
          </div>
        ) : dashboard ? (
          <>
            <div>
              <FiltersPanel
                filters={filters}
                options={options}
                onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
                onReset={() => setFilters(getInitialFilters())}
              />
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7">
              <StatCard icon={School} label="Schools in view" value={formatNumber(dashboard.totalSchools)} hint="Current filtered school count" />
              <StatCard
                icon={MapPinned}
                label="Visited schools"
                value={formatNumber(dashboard.visitedTodayOrSelected)}
                hint={`Visited on ${filters.selectedDate || 'today'}${Number(filters.daysRange) > 0 ? ` (±${filters.daysRange} days)` : ''}`}
              />
              <StatCard icon={Users} label="Live attendance" value={formatPercent(dashboard.attendanceRate)} hint={`${formatNumber(dashboard.presentTeachers)} present of ${formatNumber(dashboard.totalTeachers)} teachers`} />
              <StatCard icon={AlertTriangle} label="Critical flags" value={formatNumber(dashboard.criticalFlags)} hint="Schools at 80+ composite risk" tone="text-danger" />
              <StatCard icon={GraduationCap} label="Enrollment" value={formatCompact(dashboard.totalEnrollment)} hint="Students across filtered schools" />
              <StatCard icon={BookOpen} label="Textbook gap" value={formatCompact(dashboard.totalShortage)} hint="Requested minus distributed / missing stock" tone="text-warn" />
              <StatCard icon={Building2} label="Census readiness" value={formatPercent((dashboard.censusReady / Math.max(dashboard.totalSchools, 1)) * 100)} hint="Schools with 70+ infrastructure readiness" />
            </div>


            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-5xl border border-slatebrand/8 bg-white/70 px-5 py-4 shadow-soft">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slatebrand/45">Monitor assignments</div>
                  <div className="mt-1 text-sm text-slatebrand/70">All schools assigned to each monitor on the selected date.</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadMonitorAssignments}
                    className="shrink-0 rounded-full border border-slatebrand/10 bg-white px-4 py-2 text-sm font-medium text-slatebrand transition hover:-translate-y-px"
                  >
                    Download monitor assignments PDF
                  </button>
                </div>
              </div>

              <div className="rounded-5xl border border-slatebrand/8 bg-white/70 px-5 py-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slatebrand/45">Employee attendance</div>
                    <div className="mt-1 text-sm text-slatebrand/70">Export attendance independently using a month range. Falls back to the selected date when no month range is set.</div>
                  </div>
                  {(attendanceFilters.startMonth || attendanceFilters.endMonth) && (
                    <button
                      type="button"
                      onClick={() => setAttendanceFilters(getInitialAttendanceFilters())}
                      className="shrink-0 rounded-full border border-slatebrand/10 px-3 py-1.5 text-xs font-medium text-slatebrand/60 transition hover:text-slatebrand hover:-translate-y-px"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-slatebrand/45">Attendance start month</span>
                    <input
                      type="month"
                      value={attendanceFilters.startMonth}
                      onChange={(e) => setAttendanceFilters((prev) => ({ ...prev, startMonth: e.target.value }))}
                      className="w-full rounded-2xl border border-slatebrand/10 bg-white px-4 py-3 outline-none focus:border-signal"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-slatebrand/45">Attendance end month</span>
                    <input
                      type="month"
                      value={attendanceFilters.endMonth}
                      onChange={(e) => setAttendanceFilters((prev) => ({ ...prev, endMonth: e.target.value }))}
                      className="w-full rounded-2xl border border-slatebrand/10 bg-white px-4 py-3 outline-none focus:border-signal"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadEmployeeAttendance}
                    className="shrink-0 rounded-full border border-slatebrand/10 bg-slatebrand/5 px-4 py-2 text-sm font-medium text-slatebrand transition hover:-translate-y-px"
                  >
                    Download employee attendance workbook
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-6">
              <VisitedSchoolsTable
                schools={dashboard.visitedSchools}
                onPickSchool={setSelectedSchool}
                onDownloadReport={handleDownloadReport}
              />
            </div>

          </>
        ) : null}
      </div>
      <SchoolDetailDialog school={selectedSchool} selectedDate={filters.selectedDate} daysRange={Number(filters.daysRange)} onClose={() => setSelectedSchool(null)} />
    </div>
  );
}
