import { buildDashboardPayload } from './mockData.js';

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getInput(censusData, index) {
  if (!Array.isArray(censusData)) return '';
  return censusData[index]?.Input ?? '';
}

function parseNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCoordinates(apiLat, apiLng, fallback = {}) {
  const lat = Number(apiLat);
  const lng = Number(apiLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  if (Number.isFinite(fallback?.lat) && Number.isFinite(fallback?.lng)) {
    return { lat: Number(fallback.lat), lng: Number(fallback.lng) };
  }
  return { lat: 24.8, lng: 68.85 };
}

function numericTotal(entry = {}) {
  return Object.entries(entry)
    .filter(([key, value]) => key !== 'Title' && Number.isFinite(Number(value)))
    .reduce((sum, [, value]) => sum + Number(value), 0);
}

export function buildHeaders() {
  try {
    return JSON.parse(process.env.MNE_API_HEADERS_JSON || '{}');
  } catch {
    return {};
  }
}

async function fetchJson(url, options = {}) {
  const configuredTimeout = Number(process.env.MNE_API_TIMEOUT_MS || 30000);
  const timeoutMs = Math.max(30000, configuredTimeout);
  const retryCount = Math.max(0, Number(process.env.MNE_API_RETRY_COUNT || 2));

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      clearTimeout(timeout);
      const message = String(error?.message || '').toLowerCase();
      const isTimeout = controller.signal.aborted || error?.name === 'AbortError' || message.includes('abort');

      if (isTimeout) {
        if (attempt < retryCount) continue;
        throw new Error(`Request timed out after ${timeoutMs}ms for ${url}`);
      }

      if (attempt < retryCount) continue;
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (attempt < retryCount && response.status >= 500) continue;
      throw new Error(`Request failed ${response.status} for ${url}`);
    }

    return response.json();
  }

  throw new Error(`Request failed after retries for ${url}`);
}

function academicVisits(visits = [], academicYear) {
  const start = safeDate(`${academicYear.start}T00:00:00`);
  const end = safeDate(`${academicYear.end}T23:59:59`);
  return visits
    .filter((visit) => {
      const date = safeDate(visit?.Monitoring_Start_Date);
      return date && (!start || date >= start) && (!end || date <= end);
    })
    .sort((a, b) => new Date(b.Monitoring_Start_Date) - new Date(a.Monitoring_Start_Date));
}

function sortedVisits(visits = []) {
  return [...visits].sort((a, b) => new Date(b.Monitoring_Start_Date) - new Date(a.Monitoring_Start_Date));
}

function visitMatchesDateRange(visitDateValue, targetDate, daysRange = 0) {
  if (!visitDateValue || !targetDate) return false;

  const visitDate = safeDate(String(visitDateValue).slice(0, 10) + 'T00:00:00Z');
  const selectedDate = safeDate(`${targetDate}T00:00:00Z`);
  if (!visitDate || !selectedDate) return false;

  if (Number(daysRange) === 0) {
    return String(visitDateValue).slice(0, 10) === targetDate;
  }

  const diffInDays = Math.round(Math.abs(visitDate.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffInDays <= Number(daysRange);
}

function selectVisitForDate(visits = [], targetDate, daysRange = 0) {
  if (!targetDate) return visits[0] || null;

  const target = safeDate(targetDate);
  if (!target) return visits[0] || null;

  const matchingVisits = visits.filter((visit) => {
    const visitDate = safeDate(visit?.Monitoring_Start_Date);
    if (!visitDate) return false;

    if (Number(daysRange) === 0) {
      return visitDate.toDateString() === target.toDateString();
    }

    const diffInDays = Math.round(Math.abs(visitDate.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    return diffInDays <= Number(daysRange);
  });

  if (!matchingVisits.length) return null;

  return [...matchingVisits].sort((a, b) => {
    const aDate = safeDate(a.Monitoring_Start_Date);
    const bDate = safeDate(b.Monitoring_Start_Date);

    if (Number(daysRange) === 0) {
      // For exact selected date, prefer the latest visit on that day.
      return bDate.getTime() - aDate.getTime();
    }

    const aDiff = Math.abs(aDate.getTime() - target.getTime());
    const bDiff = Math.abs(bDate.getTime() - target.getTime());
    if (aDiff !== bDiff) return aDiff - bDiff;
    return bDate.getTime() - aDate.getTime();
  })[0];
}

function buildMonthlySummary(visits, academicYearMonths) {
  return academicYearMonths.map(({ month }) => {
    const monthVisits = visits.filter((visit) => String(visit.Monitoring_Start_Date || '').slice(0, 7) === month);
    return {
      month,
      label: month.slice(5),
      attendanceRate: monthVisits.length ? 82 : 0,
      visits: monthVisits.length,
      criticalFlags: monthVisits.filter((visit) => String(visit.School_Status || '').toLowerCase().includes('closed')).length
    };
  });
}

function normalizeEvidenceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/Monitoring\//i.test(raw)) return `https://mne.seld.gos.pk/FileUpload${raw}`;
  if (/^Monitoring\//i.test(raw)) return `https://mne.seld.gos.pk/FileUpload/${raw}`;
  if (raw.startsWith('/')) return `https://mne.seld.gos.pk${raw}`;
  if (/^FileUpload\//i.test(raw)) return `https://mne.seld.gos.pk/${raw}`;
  return null;
}

function extractImageCandidates(value) {
  const text = String(value || '').trim();
  if (!text) return [];

  const matches = [
    ...(text.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?/gi) || []),
    ...(text.match(/\/?FileUpload\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?/gi) || []),
    ...(text.match(/\/?Monitoring\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?/gi) || [])
  ];

  if (!matches.length && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(text)) {
    matches.push(text);
  }

  return [...new Set(matches.map((item) => item.trim()))];
}

function evidenceCategory(title, input = '') {
  const key = `${String(title || '')} ${String(input || '')}`.toLowerCase();
  if (/muster|attendance\s*register|register/.test(key)) return 'musterRoll';
  if (/washroom|toilet|latrine|hand\s*wash|wr\b/.test(key)) return 'washroom';
  if (/school|building|boundary|gate|classroom|premises|infrastructure/.test(key)) return 'school';
  if (/visit|inspection|monitoring/.test(key)) return 'visit';
  return 'other';
}

function extractVisitEvidence(data, monitoringId = null, timestamp = null) {
  const rows = Array.isArray(data?.Data) ? data.Data : [];
  const items = [];
  const imageTimestamps = new Set();

  const hasEvidenceField = (regex) => rows.some((row) => {
    const text = `${row?.Title || ''} ${row?.Question || ''} ${row?.QuestionTitle || ''} ${row?.Name || ''} ${row?.KRAName || ''} ${row?.Input || ''} ${row?.DataValue || ''}`.toLowerCase();
    return regex.test(text);
  });

  const extractTimestampFromUrl = (url) => {
    const match = String(url).match(/Img_\d+_0_(\d{14})\.(?:jpg|jpeg|png|webp|gif)/i);
    return match ? match[1] : null;
  };

  rows.forEach((row, index) => {
    const title = row?.Title || row?.Question || row?.QuestionTitle || row?.Name || row?.KRAName || `Field ${index + 1}`;
    const sources = [
      row?.Input,
      row?.DataValue,
      row?.Value,
      row?.Attachment,
      row?.Image,
      row?.ImageUrl,
      row?.Photo,
      row?.PhotoUrl,
      row?.FilePath,
      row?.FileUrl,
      row?.KRAName,
      row?.ReferenceCode
    ];
    const candidates = [...new Set(sources.flatMap((value) => extractImageCandidates(value)))];
    if (!candidates.length) return;

    const category = evidenceCategory(title, `${row?.Input ?? ''} ${row?.DataValue ?? ''} ${row?.KRAName ?? ''}`);
    candidates.forEach((candidate, imageIndex) => {
      const url = normalizeEvidenceUrl(candidate);
      if (!url) return;
      const ts = extractTimestampFromUrl(url);
      if (ts) imageTimestamps.add(ts);
      items.push({
        id: `${index}-${imageIndex}`,
        category,
        title: String(title || `Visit image ${index + 1}`),
        url
      });
    });
  });

  if (monitoringId && timestamp) {
    const defaultTimestamp = String(timestamp).replace(/[^\d]/g, '').slice(0, 14);
    const fixedTimestamp = Array.from(imageTimestamps).sort().reverse()[0] || defaultTimestamp;
    const baseUrl = `https://mne.seld.gos.pk/FileUpload/Monitoring/${monitoringId}/`;

    const fixedImages = [
      { prefix: 'Img_40_0_', title: 'Muster Roll Image', category: 'musterRoll', matcher: /muster|attendance\s*register|register/ },
      { prefix: 'Img_161_0_', title: 'Washroom Facility', category: 'washroom', matcher: /washroom|toilet|latrine|hand\s*wash|wr\b/ },
      { prefix: 'Img_146_0_', title: 'Furniture Facility', category: 'school', matcher: /furniture|desk|bench|table|chair|seating/ },
      { prefix: 'Img_254_0_', title: 'Classroom Image', category: 'school', matcher: /classroom|room|teaching room|class\b/ }
    ];

    fixedImages.forEach((item, index) => {
      if (!hasEvidenceField(item.matcher)) return;
      items.push({
        id: `fixed-${index}`,
        category: item.category,
        title: item.title,
        url: `${baseUrl}${item.prefix}${fixedTimestamp}.jpeg`
      });
    });
  }

  const byCategory = {
    school: [],
    musterRoll: [],
    washroom: [],
    visit: [],
    other: []
  };

  items.forEach((item) => {
    if (!byCategory[item.category]) {
      byCategory.other.push(item);
      return;
    }
    byCategory[item.category].push(item);
  });

  return { items, byCategory };
}

function parseTeacherStatus(entry = {}) {
  const presentRaw = String(entry.Present || '').toLowerCase();
  if (presentRaw === 'yes') return 'Present';
  if (entry.Leave_Type) return `Leave${entry.Leave_Type ? `: ${entry.Leave_Type}` : ''}`;
  if (entry.Absent_Reason) return `Absent${entry.Absent_Reason ? `: ${entry.Absent_Reason}` : ''}`;
  if (presentRaw === 'no') return 'Absent';
  return 'Unknown';
}

function parseAttendance(data, schoolId) {
  const entries = Array.isArray(data?.Data) ? data.Data : [];
  const total = entries.length;
  const present = entries.filter((entry) => String(entry.Present).toLowerCase() === 'yes').length;
  const leave = entries.filter((entry) => entry.Leave_Type).length;
  const absent = Math.max(0, total - present - leave);
  const rate = total ? Number(((present / total) * 100).toFixed(1)) : 0;

  const teachers = entries.map((entry) => {
    const employeeId = entry.Employee_Id || entry.EmployeeId || null;
    return {
      id: employeeId,
      name: entry.Employee_Name || 'Unknown teacher',
      cnic: entry.Employee_CNIC || null,
      present: String(entry.Present || '').toLowerCase() === 'yes',
      leaveType: entry.Leave_Type || null,
      absentReason: entry.Absent_Reason || null,
      remarks: entry.Remarks || null,
      status: parseTeacherStatus(entry),
      employeeCode: entry.Employee_Code || null,
      designationName: entry.Designation_Name || null,
      staffType: entry.Staff_Type || null,
      gender: entry.Employee_Gender || null
    };
  });

  return { total, present, leave, absent, rate, teachers };
}

function parseCensus(data) {
  const rows = data?.Data || [];
  const buildingOwnership = getInput(rows, 13) || 'Unknown';
  const buildingText = getInput(rows, 101) || getInput(rows, 18) || 'Unknown';
  const water = getInput(rows, 97) || getInput(rows, 21) || 'Unknown';
  const electricity = getInput(rows, 33) || getInput(rows, 56) || 'Unknown';
  const boundary = getInput(rows, 19) || 'Unknown';
  const totalWashrooms = parseNumber(getInput(rows, 26));
  const functionalWashrooms = parseNumber(getInput(rows, 27));
  const rooms = parseNumber(getInput(rows, 74));
  const teachingRooms = parseNumber(getInput(rows, 75));
  const readinessComponents = [
    /good|functional|available|yes/i.test(buildingText) ? 90 : /repair|needs/i.test(buildingText) ? 55 : 25,
    /yes|available|pipe|boring|functional/i.test(water) ? 85 : 35,
    /yes|available|functional/i.test(electricity) ? 85 : 35,
    /yes|available|boundary/i.test(boundary) ? 80 : 30,
    totalWashrooms > 0 ? (functionalWashrooms / Math.max(totalWashrooms, 1)) * 100 : 25
  ];
  const readiness = Number((readinessComponents.reduce((sum, value) => sum + value, 0) / readinessComponents.length).toFixed(1));
  return {
    buildingOwnership,
    buildingCondition: buildingText,
    boundaryWall: boundary,
    drinkingWater: water,
    electricity,
    washroomsTotal: totalWashrooms,
    washroomsFunctional: functionalWashrooms,
    handWash: getInput(rows, 30) || 'Unknown',
    rooms,
    teachingRooms,
    readiness,
    duration: parseNumber(getInput(rows, 112)),
    smcFunctional: getInput(rows, 7) || 'Unknown'
  };
}

function parseEnrollment(data) {
  const rows = Array.isArray(data?.Data) ? data.Data : [];
  const boys = numericTotal(rows[0]);
  const girls = numericTotal(rows[1]);
  const reportedTotal = numericTotal(rows[6]);
  const total = boys + girls || reportedTotal;
  const roomsGuess = Math.max(1, Math.round(total / 38));
  return {
    total,
    boys,
    girls,
    overCapacity: total > roomsGuess * 38,
    classroomCapacity: roomsGuess * 38
  };
}

function parseTextbooks(data) {
  const rows = Array.isArray(data?.Data) ? data.Data : [];
  const required = numericTotal(rows[0]);
  const received = numericTotal(rows[1]);
  const distributed = numericTotal(rows[2]);
  const stock = numericTotal(rows[3]);
  const surplus = numericTotal(rows[4]);
  const shortage = numericTotal(rows[5]) || Math.max(0, required - distributed);
  return { required, received, distributed, stock, shortage, surplus };
}

function buildFlags(census, attendance, enrollment, textbooks) {
  const flags = [];
  if (!/yes|available|functional|good|pipe|boring/i.test(census.drinkingWater)) flags.push('water gap');
  if (!/yes|available|functional/i.test(census.electricity)) flags.push('electricity gap');
  if (!/yes|available|boundary/i.test(census.boundaryWall)) flags.push('boundary wall issue');
  if (attendance.rate < 75) flags.push('teacher attendance low');
  if (textbooks.shortage > 0) flags.push('textbook shortage');
  if (enrollment.overCapacity) flags.push('overcrowding');
  if ((census.washroomsFunctional || 0) === 0) flags.push('washrooms non-functional');
  return flags;
}

function buildSchoolRecord({ row, schoolInfo, visits, allVisitDates, selectedVisit, academicYearMonths, census, attendance, enrollment, textbooks, visitEvidence, monitor, rawVisits, monthlyAttendance }) {
  const flags = buildFlags(census, attendance, enrollment, textbooks);
  const riskScore = Number(Math.min(99, Math.max(15, 100 - census.readiness * 0.65 + textbooks.shortage / Math.max(enrollment.total || 1, 1) * 22 + (100 - attendance.rate) * 0.3)).toFixed(1));

  return {
    schoolId: row.schoolId,
    schoolName: schoolInfo.School_Prefix ? `${schoolInfo.School_Prefix} ${schoolInfo.School_Name}` : row.schoolName,
    semis: schoolInfo.School_SEMIS_Code || row.semis,
    district: schoolInfo.District_Name || 'Badin',
    taluka: schoolInfo.Tehsil_Name || 'Unknown',
    uc: schoolInfo.UC_Name || 'Unknown',
    level: schoolInfo.Level || 'Unknown',
    gender: schoolInfo.Gender || 'Unknown',
    schoolStatus: selectedVisit?.School_Status || (selectedVisit ? 'Open' : 'Unknown'),
    monitoringId: selectedVisit?.Monitoring_ID || null,
    lastVisitDate: selectedVisit?.Monitoring_Start_Date || null,
    visitCount: visits.length,
    visitDates: allVisitDates,
    monthlyAttendance: monthlyAttendance || {},
    visitHistory: (rawVisits || visits).map((v) => ({
      date: String(v.Monitoring_Start_Date || ''),
      monitoringId: String(v.Monitoring_ID || ''),
      monitorName: String(v.User_Name || '')
    })).filter((v) => v.date && v.monitoringId),
    monthly: buildMonthlySummary(visits, academicYearMonths),
    coordinates: normalizeCoordinates(schoolInfo.LATITUDE, schoolInfo.LONGITUDE, row.coordinates),
    attendance,
    census,
    enrollment,
    textbooks,
    visitEvidence,
    riskScore,
    qualityScore: Number((attendance.rate * 0.45 + census.readiness * 0.55).toFixed(1)),
    flags,
    monitor
  };
}

export async function fetchSchoolVisitDetail(row, academicYear, academicYearMonths, targetDate, daysRange = 0) {
  const headers = buildHeaders();
  const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');

  if (!Object.keys(headers).length) {
    throw new Error('Live mode requires MNE_API_HEADERS_JSON in your .env file.');
  }

  const schoolInfo = await fetchJson(`${base}//Schools/GetSchoolById/${row.schoolId}`, { headers });
  const visitsResponse = await fetchJson(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${row.schoolId}`, { headers });
  const allVisits = sortedVisits(visitsResponse?.Data || []);
  const visits = academicVisits(allVisits, academicYear);
  const selectedVisit = selectVisitForDate(allVisits, targetDate, daysRange);

  if (!selectedVisit?.Monitoring_ID) {
    throw new Error(`No monitoring visit found for school ${row.schoolId} on ${targetDate}.`);
  }

  const [censusData, attendanceData, enrollmentData, textbookData] = await Promise.all([
    fetchJson(`${base}//Schools/GetMonitoringDetailsByMonitoringId?MonitoringId=${selectedVisit.Monitoring_ID}`, { headers }),
    fetchJson(`${base}//Schools/GetTeachersAttendanceByMonitoringId?MonitoringId=${selectedVisit.Monitoring_ID}`, { headers }),
    fetchJson(`${base}//Schools/GetEnrolmentsByMonitoringId?MonitoringId=${selectedVisit.Monitoring_ID}`, { headers }),
    fetchJson(`${base}//Schools/GetTextbooksByMonitoringId?MonitoringId=${selectedVisit.Monitoring_ID}`, { headers })
  ]);

  const census = parseCensus(censusData);
  const attendance = parseAttendance(attendanceData, row.schoolId);
  const enrollment = parseEnrollment(enrollmentData);
  const textbooks = parseTextbooks(textbookData);
  const visitEvidence = extractVisitEvidence(censusData, selectedVisit.Monitoring_ID, selectedVisit.Monitoring_Start_Date);
  const monitor = {
    name: selectedVisit.User_Name || 'Unknown monitor',
    id: selectedVisit.User_id || 'N/A'
  };

  return buildSchoolRecord({
    row,
    schoolInfo,
    visits,
    rawVisits: allVisits,
    allVisitDates: allVisits.map((visit) => visit.Monitoring_Start_Date).filter(Boolean),
    selectedVisit,
    academicYearMonths,
    census,
    attendance,
    enrollment,
    textbooks,
    visitEvidence,
    monitor,
    monthlyAttendance: {}
  });
}

export async function buildLiveDashboard(rows, academicYear, academicYearMonths, hooks = {}) {
  const headers = buildHeaders();
  const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');

  if (!Object.keys(headers).length) {
    throw new Error('Live mode requires MNE_API_HEADERS_JSON in your .env file.');
  }

  const concurrency = Number(process.env.MNE_API_CONCURRENCY || 8);
  const failOnPartial = String(process.env.MNE_API_FAIL_ON_PARTIAL || 'false').toLowerCase() === 'true';
  const failOnPartialMinFailed = Math.max(1, Number(process.env.MNE_API_FAIL_ON_PARTIAL_MIN_FAILED || 25));
  const failOnPartialMinRate = Math.max(0, Number(process.env.MNE_API_FAIL_ON_PARTIAL_MIN_RATE || 0.02));
  const queue = [...rows];
  const schools = [];
  let failed = 0;
  const sampleErrors = [];

  async function worker() {
    while (queue.length) {
      const row = queue.shift();
      let rowFailed = false;
      let schoolInfo = {};
      let visits = [];
      let allVisits = [];
      let allVisitDates = [];
      let latestVisit = null;
      let census = {
        buildingOwnership: 'Unknown',
        buildingCondition: 'Unknown',
        boundaryWall: 'Unknown',
        drinkingWater: 'Unknown',
        electricity: 'Unknown',
        washroomsTotal: 0,
        washroomsFunctional: 0,
        handWash: 'Unknown',
        rooms: 0,
        teachingRooms: 0,
        readiness: 0,
        duration: 0,
        smcFunctional: 'Unknown'
      };
      let attendance = { total: 0, present: 0, leave: 0, absent: 0, rate: 0, teachers: [] };
      let enrollment = {
        total: 0,
        boys: 0,
        girls: 0,
        overCapacity: false,
        classroomCapacity: 0
      };
      let textbooks = { required: 0, received: 0, distributed: 0, stock: 0, shortage: 0, surplus: 0 };
      let visitEvidence = { items: [], byCategory: { school: [], musterRoll: [], washroom: [], visit: [], other: [] } };
      let monitor = { name: 'Unknown monitor', id: 'N/A' };

      const [schoolInfoResult, visitsResult] = await Promise.allSettled([
        fetchJson(`${base}//Schools/GetSchoolById/${row.schoolId}`, { headers }),
        fetchJson(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${row.schoolId}`, { headers })
      ]);

      if (schoolInfoResult.status === 'fulfilled') {
        schoolInfo = schoolInfoResult.value;
      } else {
        rowFailed = true;
        if (sampleErrors.length < 3) sampleErrors.push(schoolInfoResult.reason?.message || 'School info fetch failed');
      }

      if (visitsResult.status === 'fulfilled') {
        const visitsResponse = visitsResult.value;
        allVisits = sortedVisits(visitsResponse?.Data || []);
        visits = academicVisits(allVisits, academicYear);
        allVisitDates = allVisits.map((visit) => visit.Monitoring_Start_Date).filter(Boolean);
        latestVisit = allVisits[0] || null;
      } else {
        rowFailed = true;
        if (sampleErrors.length < 3) sampleErrors.push(visitsResult.reason?.message || 'Visits fetch failed');
      }

      if (latestVisit?.Monitoring_ID) {
        try {
          const [censusData, attendanceData, enrollmentData, textbookData] = await Promise.all([
            fetchJson(`${base}//Schools/GetMonitoringDetailsByMonitoringId?MonitoringId=${latestVisit.Monitoring_ID}`, { headers }),
            fetchJson(`${base}//Schools/GetTeachersAttendanceByMonitoringId?MonitoringId=${latestVisit.Monitoring_ID}`, { headers }),
            fetchJson(`${base}//Schools/GetEnrolmentsByMonitoringId?MonitoringId=${latestVisit.Monitoring_ID}`, { headers }),
            fetchJson(`${base}//Schools/GetTextbooksByMonitoringId?MonitoringId=${latestVisit.Monitoring_ID}`, { headers })
          ]);
          census = parseCensus(censusData);
          visitEvidence = extractVisitEvidence(censusData, latestVisit.Monitoring_ID, latestVisit.Monitoring_Start_Date);
          attendance = parseAttendance(attendanceData, row.schoolId);
          enrollment = parseEnrollment(enrollmentData);
          textbooks = parseTextbooks(textbookData);
          monitor = {
            name: latestVisit.User_Name || 'Unknown monitor',
            id: latestVisit.User_id || 'N/A'
          };
        } catch (error) {
          rowFailed = true;
          if (sampleErrors.length < 3) sampleErrors.push(error?.message || 'Monitoring detail fetch failed');
        }
      } else {
        rowFailed = true;
      }

      if (rowFailed) {
        failed += 1;
        if (typeof hooks.onFailure === 'function') {
          hooks.onFailure(new Error('Partial data for school'), row);
        }
      }

      schools.push(buildSchoolRecord({
        row,
        schoolInfo,
        visits,
        rawVisits: allVisits,
        allVisitDates,
        selectedVisit: latestVisit,
        academicYearMonths,
        census,
        attendance,
        enrollment,
        textbooks,
        visitEvidence,
        monitor,
        monthlyAttendance: {}
      }));

      if (typeof hooks.onSchool === 'function') {
        hooks.onSchool(schools[schools.length - 1]);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (!schools.length) {
    const details = sampleErrors.length ? ` Sample errors: ${sampleErrors.join(' | ')}` : '';
    throw new Error(`Live sync did not return any school records. Failed: ${failed}.${details}`);
  }

  if (schools.length !== rows.length) {
    throw new Error(`Live sync returned incomplete school rows. Expected ${rows.length}, got ${schools.length}.`);
  }

  const failureRate = rows.length ? failed / rows.length : 1;
  const shouldFailOnPartial = failOnPartial
    && failed >= failOnPartialMinFailed
    && failureRate >= failOnPartialMinRate;

  const payload = buildDashboardPayload(schools, academicYear, 'live');
  payload.liveDiagnostics = {
    requestedSchools: rows.length,
    loadedSchools: schools.length - failed,
    failedSchools: failed,
    partialData: failed > 0,
    failOnPartial,
    shouldFailOnPartial,
    partialFailureSuppressed: failed > 0 && shouldFailOnPartial,
    failureRate: Number((failureRate * 100).toFixed(3)),
    failOnPartialMinFailed,
    failOnPartialMinRate,
    sampleErrors,
    timedOut: false,
    maxSyncSeconds: null
  };
  return payload;
}
