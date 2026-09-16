import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

const root = process.cwd();
const inputPath = path.join(root, 'Field_Assessment_Data_Entry.xlsx');
const outputPath = path.join(root, 'filled_Field_Assessment_Data_Entry.csv');
const schoolCsvPath = path.join(root, 'school_data.csv');
const headers = JSON.parse(process.env.MNE_API_HEADERS_JSON || '{}');
const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');
const concurrency = Math.max(1, Number(process.env.MNE_API_CONCURRENCY || 8));

if (!Object.keys(headers).length) throw new Error('MNE_API_HEADERS_JSON is required.');

function value(row, names) {
  const entries = Object.entries(row || {});
  const lowered = new Map(entries.map(([key, item]) => [String(key).toLowerCase().replace(/[ _-]/g, ''), item]));
  for (const name of names) {
    const found = lowered.get(String(name).toLowerCase().replace(/[ _-]/g, ''));
    if (found !== undefined && found !== null && String(found).trim() !== '') return found;
  }
  return '';
}

function text(valueToFormat) {
  return valueToFormat === null || valueToFormat === undefined ? '' : String(valueToFormat).trim();
}

function datePart(valueToFormat) {
  const raw = text(valueToFormat);
  return raw ? raw.slice(0, 10) : '';
}

function timePart(valueToFormat) {
  const raw = text(valueToFormat);
  return raw.length > 10 ? raw.slice(11, 19) : '';
}

function detailRows(details) {
  return Array.isArray(details?.Data) ? details.Data : [];
}

function detailValue(rows, patterns, fallbackIndexes = []) {
  for (const row of rows) {
    const label = `${value(row, ['Title', 'Question', 'QuestionTitle', 'Name', 'KRAName'])} ${value(row, ['ReferenceCode', 'Code'])}`.toLowerCase();
    if (patterns.some((pattern) => pattern.test(label))) return text(value(row, ['Input', 'DataValue', 'Value', 'Answer']));
  }
  for (const index of fallbackIndexes) {
    const found = rows[index];
    if (found) return text(value(found, ['Input', 'DataValue', 'Value', 'Answer']));
  }
  return '';
}

function attendanceRows(data) {
  return Array.isArray(data?.Data) ? data.Data : [];
}

function enrollmentTotals(data) {
  const rows = Array.isArray(data?.Data) ? data.Data : [];
  const rowNumbers = (row) => Object.entries(row || {})
    .filter(([key, item]) => !['Title', 'Question', 'Name'].includes(key) && item !== '' && item !== null && Number.isFinite(Number(item)))
    .reduce((sum, [, item]) => sum + Number(item), 0);
  const boys = rowNumbers(rows[0]);
  const girls = rowNumbers(rows[1]);
  const reportedTotal = rowNumbers(rows[6]);
  return { boys, girls, total: boys + girls || reportedTotal };
}

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}

function schoolIndex() {
  const parsed = Papa.parse(fs.readFileSync(schoolCsvPath, 'utf8'), { header: true, skipEmptyLines: true });
  const bySemis = new Map();
  for (const row of parsed.data) {
    const semis = text(row.SEMIS);
    if (semis) bySemis.set(semis, row);
  }
  return bySemis;
}

async function fillOne(template, index, rowIndex) {
  const semis = text(template[2]);
  const source = index.get(semis) || {};
  const schoolId = text(source['School ID']);
  const blank = Array(84).fill('');
  blank[0] = text(template[0]);
  blank[1] = text(template[1]);
  blank[2] = semis;
  blank[3] = text(source.District || 'Badin');
  blank[4] = text(source.Tehsil);
  blank[5] = text(source.UnionCouncil);
  blank[7] = text(source.Name);
  blank[11] = text(source.GPS).split(',')[0];
  blank[12] = text(source.GPS).split(',')[1];

  if (!schoolId) return blank;

  try {
    const [schoolInfo, visitsResponse] = await Promise.all([
      getJson(`${base}//Schools/GetSchoolById/${encodeURIComponent(schoolId)}`),
      getJson(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${encodeURIComponent(schoolId)}`)
    ]);
    const visits = Array.isArray(visitsResponse?.Data) ? visitsResponse.Data : [];
    const latest = [...visits].sort((a, b) => new Date(b.Monitoring_Start_Date) - new Date(a.Monitoring_Start_Date))[0];
    const info = schoolInfo || {};

    blank[3] = text(value(info, ['District_Name']) || blank[3]);
    blank[4] = text(value(info, ['Tehsil_Name']) || blank[4]);
    blank[5] = text(value(info, ['UC_Name']) || blank[5]);
    blank[7] = text(`${value(info, ['School_Prefix'])} ${value(info, ['School_Name'])}`.trim() || blank[7]);
    blank[9] = text(value(info, ['Gender']) || template[9]);
    blank[10] = text(value(info, ['Level']) || template[10]);
    blank[11] = text(value(info, ['LATITUDE', 'Latitude']) || blank[11]);
    blank[12] = text(value(info, ['LONGITUDE', 'Longitude']) || blank[12]);

    if (!latest?.Monitoring_ID) return blank;
    blank[15] = datePart(latest.Monitoring_Start_Date);
    blank[16] = timePart(latest.Monitoring_Start_Date);
    blank[18] = text(latest.User_Name);

    const [details, attendance, enrollment] = await Promise.all([
      getJson(`${base}//Schools/GetMonitoringDetailsByMonitoringId?MonitoringId=${encodeURIComponent(latest.Monitoring_ID)}`),
      getJson(`${base}//Schools/GetTeachersAttendanceByMonitoringId?MonitoringId=${encodeURIComponent(latest.Monitoring_ID)}`),
      getJson(`${base}//Schools/GetEnrolmentsByMonitoringId?MonitoringId=${encodeURIComponent(latest.Monitoring_ID)}`)
    ]);
    const rows = detailRows(details);
    const teachers = attendanceRows(attendance);
    const totals = enrollmentTotals(enrollment);

    blank[19] = detailValue(rows, [/building\s*(exist|status)|school\s*status/], [0]);
    blank[20] = detailValue(rows, [/building\s*type|ownership/], [13]);
    blank[21] = detailValue(rows, [/boundary\s*wall/], [19]);
    blank[22] = detailValue(rows, [/gate/]);
    blank[23] = detailValue(rows, [/total\s*classroom|number\s*of\s*classroom/], [74]);
    blank[24] = detailValue(rows, [/classroom.*condition/]);
    blank[25] = detailValue(rows, [/roof\s*condition/]);
    blank[26] = detailValue(rows, [/washroom.*boy|boys.*washroom/]);
    blank[27] = detailValue(rows, [/washroom.*girl|girls.*washroom/]);
    blank[28] = detailValue(rows, [/washroom.*pwd|pwd.*washroom/]);
    blank[29] = detailValue(rows, [/water\s*supply|drinking\s*water/], [97, 21]);
    blank[30] = detailValue(rows, [/electricity/], [33, 56]);
    blank[31] = detailValue(rows, [/furniture/]);
    blank[32] = detailValue(rows, [/science\s*lab/]);
    blank[33] = detailValue(rows, [/computer\s*lab/]);
    blank[34] = detailValue(rows, [/librar/]);
    blank[35] = detailValue(rows, [/playground|open\s*area/]);
    blank[36] = detailValue(rows, [/cause\s*of\s*damage/]);
    blank[37] = detailValue(rows, [/extent\s*of\s*damage/]);
    blank[38] = detailValue(rows, [/brief\s*description|damage\s*description/]);

    blank[39] = totals.boys || '';
    blank[41] = totals.girls || '';
    blank[43] = totals.total || '';
    blank[45] = teachers.length || '';
    blank[46] = teachers.filter((teacher) => text(value(teacher, ['Present'])).toLowerCase() === 'yes').length || '';
    blank[47] = teachers.filter((teacher) => /non.?teaching/i.test(text(value(teacher, ['Staff_Type', 'StaffType'])))).length || '';
    blank[48] = teachers.filter((teacher) => /non.?teaching/i.test(text(value(teacher, ['Staff_Type', 'StaffType']))) && text(value(teacher, ['Present'])).toLowerCase() === 'yes').length || '';

    return blank;
  } catch (error) {
    console.error(`Row ${rowIndex + 1} SEMIS ${semis}: ${error.message}`);
    return blank;
  }
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(inputPath);
const sheet = workbook.getWorksheet('School Assessment Data');
if (!sheet) throw new Error('Sheet "School Assessment Data" not found.');
const headersRow = sheet.getRow(2).values.slice(1, 85).map((header) => text(header));
const templates = [];
for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
  const row = sheet.getRow(rowNumber).values.slice(1, 85);
  if (row.some((cell) => cell !== null && cell !== undefined && cell !== '')) templates.push(row);
}
const index = schoolIndex();
const outputRows = [];
for (let start = 0; start < templates.length; start += concurrency) {
  const batch = templates.slice(start, start + concurrency);
  const rows = await Promise.all(batch.map((template, offset) => fillOne(template, index, start + offset)));
  outputRows.push(...rows);
  console.log(`Processed ${Math.min(start + concurrency, templates.length)}/${templates.length}`);
}
const csv = Papa.unparse([headersRow, ...outputRows], { newline: '\r\n' });
fs.writeFileSync(outputPath, csv, 'utf8');
console.log(`Wrote ${outputRows.length} rows to ${outputPath}`);
