import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDistrictList, filterAssignmentsByMonth } from './assignmentsAdapter.js';
import { parseVisitedSchoolsReportFilters } from './visitedSchoolsReport.js';

test('normalizeDistrictList accepts comma-separated and repeated values', () => {
  assert.deepEqual(normalizeDistrictList('Badin, Hyderabad '), ['Badin', 'Hyderabad']);
  assert.deepEqual(normalizeDistrictList(['badin', ' hyderabad ', 'badin']), ['badin', 'hyderabad']);
});

test('parseVisitedSchoolsReportFilters keeps multiple districts', () => {
  const filters = parseVisitedSchoolsReportFilters({
    selectedDate: '2024-06-12',
    districts: ['Badin', 'Hyderabad'],
    district: 'Jacobabad'
  });

  assert.deepEqual(filters.districts, ['Badin', 'Hyderabad', 'Jacobabad']);
});

test('filterAssignmentsByMonth keeps only rows in the selected month', () => {
  const rows = [
    { monitorName: 'Ali', schoolId: 'S1', assignedDate: '2026-09-01' },
    { monitorName: 'Ali', schoolId: 'S2', assignedDate: '2026-09-20' },
    { monitorName: 'Awais', schoolId: 'S3', assignedDate: '2026-10-02' }
  ];

  const result = filterAssignmentsByMonth(rows, '2026-09');

  assert.deepEqual(result.map((row) => row.schoolId), ['S1', 'S2']);
});
