function isAbortError(error) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return error.name === 'AbortError' || message.includes('aborted') || message.includes('abort');
}

function timeoutErrorMessage(url, timeoutMs) {
  const seconds = Number((Number(timeoutMs) / 1000).toFixed(1));
  return `Request timed out after ${seconds}s while calling ${url}.`;
}

async function requestDashboard(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error(timeoutErrorMessage(url, timeoutMs));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      if (payload?.error) detail = `: ${payload.error}`;
    } catch {}
    throw new Error(`Failed to load dashboard (${response.status})${detail}`);
  }
  return response.json();
}

async function requestDashboardWithRetry(url, timeoutMs, retryCount = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await requestDashboard(url, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= retryCount) break;
    }
  }
  throw lastError;
}

export async function fetchDashboard() {
  const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 300000);
  const retryCount = Math.max(0, Number(import.meta.env.VITE_API_RETRY_COUNT || 1));
  return requestDashboardWithRetry('/api/dashboard', timeoutMs, retryCount);
}

export async function refreshDashboard() {
  const timeoutMs = Number(import.meta.env.VITE_REFRESH_TIMEOUT_MS || 300000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch('/api/dashboard/refresh', { method: 'POST', cache: 'no-store', signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error(timeoutErrorMessage('/api/dashboard/refresh', timeoutMs));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      if (payload?.error) detail = `: ${payload.error}`;
    } catch {}
    throw new Error(`Failed to refresh dashboard (${response.status})${detail}`);
  }
  return response.json();
}

export async function fetchSchoolVisitDetail(schoolId, selectedDate, daysRange = 0) {
  const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 300000);
  const params = new URLSearchParams({
    date: selectedDate,
    daysRange: String(daysRange)
  });
  return requestDashboard(`/api/schools/${encodeURIComponent(schoolId)}/detail?${params.toString()}`, timeoutMs);
}

export function buildVisitedSchoolsReportUrl(filters = {}) {
  const params = new URLSearchParams();
  const keys = ['taluka', 'level', 'gender', 'status', 'selectedDate', 'daysRange', 'startMonth', 'endMonth', 'minRisk'];

  keys.forEach((key) => {
    if (filters[key] === undefined || filters[key] === null || filters[key] === '') return;
    params.set(key, String(filters[key]));
  });

  const query = params.toString();
  return query ? `/api/reports/visited-schools.pdf?${query}` : '/api/reports/visited-schools.pdf';
}

export function buildMonitorAssignmentsReportUrl(filters = {}) {
  const params = new URLSearchParams();
  const keys = ['taluka', 'level', 'gender', 'status', 'selectedDate', 'daysRange', 'startMonth', 'endMonth', 'minRisk'];

  keys.forEach((key) => {
    if (filters[key] === undefined || filters[key] === null || filters[key] === '') return;
    params.set(key, String(filters[key]));
  });

  const query = params.toString();
  return query ? `/api/reports/monitor-assignments.pdf?${query}` : '/api/reports/monitor-assignments.pdf';
}

export function buildEmployeeAttendanceReportUrl(filters = {}) {
  const params = new URLSearchParams();
  const hasMonthRange = filters.startMonth || filters.endMonth;

  if (hasMonthRange) {
    if (filters.startMonth) params.set('startMonth', String(filters.startMonth));
    if (filters.endMonth) params.set('endMonth', String(filters.endMonth));
  } else if (filters.selectedDate) {
    params.set('selectedDate', String(filters.selectedDate));
  }

  const query = params.toString();
  return query ? `/api/reports/employee-attendance.xlsx?${query}` : '/api/reports/employee-attendance.xlsx';
}
