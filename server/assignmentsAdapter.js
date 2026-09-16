import { readMonitorAssignmentIdsFromCsv } from './csv.js';

function buildHeaders() {
  try {
    return JSON.parse(process.env.MNE_API_HEADERS_JSON || '{}');
  } catch {
    return {};
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDdMmYyyy(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}-${m}-${y}`;
}

function formatDateMmDdYyyy(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}-${d}-${y}`;
}

function tryParseJson(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstArrayFromObject(value) {
  if (!value || typeof value !== 'object') return [];

  const knownArrayKeys = [
    'Data', 'data',
    'rows', 'Rows',
    'Table', 'table',
    'List', 'list',
    'Items', 'items'
  ];

  for (const key of knownArrayKeys) {
    if (Array.isArray(value[key])) return value[key];
    const parsed = tryParseJson(value[key]);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const nested = firstArrayFromObject(parsed);
      if (nested.length) return nested;
    }
  }

  for (const entry of Object.values(value)) {
    if (Array.isArray(entry)) return entry;
    const parsed = tryParseJson(entry);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const nested = firstArrayFromObject(parsed);
      if (nested.length) return nested;
    }
  }

  return [];
}

function parseRows(apiResponse) {
  if (Array.isArray(apiResponse)) return apiResponse;

  const parsedRoot = tryParseJson(apiResponse);
  if (Array.isArray(parsedRoot)) return parsedRoot;
  if (parsedRoot && typeof parsedRoot === 'object') {
    const rows = firstArrayFromObject(parsedRoot);
    if (rows.length) return rows;
  }

  if (!apiResponse || typeof apiResponse !== 'object') return [];
  return firstArrayFromObject(apiResponse);
}

function isTruthyStatus(status) {
  if (status === true || status === 'true' || status === 1 || status === '1') return true;
  return false;
}

function isNoRecordMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  return (
    text.includes('no record')
    || text.includes('no data')
    || text.includes('not found')
    || text.includes('no planned visit')
  );
}

function isErrorLikeMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  return (
    text.includes('error')
    || text.includes('exception')
    || text.includes('invalid')
    || text.includes('unauthorized')
    || text.includes('forbidden')
    || text.includes('failed')
  );
}

function postJsonWithRetry(url, headers, body) {
  const timeoutMs = Math.max(30000, Number(process.env.MNE_API_TIMEOUT_MS || 30000));
  const retryCount = Math.max(0, Number(process.env.MNE_API_RETRY_COUNT || 2));

  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body || {}),
          signal: controller.signal
        });

        if (!response.ok) {
          if (attempt < retryCount && response.status >= 500) {
            clearTimeout(timeout);
            continue;
          }
          clearTimeout(timeout);
          return reject(new Error(`Request failed ${response.status} for ${url}`));
        }

        const payload = await response.json();
        clearTimeout(timeout);
        return resolve(payload);
      } catch (error) {
        clearTimeout(timeout);
        const message = String(error?.message || '').toLowerCase();
        const isTimeout = error?.name === 'AbortError' || message.includes('abort');
        if (isTimeout && attempt < retryCount) continue;
        if (!isTimeout && attempt < retryCount) continue;
        if (isTimeout) {
          return reject(new Error(`Request timed out after ${timeoutMs}ms for ${url}`));
        }
        return reject(error);
      }
    }

    reject(new Error(`Request failed after retries for ${url}`));
  });
}

function getJsonWithRetry(url, headers, query = {}) {
  const timeoutMs = Math.max(30000, Number(process.env.MNE_API_TIMEOUT_MS || 30000));
  const retryCount = Math.max(0, Number(process.env.MNE_API_RETRY_COUNT || 2));

  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });
  const finalUrl = params.toString() ? `${url}?${params.toString()}` : url;

  return new Promise(async (resolve, reject) => {
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(finalUrl, {
          method: 'GET',
          headers,
          signal: controller.signal
        });

        if (!response.ok) {
          if (attempt < retryCount && response.status >= 500) {
            clearTimeout(timeout);
            continue;
          }
          clearTimeout(timeout);
          return reject(new Error(`Request failed ${response.status} for ${finalUrl}`));
        }

        const payload = await response.json();
        clearTimeout(timeout);
        return resolve(payload);
      } catch (error) {
        clearTimeout(timeout);
        const message = String(error?.message || '').toLowerCase();
        const isTimeout = error?.name === 'AbortError' || message.includes('abort');
        if (attempt < retryCount) continue;
        if (isTimeout) {
          return reject(new Error(`Request timed out after ${timeoutMs}ms for ${finalUrl}`));
        }
        return reject(error);
      }
    }

    reject(new Error(`Request failed after retries for ${finalUrl}`));
  });
}

function candidatePayloads(selectedDate, filters = {}) {
  const isoDate = formatDate(selectedDate) || selectedDate;
  const ddmmyyyyDate = formatDateDdMmYyyy(selectedDate) || selectedDate;
  const mmddyyyyDate = formatDateMmDdYyyy(selectedDate) || selectedDate;
  const districtName = filters.district || process.env.MNE_API_DISTRICT_NAME || 'Badin';
  const districtId = filters.districtId || process.env.MNE_API_DISTRICT_ID || null;
  const taluka = filters.taluka && filters.taluka !== 'all' ? filters.taluka : null;
  const talukaId = filters.talukaId || process.env.MNE_API_TALUKA_ID || null;
  const uc = filters.uc && filters.uc !== 'all' ? filters.uc : null;
  const ucId = filters.ucId || process.env.MNE_API_UC_ID || null;
  const year = new Date(selectedDate).getFullYear();
  const userid = process.env.MNE_API_USERID || null;

  return [
    { date: isoDate },
    { Date: isoDate },
    { date: ddmmyyyyDate },
    { Date: ddmmyyyyDate },
    { date: mmddyyyyDate },
    { Date: mmddyyyyDate },
    { monitoringDate: isoDate },
    { MonitoringDate: isoDate },
    { SelectedDate: isoDate },
    { selectedDate: isoDate },
    { VisitDate: isoDate },
    { PlanDate: isoDate },
    { from: isoDate, to: isoDate },
    { FromDate: isoDate, ToDate: isoDate },
    { from: ddmmyyyyDate, to: ddmmyyyyDate },
    { FromDate: ddmmyyyyDate, ToDate: ddmmyyyyDate },
    { from: mmddyyyyDate, to: mmddyyyyDate },
    { FromDate: mmddyyyyDate, ToDate: mmddyyyyDate },
    { from_date: isoDate, to_date: isoDate },
    { start_date: isoDate, End_date: isoDate },
    { StartDate: isoDate, EndDate: isoDate },
    {
      Date: isoDate,
      DistrictName: districtName,
      DistrictId: districtId,
      Taluka: taluka,
      TalukaId: talukaId,
      UC: uc,
      UCId: ucId
    },
    {
      FromDate: isoDate,
      ToDate: isoDate,
      DistrictName: districtName,
      DistrictId: districtId,
      Taluka: taluka,
      TalukaId: talukaId,
      UC: uc,
      UCId: ucId
    },
    { year },
    { Year: year },
    { year: year, date: isoDate },
    { Year: year, Date: isoDate },
    { userid },
    { userId: userid },
    { userid: userid, year: year },
    { userId: userid, Year: year }
  ]
    .map((item) => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null && value !== undefined && value !== '')))
    .filter((item, index, list) => {
      const key = JSON.stringify(item);
      return list.findIndex((candidate) => JSON.stringify(candidate) === key) === index;
    });
}

function resolveEndpointUrl(template, values = {}) {
  if (!template || typeof template !== 'string') return '';

  const normalized = template.replace(/\{(year|userId|userid)\}/gi, (match, token) => {
    const key = token.toLowerCase() === 'userid' ? 'userId' : token;
    const value = values[key];
    return value !== undefined && value !== null && String(value).trim() !== '' ? String(value).trim() : '';
  });

  return normalized.replace(/\/\/+/g, '/').replace(/\/$/, '');
}

function getByCandidates(row, names) {
  const entries = Object.entries(row || {});
  const lowered = new Map(entries.map(([key, value]) => [String(key).toLowerCase(), value]));

  for (const name of names) {
    const hit = lowered.get(String(name).toLowerCase());
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') return hit;
  }

  return null;
}

function normalizeAssignmentRow(row, userId = null, userName = null) {
  const monitorNameFromRow = getByCandidates(row, [
    'user_name', 'User_Name', 'username', 'UserName',
    'monitor_name', 'MonitorName', 'Visited_By',
    'Assigned_To', 'AssignedTo', 'Assigned_By', 'AssignedBy',
    'User_DisplayName', 'UserDisplayName'
  ]);
  
  return {
    monitorName: String(userName || monitorNameFromRow || `Monitor ${userId || 'Unknown'}`),
    monitorId: String(userId || process.env.MNE_API_USERID || process.env.MNE_API_USER_ID || 'N/A'),
    schoolName: String(getByCandidates(row, ['school_name', 'School_Name', 'schoolname', 'SchoolName', 'School_Name']) || 'Unknown school'),
    schoolId: String(getByCandidates(row, ['school_id', 'School_Id', 'School_ID', 'schoolid', 'SchoolId', 'School_ID']) || ''),
    semis: String(getByCandidates(row, ['semis_code', 'SEMIS_Code', 'School_SEMIS_Code', 'SchoolSemisCode', 'School_SEMIS_Code']) || ''),
    taluka: String(getByCandidates(row, ['tehsil_name', 'Tehsil_Name', 'Taluka', 'School_Taluka']) || ''),
    assignedDate: String(getByCandidates(row, [
      'scheduled_date', 'ScheduledDate', 'date', 'Date',
      'start_date', 'StartDate', 'monitoring_date', 'MonitoringDate',
      'PlanDate', 'VisitDate', 'visit_date', 'Visit_Date', 'VisitDate'
    ]) || '')
  };
}

function normalizeDateOnly(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const ddmmyyyy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dedupeAssignments(rows) {
  const seen = new Set();
  const out = [];

  rows.forEach((row) => {
    const key = [
      row.monitorName,
      row.monitorId,
      row.schoolId,
      row.semis,
      row.schoolName,
      normalizeDateOnly(row.assignedDate)
    ].join('|').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });

  return out;
}

function filterAssignmentsByDate(rows, selectedDate) {
  const target = normalizeDateOnly(selectedDate);
  if (!target) return rows;

  const datedRows = rows.filter((row) => normalizeDateOnly(row.assignedDate) === target);
  if (datedRows.length) return datedRows;
  return rows;
}

export async function fetchAssignedSchoolsForDate(selectedDate, filters = {}) {
  const headers = buildHeaders();
  if (!Object.keys(headers).length) {
    throw new Error('Live mode requires MNE_API_HEADERS_JSON in your .env file.');
  }

  const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');
  const endpointTemplate = String(process.env.MNE_API_ASSIGNMENTS_ENDPOINT || 'Users/AssignedSchoolStatus/{userId}/{year}').replace(/^\//, '');
  const year = new Date(selectedDate).getFullYear();

  const csvUsers = readMonitorAssignmentIdsFromCsv(process.env.MNE_API_USERIDS_CSV_PATH || './MA_ids.csv');
  const envUserIds = (process.env.MNE_API_USERIDS || process.env.MNE_API_USERID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const users = csvUsers.length
    ? csvUsers
    : envUserIds.map((userId) => ({ userId, userName: process.env.MNE_API_USERNAME || `Monitor ${userId}` }));

  if (!users.length) {
    throw new Error('No user IDs configured. Set MNE_API_USERIDS or MNE_API_USERIDS_CSV_PATH in your .env file.');
  }

  const allRows = [];
  const errors = [];

  for (const { userId, userName } of users) {
    const endpoint = resolveEndpointUrl(endpointTemplate, { year, userId });
    const url = `${base}/${endpoint}`.replace(/\/\/+/g, '/');

    try {
      const response = await getJsonWithRetry(url, headers);
      const rows = parseRows(response);

      if (rows.length > 0) {
        allRows.push(...rows.map((row) => normalizeAssignmentRow(row, userId, userName)));
        continue;
      }

      const message = response?.Message || response?.message || '';
      if (!isNoRecordMessage(message) && (isErrorLikeMessage(message) || message)) {
        errors.push(`${url}: ${message || 'Empty response'}`);
      }
    } catch (error) {
      errors.push(`${url}: ${error.message || String(error)}`);
    }
  }

  if (allRows.length === 0) {
    const sample = errors.slice(0, 3).join(' | ');
    throw new Error(`Could not fetch assigned schools for ${selectedDate}. ${sample}`);
  }

  const deduped = dedupeAssignments(allRows);
  return filterAssignmentsByDate(deduped, selectedDate);
}
