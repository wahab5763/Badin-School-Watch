import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import { buildMonitorPerformanceSummary, buildMonitorPerformanceWorkbook } from './monitorPerformanceReport.js';

test('buildMonitorPerformanceSummary aggregates assigned, visited, working days, and per-day totals', () => {
  const payload = {
    schools: [
      {
        schoolId: 'S1',
        semis: 'SEMIS-1',
        schoolName: 'School A',
        monitor: { name: 'Ali' },
        visitDates: ['2026-09-01', '2026-09-03'],
        district: 'Badin'
      },
      {
        schoolId: 'S2',
        semis: 'SEMIS-2',
        schoolName: 'School B',
        monitor: { name: 'Ali' },
        visitDates: ['2026-09-03'],
        district: 'Badin'
      },
      {
        schoolId: 'S3',
        semis: 'SEMIS-3',
        schoolName: 'School C',
        monitor: { name: 'Awais' },
        visitDates: ['2026-09-05'],
        district: 'Badin'
      }
    ]
  };

  const assignmentRows = [
    { monitorName: 'Ali', monitorId: '1', schoolId: 'S1', semis: 'SEMIS-1', schoolName: 'School A', district: 'Badin', assignedDate: '2026-09-01' },
    { monitorName: 'Ali', monitorId: '1', schoolId: 'S2', semis: 'SEMIS-2', schoolName: 'School B', district: 'Badin', assignedDate: '2026-09-01' },
    { monitorName: 'Ali', monitorId: '1', schoolId: 'S1', semis: 'SEMIS-1', schoolName: 'School A', district: 'Badin', assignedDate: '2026-09-03' },
    { monitorName: 'Awais', monitorId: '2', schoolId: 'S3', semis: 'SEMIS-3', schoolName: 'School C', district: 'Badin', assignedDate: '2026-09-05' },
    { monitorName: 'Awais', monitorId: '2', schoolId: 'S4', semis: 'SEMIS-4', schoolName: 'School D', district: 'Badin', assignedDate: '2026-09-05' }
  ];

  const summary = buildMonitorPerformanceSummary({
    schools: payload.schools,
    filters: { month: '2026-09' },
    assignmentRows
  });

  assert.equal(summary.rows.length, 2);
  const ali = summary.rows.find((row) => row.monitorName === 'Ali');
  const awais = summary.rows.find((row) => row.monitorName === 'Awais');

  assert.equal(ali.totalAssigned, 3);
  assert.equal(ali.totalVisited, 2);
  assert.equal(ali.totalWorkingDays, 2);
  assert.equal(ali.daysVisited, 2);
  assert.equal(ali.daysNotVisited, 0);
  assert.equal(ali.daily['2026-09-01'].assigned, 2);
  assert.equal(ali.daily['2026-09-01'].visited, 1);

  assert.equal(awais.totalAssigned, 2);
  assert.equal(awais.totalVisited, 1);
  assert.equal(awais.totalWorkingDays, 1);
  assert.equal(awais.daysVisited, 1);
  assert.equal(awais.daysNotVisited, 0);
});

test('buildMonitorPerformanceSummary counts visits by school-date even when monitor names differ slightly', () => {
  const summary = buildMonitorPerformanceSummary({
    schools: [
      {
        schoolId: 'S1',
        district: 'Badin',
        monitor: { name: 'Ali', id: '10' },
        visitDates: ['2026-09-01'],
        schoolName: 'School A'
      }
    ],
    filters: { month: '2026-09', districts: ['Badin'] },
    assignmentRows: [
      { schoolId: 'S1', district: 'Badin', monitorName: 'Ali Updated', monitorId: '10', assignedDate: '2026-09-01' }
    ]
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].totalAssigned, 1);
  assert.equal(summary.rows[0].totalVisited, 1);
  assert.equal(summary.rows[0].daysVisited, 1);
});

test('buildMonitorPerformanceSummary matches visit dates across districts when school IDs are inconsistent', () => {
  const summary = buildMonitorPerformanceSummary({
    schools: [
      {
        district: 'Hyderabad',
        schoolName: 'School A',
        schoolId: 'H-001',
        visitDates: ['2026-09-08']
      },
      {
        district: 'Badin',
        schoolName: 'School A',
        schoolId: 'B-001',
        visitDates: ['2026-09-01']
      }
    ],
    filters: { month: '2026-09', districts: ['Hyderabad'] },
    assignmentRows: [
      { district: 'Hyderabad', schoolName: 'School A', monitorName: 'Ali', assignedDate: '2026-09-08' }
    ]
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].totalAssigned, 1);
  assert.equal(summary.rows[0].totalVisited, 1);
  assert.equal(summary.rows[0].daysVisited, 1);
});

test('buildMonitorPerformanceSummary still counts visits when school district metadata is blank or stale', () => {
  const summary = buildMonitorPerformanceSummary({
    schools: [
      {
        district: 'Badin',
        schoolName: 'School Delta',
        schoolId: 'S-DELTA',
        visitDates: ['2026-09-12']
      }
    ],
    filters: { month: '2026-09', districts: ['Hyderabad'] },
    assignmentRows: [
      { district: 'Hyderabad', schoolName: 'School Delta', monitorName: 'Ali', assignedDate: '2026-09-12' }
    ]
  });

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].totalVisited, 1);
  assert.equal(summary.rows[0].daysVisited, 1);
});

test('buildMonitorPerformanceWorkbook includes an explicit no-data message when no matching rows exist', async () => {
  const buffer = await buildMonitorPerformanceWorkbook({ schools: [] }, { month: '2026-09' }, [], 'Live monitor data could not be fetched for 2026-09.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  const message = String(sheet.getCell('A1').value || '');
  assert.match(message, /Live monitor data could not be fetched/i);
  const firstRowValues = sheet.getRow(1).values;
  assert.equal((firstRowValues.filter((value) => value === 'District Name')).length, 0);
  assert.equal((firstRowValues.filter((value) => value === 'Monitor ID')).length, 0);
});
