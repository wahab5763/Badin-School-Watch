import ExcelJS from 'exceljs';

function normalizeMonth(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length === 7 ? text : text.slice(0, 7);
}

function normalizeDateOnly(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForColumn(dateValue) {
  const iso = normalizeDateOnly(dateValue);
  if (!iso) return dateValue || 'N/A';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()}-${date.getUTCMonth() + 1}-${date.getUTCFullYear()}`;
}

function normalizeDistrict(value) {
  return String(value || '').trim();
}

function normalizeMonitorName(monitorName, monitorId) {
  const name = String(monitorName || '').trim();
  if (name) return name;
  const id = String(monitorId || '').trim();
  return id || 'Unknown monitor';
}

function buildMonitorKey(monitorName, monitorId) {
  const name = String(monitorName || '').trim();
  const id = String(monitorId || '').trim();
  return (name || id || 'unknown-monitor').toLowerCase();
}

function getSchoolIdentityCandidates(row) {
  const district = normalizeDistrict(row?.district || row?.District || '');
  const values = [
    row?.schoolId,
    row?.School_ID,
    row?.school_id,
    row?.semis,
    row?.SEMIS,
    row?.schoolName,
    row?.School_Name,
    row?.school_name,
    district ? `${district}|${row?.schoolId || ''}` : '',
    district ? `${district}|${row?.semis || ''}` : '',
    district ? `${district}|${row?.schoolName || ''}` : '',
    `${row?.monitorId || 'unknown'}-${row?.assignedDate || row?.date || row?.visitDate || row?.VisitDate || 'unknown'}`
  ];

  return [...new Set(values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function getSchoolIdentity(row) {
  return getSchoolIdentityCandidates(row)[0] || `${row.monitorId || 'unknown'}-${row.assignedDate || row.date || row.visitDate || row.VisitDate || 'unknown'}`;
}

export function buildMonitorPerformanceSummary({ schools = [], filters = {}, assignmentRows = [] }) {
  const month = normalizeMonth(filters.month || filters.selectedMonth || '');
  const selectedDistricts = Array.isArray(filters.districts)
    ? filters.districts
    : filters.district
      ? [filters.district]
      : [];
  const selectedDistrictSet = new Set(selectedDistricts.map((district) => String(district || '').trim().toLowerCase()).filter(Boolean));

  const schoolVisitDates = new Map();
  (Array.isArray(schools) ? schools : []).forEach((school) => {
    const visitDates = Array.isArray(school?.visitDates) && school.visitDates.length ? school.visitDates : [school?.lastVisitDate].filter(Boolean);
    const identityKeys = getSchoolIdentityCandidates(school);

    visitDates.forEach((value) => {
      const date = normalizeDateOnly(value);
      if (!date || (month && !date.startsWith(month))) return;
      identityKeys.forEach((schoolKey) => {
        const dateSet = schoolVisitDates.get(schoolKey) || new Set();
        dateSet.add(date);
        schoolVisitDates.set(schoolKey, dateSet);
      });
    });
  });

  const monitorStats = new Map();

  (Array.isArray(assignmentRows) ? assignmentRows : []).forEach((row) => {
    const district = normalizeDistrict(row.district || row.District || '');
    const monitorName = normalizeMonitorName(row.monitorName || row.userName || row.UserName || row.user_name, row.monitorId || row.userId || '');
    const monitorId = String(row.monitorId || row.userId || row.UserId || '').trim();
    const normalizedDate = normalizeDateOnly(row.assignedDate || row.date || row.visitDate || row.VisitDate || row.AssignedDate);
    if (!normalizedDate || (month && !normalizedDate.startsWith(month))) return;

    const key = buildMonitorKey(monitorName, monitorId);
    const current = monitorStats.get(key) || {
      monitorName,
      monitorId,
      district: district || 'N/A',
      daily: {},
      dates: new Set(),
      visitedDates: new Set()
    };

    if (district) current.district = district;

    const dateBucket = current.daily[normalizedDate] || { assigned: 0, visited: 0, schoolKeys: new Set(), visitedSchoolKeys: new Set() };
    const schoolIdentityKeys = getSchoolIdentityCandidates(row);

    const assignedSchoolIdentity = schoolIdentityKeys[0] || getSchoolIdentity(row);
    if (!dateBucket.schoolKeys.has(assignedSchoolIdentity)) {
      dateBucket.assigned += 1;
      dateBucket.schoolKeys.add(assignedSchoolIdentity);
    }

    const matchedVisitDates = new Set();
    schoolIdentityKeys.forEach((schoolKey) => {
      const schoolDateSet = schoolVisitDates.get(schoolKey) || new Set();
      if (schoolDateSet.has(normalizedDate)) {
        matchedVisitDates.add(schoolKey);
      }
    });

    if (matchedVisitDates.size > 0 && !dateBucket.visitedSchoolKeys.has(assignedSchoolIdentity)) {
      dateBucket.visited += 1;
      dateBucket.visitedSchoolKeys.add(assignedSchoolIdentity);
      current.visitedDates.add(normalizedDate);
    }

    current.daily[normalizedDate] = dateBucket;
    current.dates.add(normalizedDate);
    monitorStats.set(key, current);
  });

  const rowsOut = [...monitorStats.values()].map((entry) => {
    const dates = [...entry.dates].sort();
    const totalAssigned = dates.reduce((sum, date) => sum + (entry.daily[date]?.assigned || 0), 0);
    const totalVisited = dates.reduce((sum, date) => sum + (entry.daily[date]?.visited || 0), 0);
    const totalWorkingDays = dates.filter((date) => (entry.daily[date]?.assigned || 0) > 0).length;
    const daysVisited = entry.visitedDates.size;
    const daysNotVisited = Math.max(0, totalWorkingDays - daysVisited);
    const coveragePct = totalAssigned > 0 ? Number(((totalVisited / totalAssigned) * 100).toFixed(1)) : 0;

    const daily = {};
    dates.forEach((date) => {
      const day = entry.daily[date] || { assigned: 0, visited: 0 };
      daily[date] = { assigned: day.assigned || 0, visited: day.visited || 0 };
    });

    return {
      district: entry.district || 'N/A',
      monitorName: entry.monitorName,
      monitorId: entry.monitorId,
      totalAssigned,
      totalVisited,
      coveragePct,
      totalWorkingDays,
      daysVisited,
      daysNotVisited,
      daily
    };
  }).filter((row) => {
    if (!selectedDistrictSet.size) return true;
    const district = normalizeDistrict(row.district);
    return !district || selectedDistrictSet.has(district.toLowerCase());
  });

  const sorted = rowsOut.sort((a, b) => {
    if (a.district !== b.district) return a.district.localeCompare(b.district);
    if (b.coveragePct !== a.coveragePct) return b.coveragePct - a.coveragePct;
    return a.monitorName.localeCompare(b.monitorName);
  });

  return {
    month,
    rows: sorted,
    totals: {
      totalAssigned: sorted.reduce((sum, row) => sum + row.totalAssigned, 0),
      totalVisited: sorted.reduce((sum, row) => sum + row.totalVisited, 0),
      totalWorkingDays: sorted.reduce((sum, row) => sum + row.totalWorkingDays, 0),
      daysVisited: sorted.reduce((sum, row) => sum + row.daysVisited, 0),
      daysNotVisited: sorted.reduce((sum, row) => sum + row.daysNotVisited, 0)
    }
  };
}

function safeSheetName(name) {
  return String(name || 'District').replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'District';
}

function getExcelColumnName(index) {
  let result = '';
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export async function buildMonitorPerformanceWorkbook(payload, filters = {}, assignmentRows = [], noDataReason = '') {
  const { rows, month } = buildMonitorPerformanceSummary({
    schools: payload?.schools || [],
    filters,
    assignmentRows
  });

  const fallbackMessage = noDataReason || (month
    ? `No monitor performance data found for ${month}.`
    : 'No monitor performance data found for the selected filters.');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Badin School Watch';
  workbook.created = new Date();
  workbook.modified = new Date();

  const districts = Array.from(new Set(rows.map((row) => row.district).filter(Boolean))).sort();
  const sheetDistricts = districts.length ? districts : ['All Districts'];
  const allDates = Array.from(new Set(rows.flatMap((row) => Object.keys(row.daily)))).sort();

  sheetDistricts.forEach((districtName) => {
    const districtRows = rows.filter((row) => row.district === districtName);
    const columns = [
      { header: 'Monitor Name', key: 'monitorName', width: 24 },
      { header: 'Grand Total Assigned', key: 'totalAssigned', width: 20 },
      { header: 'Grand Total Visited', key: 'totalVisited', width: 20 },
      { header: 'Coverage %', key: 'coveragePct', width: 14 },
      { header: 'Total Working Days', key: 'totalWorkingDays', width: 18 },
      { header: 'No of Days Visited', key: 'daysVisited', width: 18 },
      { header: 'No of Days Not Visited', key: 'daysNotVisited', width: 20 }
    ];

    const dateHeaders = allDates.length
      ? Array.from(new Set(allDates.filter((date) => districtRows.some((row) => row.daily[date] !== undefined))))
      : [];

    dateHeaders.forEach((date) => {
      columns.push({ header: formatDateForColumn(date), key: `day_${date}`, width: 18 });
    });

    const sheet = workbook.addWorksheet(safeSheetName(districtName));
    sheet.columns = columns;

    if (!districtRows.length) {
      const message = fallbackMessage;
      sheet.addRow({ monitorName: message });
      const row = sheet.getRow(1);
      row.font = { bold: true, color: { argb: 'FFB42318' } };
      row.alignment = { wrapText: true };
      const lastColumn = getExcelColumnName(columns.length);
      sheet.mergeCells(`A1:${lastColumn}1`);
      sheet.getCell('A1').value = message;
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      return;
    }

    districtRows.forEach((row) => {
      const record = {
        monitorName: row.monitorName,
        totalAssigned: row.totalAssigned,
        totalVisited: row.totalVisited,
        coveragePct: row.coveragePct,
        totalWorkingDays: row.totalWorkingDays,
        daysVisited: row.daysVisited,
        daysNotVisited: row.daysNotVisited
      };

      dateHeaders.forEach((date) => {
        const day = row.daily[date] || { assigned: 0, visited: 0 };
        record[`day_${date}`] = `${day.assigned || 0}-${day.visited || 0}`;
      });

      sheet.addRow(record);
    });

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  });

  if (!workbook.worksheets.length) {
    const emptyColumns = [
      { header: 'Monitor Name', key: 'monitorName', width: 24 },
      { header: 'Grand Total Assigned', key: 'totalAssigned', width: 20 },
      { header: 'Grand Total Visited', key: 'totalVisited', width: 20 },
      { header: 'Coverage %', key: 'coveragePct', width: 14 },
      { header: 'Total Working Days', key: 'totalWorkingDays', width: 18 },
      { header: 'No of Days Visited', key: 'daysVisited', width: 18 },
      { header: 'No of Days Not Visited', key: 'daysNotVisited', width: 20 }
    ];
    const emptySheet = workbook.addWorksheet('Monitor Performance');
    emptySheet.columns = emptyColumns;
    const message = fallbackMessage;
    emptySheet.addRow({ monitorName: message });
    const row = emptySheet.getRow(1);
    row.font = { bold: true, color: { argb: 'FFB42318' } };
    row.alignment = { wrapText: true };
    const lastColumn = getExcelColumnName(emptyColumns.length);
    emptySheet.mergeCells(`A1:${lastColumn}1`);
    emptySheet.getCell('A1').value = message;
    emptySheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  return workbook.xlsx.writeBuffer();
}
