import ExcelJS from 'exceljs';

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFilterValue(value, fallback = 'all') {
  const next = String(value || '').trim();
  return next || fallback;
}

function parseFilters(query = {}) {
  return {
    taluka: normalizeFilterValue(query.taluka),
    level: normalizeFilterValue(query.level),
    gender: normalizeFilterValue(query.gender),
    status: normalizeFilterValue(query.status),
    selectedDate: String(query.selectedDate || '').trim(),
    startMonth: String(query.startMonth || '').trim(),
    endMonth: String(query.endMonth || '').trim(),
    daysRange: Math.max(0, parseNumber(query.daysRange, 0)),
    minRisk: Math.max(0, parseNumber(query.minRisk, 0))
  };
}

function matchesFilter(value, selected) {
  return selected === 'all' || String(value || '') === selected;
}

function passesSchoolFilters(school, filters) {
  return (
    matchesFilter(school.taluka, filters.taluka) &&
    matchesFilter(school.level, filters.level) &&
    matchesFilter(school.gender, filters.gender) &&
    matchesFilter(school.schoolStatus, filters.status) &&
    Number(school.riskScore || 0) >= Number(filters.minRisk || 0)
  );
}

function normalizeMonthRange(startMonth, endMonth) {
  const s = String(startMonth || '').trim();
  const e = String(endMonth || '').trim();
  if (!s && !e) return { startMonth: '', endMonth: '' };
  if (!s) return { startMonth: e, endMonth: e };
  if (!e) return { startMonth: s, endMonth: s };
  return s <= e ? { startMonth: s, endMonth: e } : { startMonth: e, endMonth: s };
}

function monthRange(startMonth, endMonth) {
  const normalized = normalizeMonthRange(startMonth, endMonth);
  if (!normalized.startMonth) return [];
  const months = [];
  let current = new Date(`${normalized.startMonth}-01T00:00:00Z`);
  const end = new Date(`${normalized.endMonth}-01T00:00:00Z`);
  while (current <= end) {
    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    current = new Date(Date.UTC(year, current.getUTCMonth() + 1, 1));
  }
  return months;
}

function monthLabel(isoMonth) {
  if (!isoMonth) return '';
  const [year, month] = String(isoMonth).split('-');
  const label = new Date(`${year}-${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long' });
  return `${label} ${year}`;
}

function getAttendanceStatus(entry) {
  if (String(entry.Present || '').toLowerCase() === 'yes') return 'Present';
  if (entry.Leave_Type) return String(entry.Leave_Type).trim();
  if (entry.Absent_Reason) return String(entry.Absent_Reason).trim();
  return 'Absent';
}

function employeeKey(school, entry) {
  const id = entry.Employee_CNIC || entry.Employee_Code || entry.Employee_Id || entry.Employee_Name || '';
  return `${school.semis}__${String(id).trim()}`;
}

function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function buildBaseRow(school, entry) {
  return {
    semis: str(school.semis),
    schoolName: str(school.schoolName),
    schoolLevel: str(school.level),
    district: str(school.district),
    tehsil: str(school.taluka),
    uc: str(school.uc),
    employeeName: str(entry.Employee_Name),
    employeeGender: str(entry.Employee_Gender),
    cnic: str(entry.Employee_CNIC),
    staffType: str(entry.Staff_Type),
    employeeInfoId: str(entry.Employee_Id || entry.Employee_Info_Id),
    employeeCode: str(entry.Employee_Code),
    designationName: str(entry.Designation_Name),
    monthData: {},
    singleStatus: ''
  };
}

// Convert a cached parsed teacher object back to raw-entry shape
function teacherToRaw(t) {
  return {
    Employee_Name: t.name || '',
    Employee_Gender: t.gender || '',
    Employee_CNIC: t.cnic || '',
    Staff_Type: t.staffType || '',
    Employee_Id: t.id || '',
    Employee_Code: t.employeeCode || '',
    Designation_Name: t.designationName || '',
    Present: t.present ? 'Yes' : 'No',
    Leave_Type: t.leaveType || null,
    Absent_Reason: t.absentReason || null
  };
}

export async function buildEmployeeAttendanceReportWorkbook(payload, query = {}) {
  const filters = parseFilters(query);
  const schools = Array.isArray(payload?.schools) ? payload.schools : [];
  const months = monthRange(filters.startMonth, filters.endMonth);
  const useMonthRange = months.length > 0;

  // rowMap key: school.semis + employee CNIC/code
  const rowMap = new Map();

  for (const school of schools) {
    if (!passesSchoolFilters(school, filters)) continue;

    if (useMonthRange) {
      // school.monthlyAttendance is populated by the background prefetch in index.js.
      // Fall back to cached teachers only for the month matching the last visit date.
      const monthly = school.monthlyAttendance || {};

      for (const month of months) {
        let entries = Array.isArray(monthly[month]) ? monthly[month] : null;

        if (!entries) {
          if (String(school.lastVisitDate || '').slice(0, 7) === month) {
            entries = (school.attendance?.teachers || []).map(teacherToRaw);
          } else {
            continue;
          }
        }

        for (const entry of entries) {
          const key = employeeKey(school, entry);
          if (!rowMap.has(key)) rowMap.set(key, buildBaseRow(school, entry));
          rowMap.get(key).monthData[month] = getAttendanceStatus(entry);
        }
      }
    } else {
      // No month range — show attendance from the cached latest visit
      const teachers = Array.isArray(school.attendance?.teachers) ? school.attendance.teachers : [];
      for (const teacher of teachers) {
        const entry = teacherToRaw(teacher);
        const key = employeeKey(school, entry);
        if (!rowMap.has(key)) rowMap.set(key, buildBaseRow(school, entry));
        rowMap.get(key).singleStatus = getAttendanceStatus(entry);
      }
    }
  }

  // Compute summary columns across ALL selected months
  const rows = Array.from(rowMap.values()).map((row) => {
    const statuses = Object.values(row.monthData);
    const absconder = statuses.some((s) => /abscond/i.test(s)) ? 1 : 0;
    const habitualAbsentees = statuses.filter((s) => /habitual/i.test(s)).length;
    const absent = statuses.filter((s) => {
      const lower = s.toLowerCase();
      return lower === 'absent' || /abscond|habitual|thumb not match/i.test(lower);
    }).length;
    return { ...row, absconder, habitualAbsentees, absent };
  });

  // Build workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Badin School Watch';
  workbook.created = new Date();
  workbook.modified = new Date();

  const fixedColumns = [
    { header: 'School SEMIS Code', key: 'semis', width: 18 },
    { header: 'School Name', key: 'schoolName', width: 32 },
    { header: 'School Level', key: 'schoolLevel', width: 16 },
    { header: 'District Name', key: 'district', width: 14 },
    { header: 'Tehsil Name', key: 'tehsil', width: 18 },
    { header: 'UC Name', key: 'uc', width: 22 },
    { header: 'Employee Name', key: 'employeeName', width: 28 },
    { header: 'Employee Gender', key: 'employeeGender', width: 16 },
    { header: 'CNIC', key: 'cnic', width: 18 },
    { header: 'Staff Type', key: 'staffType', width: 18 },
    { header: 'Employee Info Id', key: 'employeeInfoId', width: 18 },
    { header: 'Employee Code', key: 'employeeCode', width: 16 },
    { header: 'Designation Name', key: 'designationName', width: 22 }
  ];

  const monthColumns = months.map((month) => ({
    header: monthLabel(month),
    key: `month_${month}`,
    width: 20
  }));

  const summaryColumns = useMonthRange
    ? [
        { header: 'Absconder', key: 'absconder', width: 12 },
        { header: 'Habitual Absentees', key: 'habitualAbsentees', width: 18 },
        { header: 'Absent', key: 'absent', width: 10 }
      ]
    : [{ header: 'Status', key: 'singleStatus', width: 20 }];

  const allColumns = [...fixedColumns, ...monthColumns, ...summaryColumns];

  // Flatten a processed row to Excel-ready format.
  // monthStatusTest: optional predicate — if provided, a month cell is only written
  // when the predicate returns true for that month's status; otherwise the cell is blank.
  // Passing no predicate (or null) shows all available statuses in all months.
  function flattenRow(row, monthStatusTest) {
    const flat = {
      semis: row.semis,
      schoolName: row.schoolName,
      schoolLevel: row.schoolLevel,
      district: row.district,
      tehsil: row.tehsil,
      uc: row.uc,
      employeeName: row.employeeName,
      employeeGender: row.employeeGender,
      cnic: row.cnic,
      staffType: row.staffType,
      employeeInfoId: row.employeeInfoId,
      employeeCode: row.employeeCode,
      designationName: row.designationName,
      singleStatus: row.singleStatus || '',
      absconder: row.absconder,
      habitualAbsentees: row.habitualAbsentees,
      absent: row.absent
    };
    months.forEach((month) => {
      const status = row.monthData[month] || '';
      flat[`month_${month}`] = monthStatusTest ? (monthStatusTest(status) ? status : '') : status;
    });
    return flat;
  }

  // Employee Attendance: all statuses in all months
  const dataRows = rows.map((r) => flattenRow(r));

  // Absconder: only show months where the employee's status was "Absconder"
  const absconderDataRows = rows
    .filter((r) => r.absconder > 0)
    .map((r) => flattenRow(r, (s) => /abscond/i.test(s)));

  // Habitual Absentee: only show months where the status was "Habitual Absentee"
  const habitualDataRows = rows
    .filter((r) => r.habitualAbsentees > 0)
    .map((r) => flattenRow(r, (s) => /habitual/i.test(s)));

  // One Time and Two Time Absent: all available statuses in all months
  const oneOrMoreAbsentDataRows = rows
    .filter((r) => r.absent >= 1)
    .map((r) => flattenRow(r));

  function addSheet(title, sheetRows) {
    const safe = String(title || '').replace(/[\*\?\:\\\/\[\]]/g, ' ').slice(0, 31).trim() || 'Sheet';
    const sheet = workbook.addWorksheet(safe);
    sheet.columns = allColumns;
    sheet.addRows(sheetRows.map((r) => allColumns.map((col) => r[col.key] ?? '')));
    const hdr = sheet.getRow(1);
    hdr.font = { bold: true };
    hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    sheet.columns.forEach((col) => { if (!col.width) col.width = 14; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return sheet;
  }

  addSheet('Employee Attendance', dataRows);
  if (absconderDataRows.length) addSheet('Absconder', absconderDataRows);
  if (habitualDataRows.length) addSheet('Habitual Absentee', habitualDataRows);
  if (oneOrMoreAbsentDataRows.length) addSheet('One Time and Two Time', oneOrMoreAbsentDataRows);

  return workbook.xlsx.writeBuffer();
}
