import PDFDocument from 'pdfkit';

function parseNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeFilterValue(value, fallback = 'all') {
  const next = String(value || '').trim();
  return next || fallback;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function matchesFilter(value, selected) {
  return selected === 'all' || String(value || '') === selected;
}

function schoolVisitDates(school) {
  const visits = Array.isArray(school?.visitDates) && school.visitDates.length
    ? school.visitDates
    : school?.lastVisitDate
      ? [school.lastVisitDate]
      : [];

  return visits.filter(Boolean);
}

function dateOnlyIso(value) {
  return String(value || '').slice(0, 10);
}

function visitInRange(visitDateValue, selectedDate, daysRange = 0) {
  if (!visitDateValue || !selectedDate) return false;

  if (Number(daysRange) === 0) {
    return dateOnlyIso(visitDateValue) === selectedDate;
  }

  const visitDate = new Date(`${dateOnlyIso(visitDateValue)}T00:00:00Z`);
  const targetDate = new Date(`${selectedDate}T00:00:00Z`);

  if (Number.isNaN(visitDate.getTime()) || Number.isNaN(targetDate.getTime())) return false;

  const diffInDays = Math.round(Math.abs(visitDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffInDays <= Number(daysRange);
}

function filterAssignmentRowsByDate(rows, selectedDate, daysRange = 0) {
  if (!Array.isArray(rows) || !selectedDate) return Array.isArray(rows) ? rows : [];

  return rows.filter((row) => visitInRange(row.assignedDate, selectedDate, daysRange));
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTimeWithPeriod(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function textLine(doc, text, opts = {}) {
  const fontSize = opts.fontSize || 10;
  const gapAfter = opts.gapAfter ?? 6;
  const font = opts.font || 'Helvetica';
  doc.font(font).fontSize(fontSize).fillColor(opts.color || '#0f172a').text(text, { continued: false });
  doc.moveDown(gapAfter / 12);
}

function ensureSpace(doc, neededHeight = 18) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
  }
}

function formatAssignedSchoolEntry(school) {
  const semisText = school.semis ? `[${school.semis}] ` : '';
  const talukaText = school.taluka ? ` (${school.taluka})` : '';
  return `${semisText}${school.schoolName || 'Unknown school'}${talukaText}`;
}

function getAbsentEmployeeNames(school) {
  const teachers = Array.isArray(school?.attendance?.teachers) ? school.attendance.teachers : [];
  return teachers
    .filter((teacher) => !teacher?.present && !teacher?.leaveType)
    .map((teacher) => String(teacher?.name || '').trim())
    .filter(Boolean);
}

export function parseVisitedSchoolsReportFilters(query = {}) {
  return {
    taluka: normalizeFilterValue(query.taluka),
    level: normalizeFilterValue(query.level),
    gender: normalizeFilterValue(query.gender),
    status: normalizeFilterValue(query.status),
    selectedDate: normalizeFilterValue(query.selectedDate, formatDateInput(new Date())),
    daysRange: Math.max(0, parseNumber(query.daysRange, 0)),
    minRisk: Math.max(0, parseNumber(query.minRisk, 0))
  };
}

export function buildVisitedSchoolsReportData(payload, filters) {
  const schools = Array.isArray(payload?.schools) ? payload.schools : [];

  const filteredSchools = schools.filter((school) => (
    matchesFilter(school.taluka, filters.taluka)
    && matchesFilter(school.level, filters.level)
    && matchesFilter(school.gender, filters.gender)
    && matchesFilter(school.schoolStatus, filters.status)
    && Number(school.riskScore || 0) >= Number(filters.minRisk || 0)
  ));

  const visitedSchools = filteredSchools
    .map((school) => {
      const matchingVisits = schoolVisitDates(school).filter((visitDate) => (
        visitInRange(visitDate, filters.selectedDate, filters.daysRange)
      ));

      return {
        school,
        matchingVisits: matchingVisits.sort((a, b) => new Date(a) - new Date(b))
      };
    })
    .filter((entry) => entry.matchingVisits.length > 0)
    .sort((a, b) => {
      const monitorA = String(a.school?.monitor?.name || '').toLowerCase();
      const monitorB = String(b.school?.monitor?.name || '').toLowerCase();
      if (monitorA !== monitorB) return monitorA.localeCompare(monitorB);
      return String(a.school?.schoolName || '').localeCompare(String(b.school?.schoolName || ''));
    });

  const monitorMap = new Map();

  visitedSchools.forEach(({ school, matchingVisits }) => {
    const monitorName = String(school?.monitor?.name || 'Unknown monitor');
    const existing = monitorMap.get(monitorName) || {
      monitorName,
      monitorId: school?.monitor?.id || 'N/A',
      schoolCount: 0,
      visitCount: 0,
      schools: []
    };

    existing.schoolCount += 1;
    existing.visitCount += matchingVisits.length;
    existing.schools.push({
      schoolName: school.schoolName,
      schoolId: school.schoolId,
      semis: school.semis,
      taluka: school.taluka,
      visits: matchingVisits,
      absentEmployees: getAbsentEmployeeNames(school)
    });

    monitorMap.set(monitorName, existing);
  });

  const monitorSummaries = [...monitorMap.values()].sort((a, b) => {
    if (b.schoolCount !== a.schoolCount) return b.schoolCount - a.schoolCount;
    if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
    return a.monitorName.localeCompare(b.monitorName);
  });

  const totalVisitsInPeriod = visitedSchools.reduce((sum, item) => sum + item.matchingVisits.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    filters,
    visitedSchools,
    monitorSummaries,
    totals: {
      filteredSchools: filteredSchools.length,
      visitedSchools: visitedSchools.length,
      uniqueMonitors: monitorSummaries.length,
      totalVisitsInPeriod
    }
  };
}

export function buildVisitedSchoolsReportPdf(payload, filters) {
  const report = buildVisitedSchoolsReportData(payload, filters);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    textLine(doc, 'Visited Schools Roster', { font: 'Helvetica-Bold', fontSize: 20, gapAfter: 2, color: '#111827' });
    textLine(doc, 'Schools visited in selected period', { fontSize: 12, gapAfter: 10, color: '#334155' });

    textLine(doc, `Generated: ${formatDateTime(report.generatedAt)}`, { fontSize: 9, gapAfter: 2, color: '#475569' });
    textLine(doc, `Period: ${report.filters.selectedDate}${Number(report.filters.daysRange) > 0 ? ` (±${report.filters.daysRange} days)` : ''}`, { fontSize: 9, gapAfter: 2, color: '#475569' });
    textLine(doc, `Filters: taluka=${report.filters.taluka}, level=${report.filters.level}, gender=${report.filters.gender}, status=${report.filters.status}, minRisk=${report.filters.minRisk}`, { fontSize: 9, gapAfter: 10, color: '#475569' });

    textLine(doc, 'Summary', { font: 'Helvetica-Bold', fontSize: 12, gapAfter: 4 });
    textLine(doc, `Schools in filtered scope: ${report.totals.filteredSchools}`, { fontSize: 10, gapAfter: 1 });
    textLine(doc, `Visited schools in period: ${report.totals.visitedSchools}`, { fontSize: 10, gapAfter: 1 });
    textLine(doc, `Unique monitors in period: ${report.totals.uniqueMonitors}`, { fontSize: 10, gapAfter: 1 });
    textLine(doc, `Total visits in period: ${report.totals.totalVisitsInPeriod}`, { fontSize: 10, gapAfter: 10 });

    textLine(doc, 'Monitor Summary', { font: 'Helvetica-Bold', fontSize: 12, gapAfter: 4 });
    if (!report.monitorSummaries.length) {
      textLine(doc, 'No visits found for the selected period and filters.', { fontSize: 10, gapAfter: 10, color: '#64748b' });
    } else {
      report.monitorSummaries.forEach((monitor, index) => {
        ensureSpace(doc, 24);
        textLine(
          doc,
          `${index + 1}. ${monitor.monitorName} (${monitor.monitorId}) - ${monitor.schoolCount} schools, ${monitor.visitCount} visits`,
          { fontSize: 10, gapAfter: 1, color: '#1e293b' }
        );
      });
      doc.moveDown(0.4);
    }

    textLine(doc, 'Detailed Schools By Monitor', { font: 'Helvetica-Bold', fontSize: 12, gapAfter: 4 });
    if (!report.monitorSummaries.length) {
      textLine(doc, 'No detailed rows available.', { fontSize: 10, color: '#64748b' });
    } else {
      report.monitorSummaries.forEach((monitor) => {
        ensureSpace(doc, 28);
        textLine(doc, `${monitor.monitorName} (${monitor.monitorId})`, { font: 'Helvetica-Bold', fontSize: 11, gapAfter: 2, color: '#0f172a' });

        monitor.schools.forEach((school, idx) => {
          ensureSpace(doc, 34);
          textLine(
            doc,
            `${idx + 1}. [${school.semis || 'N/A'}] ${school.schoolName} (${school.taluka || 'N/A'})`,
            { fontSize: 9, gapAfter: 1, color: '#1e293b' }
          );

          const absentText = school.absentEmployees.length
            ? school.absentEmployees.join(', ')
            : 'None';
          textLine(doc, `   Absent employees: ${absentText}`, { fontSize: 9, gapAfter: 1, color: '#7c2d12' });

          school.visits.forEach((visitDate) => {
            ensureSpace(doc, 16);
            textLine(doc, `   Visit time: ${formatDateTime(visitDate)}`, { fontSize: 9, gapAfter: 1, color: '#475569' });
          });
        });

        doc.moveDown(0.25);
      });
    }

    doc.end();
  });
}

export function buildMonitorAssignmentSummaryPdf(payload, filters) {
  const report = buildVisitedSchoolsReportData(payload, filters);

  return buildMonitorAssignmentSummaryPdfWithAssignments(payload, filters, []);
}

function buildAssignmentReportData(payload, filters, assignmentRows = []) {
  const normalizedRows = Array.isArray(assignmentRows) ? assignmentRows : [];
  const visitedReport = buildVisitedSchoolsReportData(payload, filters);

  const assignmentRowsByDate = filterAssignmentRowsByDate(normalizedRows, filters.selectedDate, filters.daysRange);
  const visitedBySchoolKey = new Set();
  visitedReport.visitedSchools.forEach(({ school }) => {
    if (school?.schoolId) visitedBySchoolKey.add(`id:${school.schoolId}`);
    if (school?.semis) visitedBySchoolKey.add(`semis:${school.semis}`);
  });

  const filteredAssignments = assignmentRowsByDate.filter((row) => {
    const talukaMatch = filters.taluka === 'all' || String(row.taluka || '') === String(filters.taluka || '');
    return talukaMatch;
  });

  const monitorMap = new Map();
  filteredAssignments.forEach((row) => {
    const monitorName = String(row.monitorName || 'Unknown monitor');
    const key = `${monitorName}|${String(row.monitorId || 'N/A')}`;

    const existing = monitorMap.get(key) || {
      monitorName,
      monitorId: row.monitorId || 'N/A',
      schools: []
    };

    const schoolKey = row.schoolId ? `id:${row.schoolId}` : row.semis ? `semis:${row.semis}` : `name:${row.schoolName}`;
    const isVisited = visitedBySchoolKey.has(`id:${row.schoolId}`) || visitedBySchoolKey.has(`semis:${row.semis}`);

    if (!existing.schools.some((school) => school.key === schoolKey)) {
      existing.schools.push({
        key: schoolKey,
        schoolName: row.schoolName,
        schoolId: row.schoolId,
        semis: row.semis,
        taluka: row.taluka,
        assignedDate: row.assignedDate,
        visited: isVisited
      });
    }

    monitorMap.set(key, existing);
  });

  const monitorSummaries = [...monitorMap.values()]
    .map((entry) => {
      const assignedSchools = entry.schools.length;
      const visitedAssignedSchools = entry.schools.filter((school) => school.visited).length;
      return {
        ...entry,
        assignedSchools,
        visitedAssignedSchools,
        notVisitedAssignedSchools: Math.max(0, assignedSchools - visitedAssignedSchools)
      };
    })
    .sort((a, b) => {
      if (b.assignedSchools !== a.assignedSchools) return b.assignedSchools - a.assignedSchools;
      return a.monitorName.localeCompare(b.monitorName);
    });

  return {
    generatedAt: new Date().toISOString(),
    filters,
    monitorSummaries,
    totals: {
      assignedSchools: monitorSummaries.reduce((sum, monitor) => sum + monitor.assignedSchools, 0),
      uniqueMonitors: monitorSummaries.length,
      visitedAssignedSchools: monitorSummaries.reduce((sum, monitor) => sum + monitor.visitedAssignedSchools, 0)
    }
  };
}

export function buildMonitorAssignmentSummaryPdfWithAssignments(payload, filters, assignmentRows = [], fetchError = '') {
  const report = buildAssignmentReportData(payload, filters, assignmentRows);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    textLine(doc, 'Monitor Assignment Summary', { font: 'Helvetica-Bold', fontSize: 20, gapAfter: 2, color: '#111827' });
    textLine(doc, 'Total assigned schools per monitor for selected date/period', { fontSize: 12, gapAfter: 10, color: '#334155' });

    textLine(doc, `Generated: ${formatDateTimeWithPeriod(report.generatedAt)}`, { fontSize: 9, gapAfter: 2, color: '#475569' });
    textLine(doc, `Selected Date: ${report.filters.selectedDate}${Number(report.filters.daysRange) > 0 ? ` (±${report.filters.daysRange} days)` : ''}`, { fontSize: 9, gapAfter: 2, color: '#475569' });
    textLine(doc, `Filters: taluka=${report.filters.taluka}, level=${report.filters.level}, gender=${report.filters.gender}, status=${report.filters.status}, minRisk=${report.filters.minRisk}`, { fontSize: 9, gapAfter: fetchError ? 4 : 10, color: '#475569' });

    if (fetchError) {
      textLine(doc, `Assignment API note: ${fetchError}`, { fontSize: 9, gapAfter: 10, color: '#7c2d12' });
    }

    textLine(doc, 'Summary', { font: 'Helvetica-Bold', fontSize: 12, gapAfter: 4 });
    textLine(doc, `Total assigned schools: ${report.totals.assignedSchools}`, { fontSize: 10, gapAfter: 1 });
    textLine(doc, `Unique monitors in period: ${report.totals.uniqueMonitors}`, { fontSize: 10, gapAfter: 1 });
    textLine(doc, `Assigned schools visited in period: ${report.totals.visitedAssignedSchools}`, { fontSize: 10, gapAfter: 10 });

    textLine(doc, 'School List Per Monitor', { font: 'Helvetica-Bold', fontSize: 11, gapAfter: 3 });
    if (!report.monitorSummaries.length) {
      textLine(doc, 'No monitor assignment data found for the selected period and filters.', { fontSize: 10, gapAfter: 4, color: '#64748b' });
    } else {
      report.monitorSummaries.forEach((monitor) => {
        ensureSpace(doc, 24);
        textLine(
          doc,
          `${monitor.monitorName} - assigned: ${monitor.assignedSchools}, visited: ${monitor.visitedAssignedSchools}, not visited: ${monitor.notVisitedAssignedSchools}`,
          { font: 'Helvetica-Bold', fontSize: 10, gapAfter: 1, color: '#0f172a' }
        );
        monitor.schools.forEach((school, idx) => {
          ensureSpace(doc, 16);
          const vis = school.visited ? 'Visited' : 'Not visited';
          textLine(
            doc,
            `${idx + 1}. ${formatAssignedSchoolEntry(school)} - ${vis}`,
            { fontSize: 9, gapAfter: 1, color: school.visited ? '#166534' : '#7f1d1d' }
          );
        });
        doc.moveDown(0.2);
      });
    }

    doc.end();
  });
}
