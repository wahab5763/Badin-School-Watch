import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readSchoolRows } from './csv.js';
import { buildLiveDashboard, fetchSchoolVisitDetail, buildHeaders } from './mneAdapter.js';
import {
  buildMonitorAssignmentSummaryPdfWithAssignments,
  buildVisitedSchoolsReportPdf,
  parseVisitedSchoolsReportFilters
} from './visitedSchoolsReport.js';
import { buildEmployeeAttendanceReportWorkbook } from './attendanceReport.js';
import { fetchAssignedSchoolsForDate } from './assignmentsAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const app = express();
const port = Number(process.env.PORT || 8787);
const projectRoot = path.resolve(__dirname, '..');
const csvPath = path.resolve(projectRoot, process.env.SCHOOL_DATA_PATH || './school_data.csv');
const academicYear = {
  start: process.env.ACADEMIC_YEAR_START || '2025-04-01',
  end: process.env.ACADEMIC_YEAR_END || '2026-03-31',
  label: `${process.env.ACADEMIC_YEAR_START || '2025-04-01'} → ${process.env.ACADEMIC_YEAR_END || '2026-03-31'}`
};
const academicYearMonths = [
  { month: '2025-04' }, { month: '2025-05' }, { month: '2025-06' }, { month: '2025-07' },
  { month: '2025-08' }, { month: '2025-09' }, { month: '2025-10' }, { month: '2025-11' },
  { month: '2025-12' }, { month: '2026-01' }, { month: '2026-02' }, { month: '2026-03' }
];
let latestPayload = null;
let activeRefreshPromise = null;

// ── Background monthly-attendance prefetch ────────────────────────────────────
// After each dashboard load, all per-month attendance is fetched concurrently
// and stored on school.monthlyAttendance so the report endpoint has zero API
// calls to make.

let monthlyAttendancePrefetchPromise = null;
let monthlyAttendancePrefetchStartedAt = 0;

async function fetchOneMid(mid, headers, base) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const url = `${base}//Schools/GetTeachersAttendanceByMonitoringId?MonitoringId=${mid}`;
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.Data) ? json.Data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function runMonthlyAttendancePrefetch(payload) {
  const headers = buildHeaders();
  const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');
  if (!Object.keys(headers).length || !Array.isArray(payload?.schools)) return;

  // Collect unique monitoring IDs across all schools for all academic year months
  const midSet = new Set();
  const assignments = []; // { schoolIdx, month, mid }

  for (let si = 0; si < payload.schools.length; si++) {
    const history = Array.isArray(payload.schools[si].visitHistory) ? payload.schools[si].visitHistory : [];
    for (const { month } of academicYearMonths) {
      const visit = history.find((v) => String(v.date || '').slice(0, 7) === month);
      if (visit?.monitoringId) {
        midSet.add(visit.monitoringId);
        assignments.push({ schoolIdx: si, month, mid: visit.monitoringId });
      }
    }
  }

  const mids = [...midSet];
  if (mids.length === 0) return;

  // Fetch concurrently in batches of 50
  const attByMid = new Map();
  const concurrency = 50;
  for (let i = 0; i < mids.length; i += concurrency) {
    const batch = mids.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((mid) => fetchOneMid(mid, headers, base)));
    batch.forEach((mid, j) => attByMid.set(mid, results[j]));
  }

  // Write results into latestPayload.schools in place
  if (latestPayload?.schools) {
    for (const { schoolIdx, month, mid } of assignments) {
      const school = latestPayload.schools[schoolIdx];
      if (school) {
        if (!school.monthlyAttendance) school.monthlyAttendance = {};
        if (attByMid.has(mid)) school.monthlyAttendance[month] = attByMid.get(mid);
      }
    }
  }
}

function triggerMonthlyAttendancePrefetch(payload) {
  if (monthlyAttendancePrefetchPromise) return;
  monthlyAttendancePrefetchStartedAt = Date.now();
  monthlyAttendancePrefetchPromise = runMonthlyAttendancePrefetch(payload)
    .catch((err) => console.error('[prefetch] monthly attendance failed:', err?.message))
    .finally(() => { monthlyAttendancePrefetchPromise = null; });
}

// ─────────────────────────────────────────────────────────────────────────────

async function refreshLiveData() {
  if (activeRefreshPromise) return activeRefreshPromise;

  // Re-read CSV every time so schools added after server startup are included.
  const schoolRows = readSchoolRows(csvPath);

  activeRefreshPromise = buildLiveDashboard(schoolRows, academicYear, academicYearMonths)
    .then((payload) => {
      latestPayload = payload;
      // Reset and restart background prefetch whenever fresh data arrives
      monthlyAttendancePrefetchPromise = null;
      triggerMonthlyAttendancePrefetch(payload);
      return payload;
    })
    .finally(() => {
      activeRefreshPromise = null;
    });

  return activeRefreshPromise;
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  const currentRows = readSchoolRows(csvPath);
  res.json({ ok: true, schools: currentRows.length });
});

// Strip server-only fields before sending to the client
function toClientPayload(payload) {
  if (!payload) return payload;
  return {
    ...payload,
    schools: (payload.schools || []).map(({ monthlyAttendance, visitHistory, ...rest }) => rest)
  };
}

app.get('/api/dashboard', async (_req, res) => {
  try {
    const currentRows = readSchoolRows(csvPath);
    const payloadRequestedSchools = Number(latestPayload?.liveDiagnostics?.requestedSchools || 0);
    const rowsChanged = payloadRequestedSchools !== currentRows.length;

    if (!latestPayload || rowsChanged) {
      const fresh = await refreshLiveData();
      return res.json(toClientPayload(fresh));
    }
    return res.json(toClientPayload(latestPayload));
  } catch (error) {
    if (latestPayload) {
      const message = error.message || 'Dashboard refresh warning';
      latestPayload.liveDiagnostics = {
        ...(latestPayload.liveDiagnostics || {}),
        warning: message,
        stale: true,
        staleAt: new Date().toISOString()
      };
      return res.json(toClientPayload(latestPayload));
    }
    return res.status(500).json({ error: error.message || 'Dashboard error' });
  }
});

app.post('/api/dashboard/refresh', async (_req, res) => {
  try {
    const fresh = await refreshLiveData();
    return res.json(toClientPayload(fresh));
  } catch (error) {
    if (latestPayload) {
      const message = error.message || 'Dashboard refresh warning';
      latestPayload.liveDiagnostics = {
        ...(latestPayload.liveDiagnostics || {}),
        warning: message,
        stale: true,
        staleAt: new Date().toISOString()
      };
      return res.json(toClientPayload(latestPayload));
    }
    return res.status(500).json({ error: error.message || 'Dashboard error' });
  }
});

app.get('/api/schools/:schoolId/detail', async (req, res) => {
  try {
    const { schoolId } = req.params;
    const targetDate = String(req.query.date || '').trim();
    const daysRange = Number(req.query.daysRange || 0);
    const currentRows = readSchoolRows(csvPath);
    const row = currentRows.find((item) => String(item.schoolId) === String(schoolId));

    if (!row) {
      return res.status(404).json({ error: `School ${schoolId} not found.` });
    }

    if (!targetDate) {
      return res.status(400).json({ error: 'Query parameter date is required.' });
    }

    const detail = await fetchSchoolVisitDetail(row, academicYear, academicYearMonths, targetDate, daysRange);
    return res.json(detail);
  } catch (error) {
    const message = error.message || 'School detail error';
    const status = /not found/i.test(message) ? 404 : 500;
    return res.status(status).json({ error: message });
  }
});

app.get('/api/reports/visited-schools.pdf', async (req, res) => {
  try {
    const currentRows = readSchoolRows(csvPath);
    const payloadRequestedSchools = Number(latestPayload?.liveDiagnostics?.requestedSchools || 0);
    const rowsChanged = payloadRequestedSchools !== currentRows.length;

    const payload = (!latestPayload || rowsChanged)
      ? await refreshLiveData()
      : latestPayload;

    const filters = parseVisitedSchoolsReportFilters(req.query || {});
    const pdfBuffer = await buildVisitedSchoolsReportPdf(payload, filters);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `visited-schools-roster-${filters.selectedDate || stamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Report generation error' });
  }
});

app.get('/api/reports/monitor-assignments.pdf', async (req, res) => {
  try {
    const currentRows = readSchoolRows(csvPath);
    const payloadRequestedSchools = Number(latestPayload?.liveDiagnostics?.requestedSchools || 0);
    const rowsChanged = payloadRequestedSchools !== currentRows.length;

    const payload = (!latestPayload || rowsChanged)
      ? await refreshLiveData()
      : latestPayload;

    const filters = parseVisitedSchoolsReportFilters(req.query || {});
    let assignmentRows = [];
    let assignmentFetchError = '';
    try {
      assignmentRows = await fetchAssignedSchoolsForDate(filters.selectedDate, filters);
    } catch (fetchErr) {
      assignmentFetchError = fetchErr.message || 'Could not fetch assignment data from API.';
    }
    const pdfBuffer = await buildMonitorAssignmentSummaryPdfWithAssignments(payload, filters, assignmentRows, assignmentFetchError);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `monitor-assignments-${filters.selectedDate || stamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Report generation error' });
  }
});

app.get('/api/reports/employee-attendance.xlsx', async (req, res) => {
  try {
    const currentRows = readSchoolRows(csvPath);
    const payloadRequestedSchools = Number(latestPayload?.liveDiagnostics?.requestedSchools || 0);
    const rowsChanged = payloadRequestedSchools !== currentRows.length;

    const payload = (!latestPayload || rowsChanged)
      ? await refreshLiveData()
      : latestPayload;

    // If the background prefetch hasn't finished yet, wait for it so that all
    // months' attendance data is available before building the workbook.
    // If the prefetch already completed (promise is null), proceed immediately.
    if (monthlyAttendancePrefetchPromise) {
      try { await monthlyAttendancePrefetchPromise; } catch (e) {
        console.warn('[report] prefetch wait error:', e?.message);
      }
    }

    const workbookBuffer = await buildEmployeeAttendanceReportWorkbook(payload, req.query || {});

    const stamp = new Date().toISOString().slice(0, 10);
    const startMonth = String(req.query.startMonth || '').trim();
    const endMonth = String(req.query.endMonth || '').trim();
    const rangeLabel = startMonth
      ? endMonth && endMonth !== startMonth ? `${startMonth}-to-${endMonth}` : startMonth
      : '';
    const filename = `employee-attendance-${rangeLabel || stamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(workbookBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Report generation error' });
  }
});

async function syncLiveAndExit() {
  try {
    const schoolRows = readSchoolRows(csvPath);
    const live = await buildLiveDashboard(schoolRows, academicYear, academicYearMonths);
    console.log(`Live sync complete: ${live.schools.length} schools loaded.`);
    process.exit(0);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

if (process.argv.includes('--sync-live')) {
  syncLiveAndExit();
} else if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(port, () => {
    console.log(`Badin School Watch server listening on http://localhost:${port}`);
  });
}
