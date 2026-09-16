import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

const root = process.cwd();
const inputPath = path.join(root, 'Field_Assessment_Data_Entry.xlsx');
const outputPath = path.join(root, 'filled_Field_Assessment_Data_Entry.xlsx');
const schoolCsvPath = path.join(root, 'school_data.csv');
const headers = JSON.parse(process.env.MNE_API_HEADERS_JSON || '{}');
const base = (process.env.MNE_API_BASE_URL || 'https://mne.seld.gos.pk/Services/api').replace(/\/$/, '');
const concurrency = Math.max(1, Number(process.env.MNE_API_CONCURRENCY || 4));

if (!Object.keys(headers).length) throw new Error('MNE_API_HEADERS_JSON is required.');

function text(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function number(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function getByCandidates(row, names) {
  const entries = Object.entries(row || {});
  const lowered = new Map(entries.map(([key, val]) => [String(key).toLowerCase().replace(/[ _-]/g, ''), val]));
  for (const name of names) {
    const found = lowered.get(String(name).toLowerCase().replace(/[ _-]/g, ''));
    if (found !== undefined && found !== null && String(found).trim() !== '') return found;
  }
  return '';
}

function detailsByPattern(rows, patterns, fallbackIndexes = []) {
  for (const row of rows) {
    const label = `${getByCandidates(row, ['Title', 'Question', 'QuestionTitle', 'Name', 'KRAName'])} ${getByCandidates(row, ['ReferenceCode', 'Code'])}`.toLowerCase();
    if (patterns.some(p => p.test(label))) {
      return text(getByCandidates(row, ['Input', 'DataValue', 'Value', 'Answer']));
    }
  }
  for (const idx of fallbackIndexes) {
    const found = rows[idx];
    if (found) return text(getByCandidates(found, ['Input', 'DataValue', 'Value', 'Answer']));
  }
  return '';
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

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fillOne(template, index, rowNum) {
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
  blank[11] = text(source.GPS?.split(',')?.[0] || '');
  blank[12] = text(source.GPS?.split(',')?.[1] || '');

  if (!schoolId) return blank;

  try {
    const [schoolInfo, visitsResponse] = await Promise.all([
      getJson(`${base}//Schools/GetSchoolById/${encodeURIComponent(schoolId)}`),
      getJson(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${encodeURIComponent(schoolId)}`)
    ]);

    const visits = Array.isArray(visitsResponse?.Data) ? visitsResponse.Data : [];
    const latest = [...visits].sort((a, b) => new Date(b.Monitoring_Start_Date) - new Date(a.Monitoring_Start_Date))[0];

    blank[3] = text(getByCandidates(schoolInfo, ['District_Name']) || blank[3]);
    blank[4] = text(getByCandidates(schoolInfo, ['Tehsil_Name']) || blank[4]);
    blank[5] = text(getByCandidates(schoolInfo, ['UC_Name']) || blank[5]);
    blank[7] = text(`${getByCandidates(schoolInfo, ['School_Prefix'])} ${getByCandidates(schoolInfo, ['School_Name'])}`.trim() || blank[7]);
    blank[9] = text(getByCandidates(schoolInfo, ['Gender']) || template[9]);
    blank[10] = text(getByCandidates(schoolInfo, ['Level']) || template[10]);
    blank[11] = text(getByCandidates(schoolInfo, ['LATITUDE', 'Latitude']) || blank[11]);
    blank[12] = text(getByCandidates(schoolInfo, ['LONGITUDE', 'Longitude']) || blank[12]);

    if (!latest?.Monitoring_ID) return blank;
    const visitDate = text(latest.Monitoring_Start_Date);
    blank[15] = visitDate.slice(0, 10);
    blank[16] = visitDate.length > 10 ? visitDate.slice(11, 19) : '';
    blank[18] = text(latest.User_Name);

    const [details, attendance, enrollment] = await Promise.all([
      getJson(`${base}//Schools/GetMonitoringDetailsByMonitoringId?MonitoringId=${encodeURIComponent(latest.Monitoring_ID)}`),
      getJson(`${base}//Schools/GetTeachersAttendanceByMonitoringId?MonitoringId=${encodeURIComponent(latest.Monitoring_ID)}`),
      getJson(`${base}//Schools/GetEnrolmentsByMonitoringId?MonitoringId=${encodeURIComponent(latest.Monitoring_ID)}`)
    ]);

    const rows = Array.isArray(details?.Data) ? details.Data : [];
    const teachers = Array.isArray(attendance?.Data) ? attendance.Data : [];
    const enrollRows = Array.isArray(enrollment?.Data) ? enrollment.Data : [];

    blank[19] = detailsByPattern(rows, [/building.*(exist|status)|school.status/i], [0]);
    blank[20] = detailsByPattern(rows, [/building.type|ownership/i], [13]);
    blank[21] = detailsByPattern(rows, [/boundary.wall/i], [19]);
    blank[22] = detailsByPattern(rows, [/gate\b/i]);
    blank[23] = detailsByPattern(rows, [/total.classroom|number.of.classroom|classroom.number/i], [74]);
    blank[24] = detailsByPattern(rows, [/classroom.condition/i]);
    blank[25] = detailsByPattern(rows, [/roof.condition/i]);
    blank[26] = detailsByPattern(rows, [/washroom.boy|boy.washroom|wc.male|male.wc/i]);
    blank[27] = detailsByPattern(rows, [/washroom.girl|girl.washroom|wc.female|female.wc/i]);
    blank[28] = detailsByPattern(rows, [/washroom.pwd|pwd.washroom|wc.pwd/i]);
    blank[29] = detailsByPattern(rows, [/water.supply|drinking.water/i], [97, 21]);
    blank[30] = detailsByPattern(rows, [/electricity/i], [33, 56]);
    blank[31] = detailsByPattern(rows, [/furniture/i]);
    blank[32] = detailsByPattern(rows, [/science.lab/i]);
    blank[33] = detailsByPattern(rows, [/computer.lab/i]);
    blank[34] = detailsByPattern(rows, [/library|librar/i]);
    blank[35] = detailsByPattern(rows, [/playground|open.area|open.space/i]);
    blank[36] = detailsByPattern(rows, [/cause.of.damage/i]);
    blank[37] = detailsByPattern(rows, [/extent.of.damage|damage.extent/i]);
    blank[38] = detailsByPattern(rows, [/brief.description|description.of.damage/i]);

    const numericTotal = (row) => {
      return Object.entries(row || {})
        .filter(([k, v]) => !['Title', 'Question', 'Name'].includes(k) && v !== '' && v !== null && Number.isFinite(Number(v)))
        .reduce((sum, [, v]) => sum + Number(v), 0);
    };

    const boys = numericTotal(enrollRows[0]);
    const girls = numericTotal(enrollRows[1]);
    const reportedTotal = numericTotal(enrollRows[6]);
    const totalEnrolled = boys + girls || reportedTotal;

    blank[39] = boys || '';
    blank[41] = girls || '';
    blank[43] = totalEnrolled || '';

    const teachingStaff = teachers.filter(t => !text(getByCandidates(t, ['Staff_Type', 'StaffType'])).toLowerCase().includes('non'));
    const nonTeachingStaff = teachers.filter(t => text(getByCandidates(t, ['Staff_Type', 'StaffType'])).toLowerCase().includes('non'));
    const teachingPresent = teachingStaff.filter(t => text(getByCandidates(t, ['Present'])).toLowerCase() === 'yes').length;
    const nonTeachingPresent = nonTeachingStaff.filter(t => text(getByCandidates(t, ['Present'])).toLowerCase() === 'yes').length;

    blank[45] = teachingStaff.length || '';
    blank[46] = teachingPresent || '';
    blank[47] = nonTeachingStaff.length || '';
    blank[48] = nonTeachingPresent || '';

    return blank;
  } catch (error) {
    console.error(`Row ${rowNum + 1} SEMIS ${semis}: ${error.message}`);
    return blank;
  }
}

console.log('Reading workbook...');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(inputPath);
const sheet = workbook.getWorksheet('School Assessment Data');
if (!sheet) throw new Error('Sheet "School Assessment Data" not found.');

const headersRow = sheet.getRow(2).values.slice(1, 85);
const templates = [];
for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
  const row = sheet.getRow(rowNumber).values.slice(1, 85);
  if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
    templates.push(row);
  }
}

console.log(`Processing ${templates.length} schools...`);
const index = schoolIndex();
const outputRows = [];

for (let start = 0; start < templates.length; start += concurrency) {
  const batch = templates.slice(start, start + concurrency);
  const rows = await Promise.all(batch.map((template, offset) => fillOne(template, index, start + offset)));
  outputRows.push(...rows);
  console.log(`Processed ${Math.min(start + concurrency, templates.length)}/${templates.length}`);
}

console.log('Building Excel file...');
const outWorkbook = new ExcelJS.Workbook();
const outSheet = outWorkbook.addWorksheet('School Assessment Data');

outSheet.columns = headersRow.map((header, i) => ({
  header: text(header),
  key: `col_${i}`,
  width: 18
}));

const headerRow = outSheet.getRow(1);
headerRow.font = { bold: true };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

outputRows.forEach(row => {
  const rowData = {};
  row.forEach((v, i) => {
    rowData[`col_${i}`] = v;
  });
  outSheet.addRow(rowData);
});

outSheet.views = [{ state: 'frozen', ySplit: 2 }];

await outWorkbook.xlsx.writeFile(outputPath);
console.log(`Wrote ${outputRows.length} rows to ${outputPath}`);
