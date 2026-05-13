import fs from 'fs';
import path from 'path';

const cacheDir = path.resolve('server/cache');
const liveCachePath = path.join(cacheDir, 'dashboard-live.json');

export function readLiveCache(maxAgeHours = 12) {
  if (!fs.existsSync(liveCachePath)) return null;
  const stat = fs.statSync(liveCachePath);
  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
  if (ageHours > maxAgeHours) return null;
  return JSON.parse(fs.readFileSync(liveCachePath, 'utf8'));
}

export function writeLiveCache(payload) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(liveCachePath, JSON.stringify(payload, null, 2));
}

export function getLiveCachePath() {
  return liveCachePath;
}
