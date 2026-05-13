import 'dotenv/config';

const headers = JSON.parse(process.env.MNE_API_HEADERS_JSON || '{}');
const schoolId = process.argv[2] || '2457515';
const base = 'https://mne.seld.gos.pk/Services/api';

async function fetchJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

const visitsJson = await fetchJson(`${base}//Schools/GetMSchoollastvisitsById?SchoolId=${schoolId}`);
const mid = visitsJson?.Data?.[0]?.Monitoring_ID;
console.log('schoolId', schoolId, 'monitoringId', mid);

if (!mid) {
  console.log('No monitoring id found.');
  process.exit(0);
}

const detJson = await fetchJson(`${base}//Schools/GetMonitoringDetailsByMonitoringId?MonitoringId=${mid}`);
const rows = Array.isArray(detJson?.Data) ? detJson.Data : [];

let urlRows = 0;
let hintRows = 0;
for (const row of rows) {
  const serialized = JSON.stringify(row);
  if (/https?:\/\/|FileUpload|\.jpg|\.jpeg|\.png|\.webp|\.gif/i.test(serialized)) {
    urlRows += 1;
    console.log('match', row?.Title || row?.Question || 'NO_TITLE');
    console.log('keys', Object.keys(row).join(','));
    console.log(String(row?.Input || '').slice(0, 400));
    console.log(JSON.stringify(row).slice(0, 1200));
  }

  if (/image|photo|picture|upload|file|attachment|muster|washroom|toilet/i.test(serialized)) {
    hintRows += 1;
    console.log('hint', row?.Title || row?.Question || 'NO_TITLE');
    console.log('keys', Object.keys(row).join(','));
  }
}

console.log('rows', rows.length, 'urlRows', urlRows, 'hintRows', hintRows);
