import 'dotenv/config';
import { fetchAssignedSchoolsForMonth } from './server/assignmentsAdapter.js';

// Reuse the internal fetchSchoolVisitDatesForAssignments logic isn't exported, so
// hit the live endpoint the same way it does, but only for a small deliberately-limited
// subset of schools and with a short deadline, to confirm the deadline clamp actually
// stops work promptly instead of letting individual requests run long.
import { buildHeaders } from './server/mneAdapter.js';

const assignmentRows = await fetchAssignedSchoolsForMonth('2026-02', { districts: ['Hyderabad'] });
console.log('total assignmentRows=' + assignmentRows.length);

const uniqueIds = [...new Set(assignmentRows.map((r) => String(r.schoolId || '').trim()).filter(Boolean))].slice(0, 60);
console.log('testing uniqueIds=' + uniqueIds.length);

const headers = buildHeaders();
const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');

const deadlineAt = Date.now() + 8000; // deliberately short: 8s
const timeoutMs = 15000;
const concurrency = 12;
let index = 0;
const results = [];

async function worker() {
  while (index < uniqueIds.length) {
    if (Date.now() >= deadlineAt) return;
    const i = index; index += 1;
    const schoolId = uniqueIds[i];
    const attemptTimeoutMs = Math.max(1000, Math.min(timeoutMs, deadlineAt - Date.now()));
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), attemptTimeoutMs);
    try {
      const res = await fetch(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${schoolId}`, { headers, signal: controller.signal });
      const json = await res.json();
      results.push(json?.Data?.length || 0);
    } catch {
      results.push(-1);
    } finally {
      clearTimeout(t);
    }
  }
}

const start = Date.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log('elapsedMs=' + (Date.now() - start) + ' (deadline budget was 8000ms)');
console.log('completed=' + results.length + '/' + uniqueIds.length);
