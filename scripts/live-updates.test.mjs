import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createDecipheriv, publicDecrypt, createHash } from 'node:crypto';
import { encryptBundle, signRelease, configuration } from './live-updates.mjs';
import { verifyRelease, UPDATE_BUCKET } from '../src/app/updates/update-policy.ts';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const identity = { channel: 'original', nativeVersion: '1.0.89', androidBuild: 91, iosBuild: 78,
  verifyKey: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
const encrypted = encryptBundle(Buffer.from('PK fixture web bundle'), keys.privateKey);
const now = Date.now();
const release = { schema: 1, channel: 'original', nativeVersion: '1.0.89', builds: { android: 91, ios: 78 },
  sequence: 1, version: '1.0.89-r1', notes: 'Small refinements.', issuedAt: now - 1000, expiresAt: now + 86400000,
  enabled: true, url: UPDATE_BUCKET + 'original/1.0.89/1/bundle.zip', bytes: encrypted.bytes.length,
  checksum: encrypted.checksum, sessionKey: encrypted.sessionKey };
const signed = value => signRelease(value, keys.privateKey);
const check = (value, overrides = {}) => verifyRelease(signed(value), identity, overrides.platform || 'android',
  overrides.version || '1.0.89', overrides.build || '91', overrides.highest || 0, now);
test('accepts a correctly signed Android and iOS release', async () => {
  assert.equal((await check(release)).version, '1.0.89-r1');
  assert.equal((await check(release, { platform: 'ios', build: '78' })).version, '1.0.89-r1');
});
test('native checksum authenticates the plaintext and session key recovers the package', () => {
  const [iv, session] = encrypted.sessionKey.split(':');
  const decoder = createDecipheriv('aes-128-cbc', publicDecrypt(keys.publicKey, Buffer.from(session, 'base64')), Buffer.from(iv, 'base64'));
  const plain = Buffer.concat([decoder.update(encrypted.bytes), decoder.final()]);
  assert.equal(plain.toString(), 'PK fixture web bundle');
  assert.deepEqual(publicDecrypt(keys.publicKey, Buffer.from(encrypted.checksum, 'hex')), createHash('sha256').update(plain).digest());
});
test('rejects payload tampering and signatures from another app key', async () => {
  const envelope = signed(release);
  envelope.payload = envelope.payload.replace('Small refinements.', 'Injected release');
  await assert.rejects(verifyRelease(envelope, identity, 'android', '1.0.89', '91', 0, now), /signature/);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(verifyRelease(signRelease(release, other.privateKey), identity, 'android', '1.0.89', '91', 0, now), /signature/);
});
for (const [name, changes] of Object.entries({
  'wrong channel': { channel: 'no-menu' },
  'wrong native version': { nativeVersion: '1.0.88' },
  'wrong native build': { builds: { android: 90, ios: 78 } },
  'foreign host': { url: 'https://example.com/bundle.zip' },
  'cleartext HTTP': { url: release.url.replace('https:', 'http:') },
  'path traversal': { url: release.url.replace('/1/bundle', '/../1/bundle') },
  'oversize package': { bytes: 65 * 1024 * 1024 },
  'missing checksum': { checksum: '' },
  'unsigned plain checksum': { checksum: 'a'.repeat(64) },
  'missing session key': { sessionKey: '' },
  'expired release': { expiresAt: now - 1 },
  'future issuance': { issuedAt: now + 400000 },
  'version sequence mismatch': { version: '1.0.89-r2' },
  'unbounded notes': { notes: 'x'.repeat(1201) },
  'string flag': { enabled: 'true' },
})) test('rejects ' + name, async () => { await assert.rejects(check({ ...release, ...changes })); });
test('rejects rollback/replay and incompatible installed builds/platforms', async () => {
  await assert.rejects(check(release, { highest: 2 }));
  await assert.rejects(check(release, { version: '1.0.88' }));
  await assert.rejects(check(release, { build: '90' }));
  await assert.rejects(check(release, { platform: 'web' }));
});
test('signed kill switch disables packages without breaking installed app', async () => {
  assert.equal((await check({ ...release, enabled: false, url: '', bytes: 0, checksum: '', sessionKey: '' })).enabled, false);
});
test('rejects malformed or excessively large envelopes', async () => {
  for (const e of [null, {}, { payload: 'x'.repeat(16001), signature: 'a'.repeat(344) }]) {
    await assert.rejects(verifyRelease(e, identity, 'android', '1.0.89', '91', 0, now));
  }
});
test('repo holds public keys only and native version is pinned', () => {
  const c = configuration();
  assert.match(c.publicKey, /BEGIN RSA PUBLIC KEY/);
  assert.doesNotMatch(JSON.stringify(c), /PRIVATE KEY/);
  assert.equal(c.nativeVersion, '1.0.89');
});
