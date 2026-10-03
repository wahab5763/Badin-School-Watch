import 'dotenv/config';
import { fetchAssignedSchoolsForMonth } from './server/assignmentsAdapter.js';

const start = Date.now();
const deadlineAt = start + 60000;
const rows = await fetchAssignedSchoolsForMonth('2026-02', { districts: ['Badin', 'Hyderabad'], deadlineAt });
console.log('elapsedMs=' + (Date.now() - start));
console.log('rows=' + rows.length);
