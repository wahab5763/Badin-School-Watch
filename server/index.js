import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readMonitorAssignmentDistrictsFromCsv, readSchoolRows } from './csv.js';
import { buildLiveDashboard, fetchSchoolVisitDetail, buildHeaders } from './mneAdapter.js';
import {
  buildMonitorAssignmentSummaryPdfWithAssignments,
  buildVisitedSchoolsReportPdf,
  parseVisitedSchoolsReportFilters
} from './visitedSchoolsReport.js';
import { buildEmployeeAttendanceReportWorkbook } from './attendanceReport.js';
import { buildMonitorPerformanceWorkbook } from './monitorPerformanceReport.js';
import { fetchAssignedSchoolsForDate, fetchAssignedSchoolsForMonth } from './assignmentsAdapter.js';

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

// In-memory cache of live visit-date lookups, keyed by schoolId. Large districts can
// have 900+ assigned schools per month, so caching avoids re-hitting the live API for
// every report request (which previously made the endpoint too slow to finish before
// a short timeout silently discarded all results — see fetchSchoolVisitDatesForAssignments).
const schoolVisitsCache = new Map(); // schoolId -> { fetchedAt, record }
const schoolVisitsCacheTtlMs = Math.max(60000, Number(process.env.MNE_API_SCHOOL_VISITS_CACHE_TTL_MS || 6 * 60 * 60 * 1000));

async function fetchSchoolVisitDatesForAssignments(assignmentRows = [], options = {}) {
  const headers = buildHeaders();
  const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');

  if (!Object.keys(headers).length || !Array.isArray(assignmentRows) || !assignmentRows.length) {
    return [];
  }

  const uniqueSchoolIds = [...new Set(assignmentRows
    .map((row) => String(row?.schoolId || row?.School_ID || row?.school_id || '').trim())
    .filter(Boolean))];

  if (!uniqueSchoolIds.length) {
    return [];
  }

  // Stop starting new fetches past this point so large multi-district requests still
  // return whatever was gathered in time instead of the caller discarding everything.
  const deadlineAt = Number(options.deadlineAt) || (Date.now() + 240000);
  const timeoutMs = Math.max(8000, Number(process.env.MNE_API_REPORT_TIMEOUT_MS || 15000));
  // Only the visits endpoint is required — school name/semis/district already come
  // from the assignment row, so skip the extra GetSchoolById call per school to
  // roughly halve the number of live requests needed for large districts.
  const concurrency = Math.max(2, Math.min(24, Number(process.env.MNE_API_REPORT_CONCURRENCY || process.env.MNE_API_CONCURRENCY || 12)));

  const now = Date.now();
  const schoolRecords = [];
  const idsToFetch = [];

  uniqueSchoolIds.forEach((schoolId) => {
    const cached = schoolVisitsCache.get(schoolId);
    if (cached && (now - cached.fetchedAt) < schoolVisitsCacheTtlMs) {
      schoolRecords.push(cached.record);
    } else {
      idsToFetch.push(schoolId);
    }
  });

  let index = 0;

  async function worker() {
    while (index < idsToFetch.length) {
      if (Date.now() >= deadlineAt) return;
      const currentIndex = index;
      index += 1;
      const schoolId = idsToFetch[currentIndex];
      const rowMatch = assignmentRows.find((row) => String(row?.schoolId || row?.School_ID || row?.school_id || '').trim() === schoolId) || {};

      try {
        const controller = new AbortController();
        // Clamp to whatever time is actually left so one slow request can't eat
        // into the remaining budget for the rest of the batch.
        const attemptTimeoutMs = Math.max(1000, Math.min(timeoutMs, deadlineAt - Date.now()));
        const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);

        const visitsResult = await fetch(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${schoolId}`, { headers, signal: controller.signal }).then(async (response) => {
          if (!response.ok) throw new Error(`Visits fetch failed ${response.status}`);
          return response.json();
        }).catch(() => null);

        clearTimeout(timeout);

        const visitsData = visitsResult?.Data || [];
        const visitDates = [...new Set((visitsData || [])
          .map((visit) => String(visit?.Monitoring_Start_Date || '').slice(0, 10))
          .filter(Boolean))];

        const record = {
          schoolId,
          schoolName: rowMatch.schoolName || `School ${schoolId}`,
          semis: rowMatch.semis || '',
          district: rowMatch.district || '',
          visitDates
        };

        schoolRecords.push(record);
        // Only cache successful lookups so a transient failure gets retried next time.
        if (visitsResult) {
          schoolVisitsCache.set(schoolId, { fetchedAt: Date.now(), record });
        }
      } catch {
        // Ignore individual fetch failures so the export still returns for the selected district.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, idsToFetch.length) }, () => worker()));
  return schoolRecords;
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

  const districtList = readMonitorAssignmentDistrictsFromCsv(process.env.MNE_API_USERIDS_CSV_PATH || './public/MA_userIds.csv');
  const schoolDistricts = [...new Set((payload.schools || []).map((school) => school.district).filter(Boolean))].sort();
  const mergedDistricts = [...new Set([...districtList, ...schoolDistricts])].sort((a, b) => a.localeCompare(b));

  return {
    ...payload,
    districts: mergedDistricts,
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

app.get('/api/districts', (_req, res) => {
  try {
    const csvDistricts = readMonitorAssignmentDistrictsFromCsv(process.env.MNE_API_USERIDS_CSV_PATH || './public/MA_userIds.csv');
    const payloadDistricts = Array.isArray(latestPayload?.districts) ? latestPayload.districts : [];
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    const merged = [...new Set([...csvDistricts, ...payloadDistricts])].sort((a, b) => collator.compare(a, b));
    return res.json({ districts: merged });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'District list error' });
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

app.get('/api/reports/monitor-performance.xlsx', async (req, res) => {
  // Shared clock so the assignment fetch and the per-school visit fetch together stay
  // under the proxy/browser budget instead of each getting the full budget independently.
  const requestDeadlineAt = Date.now() + Math.max(15000, Number(process.env.MNE_API_REPORT_RACE_TIMEOUT_MS || 150000));
  try {
    const currentRows = readSchoolRows(csvPath);
    const payloadRequestedSchools = Number(latestPayload?.liveDiagnostics?.requestedSchools || 0);
    const rowsChanged = payloadRequestedSchools !== currentRows.length;

    const payload = (!latestPayload || rowsChanged)
      ? await refreshLiveData()
      : latestPayload;

    const month = String(req.query.month || req.query.selectedMonth || new Date().toISOString().slice(0, 7)).trim();
    const districtFilters = parseVisitedSchoolsReportFilters(req.query || {});
    let assignmentRows = [];
    let noDataReason = '';

    if (month) {
      const assignmentStartedAt = Date.now();
      try {
        // Reserve roughly half the remaining budget for the assignment lookup so the
        // per-school visit fetch that follows still has a meaningful window left,
        // even when many districts/monitors are selected at once.
        const assignmentDeadlineAt = Date.now() + Math.round((requestDeadlineAt - Date.now()) * 0.5);
        assignmentRows = await fetchAssignedSchoolsForMonth(month, { ...districtFilters, deadlineAt: assignmentDeadlineAt });
      } catch (error) {
        assignmentRows = [];
        noDataReason = error?.message || 'Live monitor data could not be fetched for the selected month.';
      }
      console.log(`[monitor-performance] assignment fetch: ${assignmentRows.length} rows in ${Date.now() - assignmentStartedAt}ms`);
    }

    let effectiveSchools = Array.isArray(payload?.schools) ? payload.schools : [];
    if (assignmentRows.length && payload?.schools?.length < 5000) {
      // Badin schools already have visit dates from the CSV/academic-year sync in
      // payload.schools, so skip re-fetching them live — otherwise a mixed selection
      // (e.g. Badin + another district) wastes the whole time budget re-fetching
      // hundreds of Badin schools that were never missing data in the first place,
      // leaving no time left for the districts that actually need the live lookup.
      const knownSchoolIds = new Set((effectiveSchools || []).map((s) => String(s?.schoolId || '').trim()).filter(Boolean));
      const knownSemis = new Set((effectiveSchools || []).map((s) => String(s?.semis || '').trim()).filter(Boolean));
      const rowsNeedingLiveFetch = assignmentRows.filter((row) => {
        const schoolId = String(row?.schoolId || '').trim();
        const semis = String(row?.semis || '').trim();
        return !(schoolId && knownSchoolIds.has(schoolId)) && !(semis && knownSemis.has(semis));
      });

      // Non-Badin districts have no CSV-backed schools, so their visit dates rely
      // entirely on this live fetch. Districts with hundreds of assigned schools (or
      // "select all districts") can take minutes on the first request (subsequent
      // requests are much faster thanks to the in-memory cache). The old approach
      // raced the fetch against a timeout and threw away ALL progress when it lost,
      // which both showed 0 visits and — once the budget exceeded the Vite dev proxy's
      // own timeout — caused the browser to see ERR_EMPTY_RESPONSE. Now the fetch itself
      // stops at the deadline and returns whatever it already gathered.
      const visitsStartedAt = Date.now();
      try {
        const liveSchoolRecords = await fetchSchoolVisitDatesForAssignments(rowsNeedingLiveFetch, { deadlineAt: requestDeadlineAt });
        effectiveSchools = [...effectiveSchools, ...(Array.isArray(liveSchoolRecords) ? liveSchoolRecords : [])];
        console.log(`[monitor-performance] visits fetch: ${rowsNeedingLiveFetch.length} candidate schools, ${liveSchoolRecords.length} records in ${Date.now() - visitsStartedAt}ms`);
      } catch (error) {
        console.log(`[monitor-performance] visits fetch failed after ${Date.now() - visitsStartedAt}ms: ${error?.message}`);
        effectiveSchools = Array.isArray(payload?.schools) ? payload.schools : [];
      }
    }

    const workbookBuffer = await buildMonitorPerformanceWorkbook({
      ...payload,
      schools: effectiveSchools
    }, {
      month,
      districts: districtFilters.districts
    }, assignmentRows, noDataReason);

    const filename = `monitor-performance-${month || new Date().toISOString().slice(0, 7)}.xlsx`;

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
