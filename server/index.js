import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readSchoolRows } from './csv.js';
import { buildLiveDashboard, fetchSchoolVisitDetail } from './mneAdapter.js';
import {
  buildMonitorAssignmentSummaryPdfWithAssignments,
  buildVisitedSchoolsReportPdf,
  parseVisitedSchoolsReportFilters
} from './visitedSchoolsReport.js';
import { fetchAssignedSchoolsForDate } from './assignmentsAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
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

async function refreshLiveData() {
  if (activeRefreshPromise) return activeRefreshPromise;

  // Re-read CSV every time so schools added after server startup are included.
  const schoolRows = readSchoolRows(csvPath);

  activeRefreshPromise = buildLiveDashboard(schoolRows, academicYear, academicYearMonths)
    .then((payload) => {
      latestPayload = payload;
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

app.get('/api/dashboard', async (_req, res) => {
  try {
    const currentRows = readSchoolRows(csvPath);
    const payloadRequestedSchools = Number(latestPayload?.liveDiagnostics?.requestedSchools || 0);
    const rowsChanged = payloadRequestedSchools !== currentRows.length;

    if (!latestPayload || rowsChanged) {
      const fresh = await refreshLiveData();
      return res.json(fresh);
    }
    return res.json(latestPayload);
  } catch (error) {
    if (latestPayload) {
      const message = error.message || 'Dashboard refresh warning';
      latestPayload.liveDiagnostics = {
        ...(latestPayload.liveDiagnostics || {}),
        warning: message,
        stale: true,
        staleAt: new Date().toISOString()
      };
      return res.json(latestPayload);
    }
    return res.status(500).json({ error: error.message || 'Dashboard error' });
  }
});

app.post('/api/dashboard/refresh', async (_req, res) => {
  try {
    const fresh = await refreshLiveData();
    return res.json(fresh);
  } catch (error) {
    if (latestPayload) {
      const message = error.message || 'Dashboard refresh warning';
      latestPayload.liveDiagnostics = {
        ...(latestPayload.liveDiagnostics || {}),
        warning: message,
        stale: true,
        staleAt: new Date().toISOString()
      };
      return res.json(latestPayload);
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
} else {
  app.listen(port, () => {
    console.log(`Badin School Watch server listening on http://localhost:${port}`);
  });
}
