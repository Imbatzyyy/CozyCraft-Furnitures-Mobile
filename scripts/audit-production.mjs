// Cache only successful, zero-advisory responses for the exact lockfile, for 24h.
// An unavailable advisory service is never treated as a clean audit.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, '.native-build'), { recursive: true });
for (const directory of [root, path.join(root, 'storefront')]) {
  const name = directory === root ? 'shell' : 'storefront';
  const lock = createHash('sha256').update(fs.readFileSync(path.join(directory, 'package-lock.json'))).digest('hex');
  const receipt = path.join(root, '.native-build', 'audit-' + name + '.json');
  let cache;
  try { cache = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch { /* Audit live. */ }
  if (cache?.lock === lock && cache.total === 0 && cache.at <= Date.now() && Date.now() - cache.at < 86400000) {
    console.log(name + ': zero advisories, verified receipt ' + new Date(cache.at).toISOString()); continue;
  }
  let passed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = spawnSync('npm', ['audit', '--omit=dev', '--json', '--fetch-retries=0', '--fetch-timeout=20000'],
      { cwd: directory, encoding: 'utf8', timeout: 25000, maxBuffer: 8 * 1024 * 1024 });
    let report;
    try { report = JSON.parse(result.stdout); } catch { /* Failed transport. */ }
    if (report?.metadata?.vulnerabilities) {
      const total = report.metadata.vulnerabilities.total;
      if (total !== 0) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
      if (result.status === 0) {
        fs.writeFileSync(receipt, JSON.stringify({ lock, total, at: Date.now() }));
        console.log(name + ': fresh production audit, zero advisories'); passed = true; break;
      }
    }
    console.warn(name + ': advisory service unavailable; attempt ' + (attempt + 1) + '/3');
  }
  if (!passed) { console.error(name + ': audit incomplete; release gate remains closed'); process.exit(1); }
}
