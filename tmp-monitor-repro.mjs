import 'dotenv/config';
import { readSchoolRows } from './server/csv.js';
import { buildLiveDashboard } from './server/mneAdapter.js';
import { fetchAssignedSchoolsForMonth } from './server/assignmentsAdapter.js';
import { buildMonitorPerformanceSummary } from './server/monitorPerformanceReport.js';

const rows = readSchoolRows('./school_data.csv');
const payload = await buildLiveDashboard(rows, { start: '2025-04-01', end: '2026-03-31', label: '2025-04-01 → 2026-03-31' }, [
  { month: '2025-04' }, { month: '2025-05' }, { month: '2025-06' }, { month: '2025-07' }, { month: '2025-08' }, { month: '2025-09' },
  { month: '2025-10' }, { month: '2025-11' }, { month: '2025-12' }, { month: '2026-01' }, { month: '2026-02' }, { month: '2026-03' }
]);
console.log('payloadSchools=' + payload.schools.length);
const sampleSchool = payload.schools.find((s) => s.district === 'Badin' && Array.isArray(s.visitDates) && s.visitDates.length > 0);
console.log('sampleSchool=' + !!sampleSchool + ' district=' + (sampleSchool?.district || 'none') + ' visits=' + (sampleSchool?.visitDates?.length || 0));
const assignmentRows = await fetchAssignedSchoolsForMonth('2026-09', { districts: ['Badin'] });
console.log('assignmentRows=' + assignmentRows.length);
const summary = buildMonitorPerformanceSummary({ schools: payload.schools, filters: { month: '2026-09', districts: ['Badin'] }, assignmentRows });
console.log('summaryRows=' + summary.rows.length);
console.log(JSON.stringify(summary.rows.slice(0, 3), null, 2));
