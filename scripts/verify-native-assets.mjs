import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'www');
const destinations = [
  'android/app/src/main/assets/public',
  'ios/App/App/public',
  'ios/App/build/compatibility/Build/Products/Debug-iphonesimulator/App.app/public',
];
const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
const files = fs.readdirSync(web, { recursive: true }).filter(file => fs.statSync(path.join(web, file)).isFile());
const hash = value => createHash('sha256').update(value).digest('hex');
assert(files.length > 0, 'Build the web application first.');
for (const file of files) {
  const expected = hash(fs.readFileSync(path.join(web, file)));
  for (const destination of destinations) assert.equal(hash(fs.readFileSync(path.join(root, destination, file))), expected, `${destination}/${file}`);
  assert.equal(hash(execFileSync('unzip', ['-p', apk, `assets/public/${file}`], { maxBuffer: 32 * 1024 * 1024 })), expected, `APK: ${file}`);
}
console.log(`PASS: ${files.length} web files match Android assets, iOS assets, the built iOS Simulator app and the Android APK.`);
console.log(`APK SHA-256: ${hash(fs.readFileSync(apk))}`);
