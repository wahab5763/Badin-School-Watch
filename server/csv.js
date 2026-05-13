import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGpsPair(value) {
  if (!value) return { lat: null, lng: null };
  const parts = String(value).split(',').map((item) => item.trim());
  if (parts.length < 2) return { lat: null, lng: null };
  return {
    lat: parseNumber(parts[0]),
    lng: parseNumber(parts[1])
  };
}

function parseCoordinates(row) {
  const gpsPair = parseGpsPair(row.GPS || row.Gps || row.gps || '');
  const lat =
    gpsPair.lat ??
    parseNumber(row.LATITUDE) ??
    parseNumber(row.Latitude) ??
    parseNumber(row.lat);
  const lng =
    gpsPair.lng ??
    parseNumber(row.LONGITUDE) ??
    parseNumber(row.Longitude) ??
    parseNumber(row.lng);

  return { lat, lng };
}

export function readSchoolRows(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return parsed.data.map((row) => ({
    schoolId: String(row['School ID']).trim(),
    schoolName: String(row['Name']).trim(),
    semis: String(row['SEMIS']).trim(),
    coordinates: parseCoordinates(row)
  }));
}

function normalizeCsvHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, '');
}

function parseCsvRows(csvPath) {
  if (!csvPath) return [];
  const resolvedPath = path.resolve(process.cwd(), csvPath);
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
    if (!Array.isArray(parsed.data) || !parsed.data.length) return [];
    return parsed.data;
  } catch {
    return [];
  }
}

export function readMonitorAssignmentIdsFromCsv(csvPath) {
  const rows = parseCsvRows(csvPath);
  if (!rows.length) return [];

  const monitorIds = [];
  const seen = new Set();

  for (const row of rows) {
    const keys = Object.keys(row);
    if (!keys.length) continue;

    const idKey = keys.find((key) => {
      const normalized = normalizeCsvHeader(key);
      return ['userid', 'user_id', 'ma_id', 'maid', 'id', 'monitorid', 'monitor_id'].includes(normalized);
    });

    const nameKey = keys.find((key) => {
      const normalized = normalizeCsvHeader(key);
      return ['username', 'user_name', 'name', 'monitorname', 'monitor_name', 'fullname', 'full_name'].includes(normalized);
    });

    const userId = idKey ? String(row[idKey] || '').trim() : '';
    const userName = nameKey ? String(row[nameKey] || '').trim() : '';

    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    monitorIds.push({ userId, userName });
  }

  if (!monitorIds.length && rows.length > 0) {
    // support a plain one-column CSV without headers
    const firstKey = Object.keys(rows[0])[0];
    if (firstKey) {
      for (const row of rows) {
        const userId = String(row[firstKey] || '').trim();
        if (!userId || seen.has(userId)) continue;
        seen.add(userId);
        monitorIds.push({ userId, userName: '' });
      }
    }
  }

  return monitorIds;
}
