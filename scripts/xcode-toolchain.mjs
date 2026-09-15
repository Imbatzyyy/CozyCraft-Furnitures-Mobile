import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyConfig = path.join(projectRoot, 'ios/App/xcode-26.6-workaround.xcconfig');
const legacyCompiler = path.join(projectRoot, 'ios/App/clang-wrapper.sh');

export function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function appPath(value) {
  return path.resolve(value.replace(/\/Contents\/Developer\/?$/, ''));
}

export function selectXcode(candidates, override) {
  if (override) {
    const selected = candidates.find(candidate => candidate.app === appPath(override));
    if (!selected) throw new Error(`The requested Xcode is not a complete installation: ${override}`);
    if (compareVersions(selected.version, '26.0') < 0) throw new Error('Capacitor 8 requires Xcode 26 or newer.');
    return selected;
  }
  const selected = [...candidates].filter(candidate => compareVersions(candidate.version, '26.0') >= 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  if (!selected) throw new Error('Install Xcode 26 or newer, or set COZYCRAFT_XCODE_APP to your Xcode.app.');
  return selected;
}

export function toolchainEnvironment(selected, source = process.env) {
  const environment = { ...source, DEVELOPER_DIR: path.join(selected.app, 'Contents/Developer') };
  // Never carry the 26.6-only compiler probe workaround into Xcode 27+.
  if (environment.CCC_OVERRIDE_OPTIONS === 'x-v') delete environment.CCC_OVERRIDE_OPTIONS;
  if (environment.XCODE_XCCONFIG_FILE === legacyConfig) delete environment.XCODE_XCCONFIG_FILE;
  if (environment.COZYCRAFT_CLANG_WRAPPER === legacyCompiler) delete environment.COZYCRAFT_CLANG_WRAPPER;
  if (/^26\.6(?:\.|$)/.test(selected.version)) {
    environment.CCC_OVERRIDE_OPTIONS = 'x-v';
    environment.COZYCRAFT_CLANG_WRAPPER = legacyCompiler;
    environment.XCODE_XCCONFIG_FILE = legacyConfig;
  }
  return environment;
}

function readInstallation(candidate) {
  const app = appPath(candidate), developer = path.join(app, 'Contents/Developer');
  if (!fs.existsSync(path.join(developer, 'usr/bin/xcodebuild'))) return null;
  try {
    const plist = path.join(app, 'Contents/Info.plist');
    const read = key => execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim();
    if (read('CFBundleIdentifier') !== 'com.apple.dt.Xcode') return null;
    const version = read('CFBundleShortVersionString');
    return /^\d+(?:\.\d+)*$/.test(version) ? { app, version } : null;
  } catch { return null; }
}

export function discoverXcode() {
  const override = process.env.COZYCRAFT_XCODE_APP || process.env.DEVELOPER_DIR;
  // Explicit overrides fail clearly instead of silently selecting another IDE.
  if (override) return selectXcode([readInstallation(override)].filter(Boolean), override);
  const candidates = [];
  try { candidates.push(execFileSync('/usr/bin/xcode-select', ['-p'], { encoding: 'utf8' }).trim()); } catch { /* Check installed apps below. */ }
  for (const directory of ['/Applications', path.join(os.homedir(), 'Applications'), path.join(os.homedir(), 'Downloads')]) {
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory)) if (/^Xcode.*\.app$/i.test(name)) candidates.push(path.join(directory, name));
  }
  return selectXcode([...new Set(candidates.map(appPath))].map(readInstallation).filter(Boolean));
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.signal || result.status}).`);
}

function main() {
  const [action = 'info', ...args] = process.argv.slice(2);
  if (!['info', 'build', 'open'].includes(action)) throw new Error('Usage: node scripts/xcode-toolchain.mjs [info|build <xcodebuild arguments>|open]');
  const selected = discoverXcode(), env = toolchainEnvironment(selected);
  if (action === 'info') {
    console.log(JSON.stringify({ ...selected, developerDir: env.DEVELOPER_DIR, legacyWorkaround: /^26\.6(?:\.|$)/.test(selected.version) }, null, 2));
    return;
  }
  console.log(`Using Xcode ${selected.version}: ${selected.app}`);
  const xcodebuild = path.join(env.DEVELOPER_DIR, 'usr/bin/xcodebuild');
  if (action === 'build') { run(xcodebuild, args, env); return; }
  const required = ['ios', 'app', 'browser', 'local-notifications', 'push-notifications'];
  if (required.some(name => !fs.existsSync(path.join(projectRoot, 'node_modules/@capacitor', name, 'package.json')))) {
    console.log('Restoring locked mobile dependencies for Xcode...');
    run('npm', ['ci', '--no-audit', '--no-fund'], env);
  }
  const project = path.join(projectRoot, 'ios/App/App.xcodeproj');
  run(xcodebuild, ['-quiet', '-project', project, '-scheme', 'App', '-resolvePackageDependencies'], env);
  const openArgs = ['--env', `DEVELOPER_DIR=${env.DEVELOPER_DIR}`];
  for (const key of ['CCC_OVERRIDE_OPTIONS', 'COZYCRAFT_CLANG_WRAPPER', 'XCODE_XCCONFIG_FILE']) {
    if (env[key]) openArgs.push('--env', `${key}=${env[key]}`);
    else openArgs.push('--env', `${key}=`);
  }
  // Open this exact bundle, not whichever app Launch Services calls "Xcode".
  run('/usr/bin/open', [...openArgs, '-na', selected.app, project], env);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
