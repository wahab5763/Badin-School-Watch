import { buildMonitorPerformanceSummary } from './server/monitorPerformanceReport.js';

const payload = {
  schools: [
    { schoolId: 'S1', semis: 'SEMIS-1', schoolName: 'School A', monitor: { name: 'Ali' }, visitDates: ['2026-09-01', '2026-09-03'], district: 'Badin' },
    { schoolId: 'S2', semis: 'SEMIS-2', schoolName: 'School B', monitor: { name: 'Ali' }, visitDates: ['2026-09-03'], district: 'Badin' },
    { schoolId: 'S3', semis: 'SEMIS-3', schoolName: 'School C', monitor: { name: 'Awais' }, visitDates: ['2026-09-05'], district: 'Badin' }
  ]
};

const assignmentRows = [
  { monitorName: 'Ali', monitorId: '1', schoolId: 'S1', semis: 'SEMIS-1', schoolName: 'School A', district: 'Badin', assignedDate: '2026-09-01' },
  { monitorName: 'Ali', monitorId: '1', schoolId: 'S2', semis: 'SEMIS-2', schoolName: 'School B', district: 'Badin', assignedDate: '2026-09-01' },
  { monitorName: 'Ali', monitorId: '1', schoolId: 'S1', semis: 'SEMIS-1', schoolName: 'School A', district: 'Badin', assignedDate: '2026-09-03' },
  { monitorName: 'Awais', monitorId: '2', schoolId: 'S3', semis: 'SEMIS-3', schoolName: 'School C', district: 'Badin', assignedDate: '2026-09-05' },
  { monitorName: 'Awais', monitorId: '2', schoolId: 'S4', semis: 'SEMIS-4', schoolName: 'School D', district: 'Badin', assignedDate: '2026-09-05' }
];

const summary = buildMonitorPerformanceSummary({ schools: payload.schools, filters: { month: '2026-09' }, assignmentRows });
console.log(JSON.stringify(summary, null, 2));
