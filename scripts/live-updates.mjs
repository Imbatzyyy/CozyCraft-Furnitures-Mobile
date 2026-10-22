import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, createPublicKey, createCipheriv, randomBytes, privateEncrypt, publicDecrypt, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const origin = 'https://gwjsivqksyimuabbdyqq.supabase.co/storage/v1/object/public/mobile-updates/';
export function configuration(directory = root) {
  const text = fs.readFileSync(path.join(directory, 'src/app/updates/release-config.ts'), 'utf8');
  return JSON.parse(text.slice(text.indexOf('= ') + 2, text.lastIndexOf(' as const')));
}
export function nativeFingerprint(directory = root) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'ios', 'android'], { cwd: directory, encoding: 'utf8' })
    .trim().split('\n').filter(f => f && !f.includes('/public/') && !f.includes('xcuserdata') && !f.includes('/.idea/') && !f.endsWith('.DS_Store'));
  files.push('capacitor.config.ts', 'src/app/updates/release-config.ts');
  const hash = createHash('sha256');
  for (const name of [...new Set(files)].sort()) { hash.update(name); hash.update(fs.readFileSync(path.join(directory, name))); }
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  for (const [name, item] of Object.entries(lock.packages).sort()) {
    if (name.startsWith('node_modules/@capacitor/') || name.startsWith('node_modules/@capgo/')) hash.update(name + ':' + item.version + ':' + item.integrity);
  }
  return hash.digest('hex');
}
export function encryptBundle(zip, privateKey) {
  // Capgo v2 protocol: AES-128-CBC package + RSA-authenticated SHA-256 checksum.
  // This is authenticity, not secrecy: clients have the public verification key.
  const iv = randomBytes(16), session = randomBytes(16);
  const cipher = createCipheriv('aes-128-cbc', session, iv);
  const bytes = Buffer.concat([cipher.update(zip), cipher.final()]);
  const checksum = privateEncrypt(privateKey, createHash('sha256').update(zip).digest()).toString('hex');
  const sessionKey = iv.toString('base64') + ':' + privateEncrypt(privateKey, session).toString('base64');
  if (publicDecrypt(createPublicKey(privateKey), Buffer.from(checksum, 'hex')).length !== 32) throw new Error('Checksum self-test failed');
  return { bytes, checksum, sessionKey };
}
export function signRelease(release, key) {
  const payload = JSON.stringify(release);
  const signature = sign('RSA-SHA256', Buffer.from(payload), key).toString('base64');
  if (!verify('RSA-SHA256', Buffer.from(payload), createPublicKey(key), Buffer.from(signature, 'base64'))) throw new Error('Signature self-test failed');
  return { payload, signature };
}
function run(cmd, args, cwd = root) { execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env }); }
function keyFor(config) {
  const file = process.env.COZY_UPDATE_SIGNING_KEY || path.join(os.homedir(), '.config/cozycraft-updates', config.channel + '.pem');
  if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error('Signing key must have permissions 600');
  const key = fs.readFileSync(file);
  const actual = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
  if (actual !== config.verifyKey) throw new Error('Signing key does not match this app variant');
  return key;
}
function checkedEnvelope(envelope, config) {
  if (!verify('RSA-SHA256', Buffer.from(envelope.payload), { key: Buffer.from(config.verifyKey, 'base64'), type: 'spki', format: 'der' }, Buffer.from(envelope.signature, 'base64'))) throw new Error('Invalid release signature');
  const release = JSON.parse(envelope.payload);
  if (release.channel !== config.channel || release.nativeVersion !== config.nativeVersion) throw new Error('Wrong release channel or native version');
  return release;
}
async function latest(config) {
  const response = await fetch(origin + 'channels/' + config.channel + '/' + config.nativeVersion + '.json?verify=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error('Cannot check current release');
  return checkedEnvelope(await response.json(), config);
}
function upload(file, destination, type, cache) {
  run('npx', ['--yes', 'supabase@2.121.0', 'storage', 'cp', file, 'ss:///mobile-updates/' + destination,
    '--project-ref', 'gwjsivqksyimuabbdyqq', '--experimental', '--content-type', type, '--cache-control', cache]);
}
async function publishPointer(file, destination) {
  // CLI cp intentionally refuses replacement. Only the mutable pointer uses
  // Storage's atomic upsert; credentials stay in memory and are never logged.
  let credentials;
  try {
    credentials = JSON.parse(execFileSync('npx', ['--yes', 'supabase@2.121.0', 'projects', 'api-keys',
      '--project-ref', 'gwjsivqksyimuabbdyqq', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch { throw new Error('Cannot obtain authorized Storage publishing credentials'); }
  const key = credentials.find(item => item.name === 'service_role')?.api_key;
  if (!key) throw new Error('Storage publisher credential unavailable');
  const response = await fetch('https://gwjsivqksyimuabbdyqq.supabase.co/storage/v1/object/mobile-updates/' + destination, {
    method: 'POST', signal: AbortSignal.timeout(20000), redirect: 'error',
    headers: { Authorization: 'Bearer ' + key, apikey: key, 'x-upsert': 'true', 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
    body: fs.readFileSync(file),
  });
  if (!response.ok) throw new Error('Channel pointer publication failed (HTTP ' + response.status + ')');
}
async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const option = name => { const i = argv.indexOf('--' + name); return i < 0 ? '' : argv[i + 1]; };
  const config = configuration();
  if (command === 'fingerprint') { console.log(nativeFingerprint()); return; }
  if (!['prepare', 'stage', 'publish', 'pause'].includes(command)) throw new Error('Use prepare --sequence N --notes "Fix summary", stage --sequence N, publish --sequence N --reviewed, or pause --sequence N');
  const sequence = Number(option('sequence'));
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Positive release sequence required');
  const key = keyFor(config), previous = await latest(config);
  if (previous && sequence <= previous.sequence) throw new Error('Sequence must increase; recover by republishing known-good source under a NEW sequence');
  const output = path.join(root, 'ota-artifacts', config.channel, config.nativeVersion, String(sequence));
  const bundlePath = path.join(output, 'bundle.zip'), manifestPath = path.join(output, 'manifest.json');
  if (command === 'prepare') {
    const baseline = JSON.parse(fs.readFileSync(path.join(root, 'updates/native-baseline.json'), 'utf8'));
    if (baseline.fingerprint !== nativeFingerprint()) throw new Error('Native files/plugins changed. Build a new APK/iOS binary instead of an OTA patch.');
    const notes = option('notes');
    if (!notes || notes.length > 1200) throw new Error('Release notes of 1–1200 characters required');
    if (fs.existsSync(output)) throw new Error('Release already prepared; use a new sequence');
    run('npm', ['run', 'verify:release']);
    run('npm', ['run', 'native:prepare']);
    // Do not let a build hook mutate native requirements after the preflight.
    if (baseline.fingerprint !== nativeFingerprint()) throw new Error('Native fingerprint changed during build');
    const files = fs.readdirSync(path.join(root, 'www'), { recursive: true });
    for (const file of files) {
      const stat = fs.lstatSync(path.join(root, 'www', String(file)));
      if (stat.isSymbolicLink() || /(^|\/)(\.env[^/]*|.*\.(pem|p8|map|keystore))$/.test(String(file))) throw new Error('Unsafe file in update bundle');
    }
    fs.mkdirSync(output, { recursive: true });
    const plain = path.join(output, 'web.zip');
    run('/usr/bin/zip', ['-q', '-r', plain, '.'], path.join(root, 'www'));
    const encrypted = encryptBundle(fs.readFileSync(plain), key);
    if (encrypted.bytes.length > 64 * 1024 * 1024) throw new Error('Update exceeds 64 MB limit');
    fs.writeFileSync(bundlePath, encrypted.bytes);
    const now = Date.now();
    const release = { schema: 1, channel: config.channel, nativeVersion: config.nativeVersion,
      builds: { android: config.androidBuild, ios: config.iosBuild }, sequence, version: config.nativeVersion + '-r' + sequence,
      notes, issuedAt: now, expiresAt: now + 60 * 86400000, enabled: true,
      url: origin + config.channel + '/' + config.nativeVersion + '/' + sequence + '/bundle.zip',
      bytes: encrypted.bytes.length, checksum: encrypted.checksum, sessionKey: encrypted.sessionKey };
    fs.writeFileSync(manifestPath, JSON.stringify(signRelease(release, key)));
    fs.writeFileSync(path.join(output, 'preflight.json'), JSON.stringify({ fingerprint: baseline.fingerprint, encryptedSha256: createHash('sha256').update(encrypted.bytes).digest('hex'), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }, null, 2));
    console.log('Prepared and signed. Review on a test device before publish:', manifestPath);
    return;
  }
  if (command === 'pause') {
    fs.mkdirSync(output, { recursive: true });
    const now = Date.now();
    const release = { schema: 1, channel: config.channel, nativeVersion: config.nativeVersion,
      builds: { android: config.androidBuild, ios: config.iosBuild }, sequence, version: config.nativeVersion + '-r' + sequence,
      notes: 'Updates are temporarily paused. Your installed app continues to work.', issuedAt: now, expiresAt: now + 90 * 86400000,
      enabled: false, url: '', bytes: 0, checksum: '', sessionKey: '' };
    fs.writeFileSync(manifestPath, JSON.stringify(signRelease(release, key)));
  } else {
    if (command === 'publish' && !argv.includes('--reviewed')) throw new Error('Test the prepared bundle and provide --reviewed to publish');
    const envelope = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), release = checkedEnvelope(envelope, config);
    if (release.sequence !== sequence || release.expiresAt < Date.now()) throw new Error('Release mismatch or expiry');
    const preflight = JSON.parse(fs.readFileSync(path.join(output, 'preflight.json'), 'utf8'));
    if (preflight.fingerprint !== nativeFingerprint()) throw new Error('Native configuration changed since preparation');
    if (preflight.encryptedSha256 !== createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex')) throw new Error('Prepared package was modified');
    const exists = await fetch(release.url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    if (!exists.ok) upload(bundlePath, config.channel + '/' + config.nativeVersion + '/' + sequence + '/bundle.zip', 'application/zip', 'max-age=31536000, immutable');
    const uploaded = await fetch(release.url, { signal: AbortSignal.timeout(120000) });
    if (!uploaded.ok || createHash('sha256').update(Buffer.from(await uploaded.arrayBuffer())).digest('hex') !== preflight.encryptedSha256) throw new Error('Uploaded package verification failed; channel pointer unchanged');
  }
  // Preserve immutable signed metadata, then publish the small cacheable pointer LAST.
  const immutable = config.channel + '/' + config.nativeVersion + '/' + sequence + '/manifest.json';
  const priorManifest = await fetch(origin + immutable, { signal: AbortSignal.timeout(15000) });
  if (priorManifest.ok) {
    if (await priorManifest.text() !== fs.readFileSync(manifestPath, 'utf8')) throw new Error('Immutable manifest differs; use a new sequence');
  } else if ([400, 404].includes(priorManifest.status)) upload(manifestPath, immutable, 'application/json', 'max-age=31536000, immutable');
  else throw new Error('Cannot verify staged manifest');
  if (command === 'stage') { console.log('Staged and download-verified. Customer channel is unchanged.'); return; }
  // A long upload must not silently replace a newer publication from another host.
  const beforePublish = await latest(config);
  if ((beforePublish?.sequence || 0) !== (previous?.sequence || 0)) throw new Error('Channel changed during upload; review the newer publication before retrying');
  await publishPointer(manifestPath, 'channels/' + config.channel + '/' + config.nativeVersion + '.json');
  const live = await latest(config);
  if (live?.sequence !== sequence) throw new Error('Channel pointer has not propagated. Do not claim release complete.');
  console.log('Verified live channel:', config.channel, live.version, 'enabled:', live.enabled);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Exclusive per-variant lock prevents concurrent publishers on this release Mac.
  // Other release hosts must still coordinate: Storage has no compare-and-swap pointer API.
  const directory = path.join(os.homedir(), '.config/cozycraft-updates');
  const lockPath = path.join(directory, configuration().channel + '.publish.lock');
  let lock;
  try {
    if (process.argv[2] !== 'fingerprint') {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      lock = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    }
    await main();
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'Another release command owns ' + lockPath + '. Check its PID before removing a stale lock.' : error.message);
    process.exitCode = 1;
  } finally {
    if (lock !== undefined) { fs.closeSync(lock); fs.unlinkSync(lockPath); }
  }
}
