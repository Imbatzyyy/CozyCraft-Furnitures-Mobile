import test from 'node:test';
import assert from 'node:assert/strict';
import { appPath, compareVersions, selectXcode, toolchainEnvironment } from './xcode-toolchain.mjs';

const old = { app: '/Applications/Xcode.app', version: '26.6' };
const current = { app: '/Example User/Downloads/Xcode.app', version: '27.0' };

test('chooses Xcode 27 even when xcode-select lists 26.6 first', () => {
  assert.equal(selectXcode([old, current]), current);
});
test('honors an explicit old toolchain for backwards compatibility tests', () => {
  assert.equal(selectXcode([old, current], old.app), old);
});
test('accepts DEVELOPER_DIR and app paths with spaces', () => {
  assert.equal(appPath(`${current.app}/Contents/Developer/`), current.app);
  assert.equal(selectXcode([old, current], `${current.app}/Contents/Developer`), current);
});
test('does not silently substitute for a missing explicit installation', () => {
  assert.throws(() => selectXcode([old], '/missing/Xcode.app'), /not a complete installation/);
});
test('rejects unsupported or missing Xcode installations', () => {
  assert.throws(() => selectXcode([]), /Install Xcode/);
  assert.throws(() => selectXcode([{ ...old, version: '25.0' }], old.app), /requires Xcode 26/);
});
test('compares version components numerically', () => {
  assert.ok(compareVersions('27.10', '27.9') > 0);
  assert.equal(compareVersions('27', '27.0'), 0);
});
test('limits the compiler workaround to 26.6 and removes inherited legacy settings on 27', () => {
  const legacy = toolchainEnvironment(old, { PATH: '/test/bin' });
  assert.equal(legacy.CCC_OVERRIDE_OPTIONS, 'x-v');
  assert.match(legacy.XCODE_XCCONFIG_FILE, /xcode-26\.6-workaround/);
  const modern = toolchainEnvironment(current, legacy);
  assert.equal(modern.DEVELOPER_DIR, `${current.app}/Contents/Developer`);
  assert.equal(modern.PATH, '/test/bin');
  for (const key of ['CCC_OVERRIDE_OPTIONS', 'XCODE_XCCONFIG_FILE', 'COZYCRAFT_CLANG_WRAPPER']) assert.equal(modern[key], undefined);
  assert.equal(legacy.CCC_OVERRIDE_OPTIONS, 'x-v', 'does not mutate the calling environment');
});
test('preserves unrelated caller build configuration on new Xcode', () => {
  const env = toolchainEnvironment(current, { XCODE_XCCONFIG_FILE: '/custom/config.xcconfig', CCC_OVERRIDE_OPTIONS: 'custom' });
  assert.equal(env.XCODE_XCCONFIG_FILE, '/custom/config.xcconfig');
  assert.equal(env.CCC_OVERRIDE_OPTIONS, 'custom');
});
