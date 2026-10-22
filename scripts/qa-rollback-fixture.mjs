// Deliberately broken boot fixture. NEVER writes a customer channel pointer.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { configuration, encryptBundle, origin, root } from './live-updates.mjs';
const config = configuration();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-rollback-qa-'));
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><title>QA rollback fixture</title></head><body>QA boot failure: this fixture deliberately never acknowledges app readiness.</body></html>');
const zip = path.join(dir, 'fixture.zip');
execFileSync('/usr/bin/zip', ['-q', zip, 'index.html'], { cwd: dir });
const key = fs.readFileSync(path.join(os.homedir(), '.config/cozycraft-updates', config.channel + '.pem'));
const encrypted = encryptBundle(fs.readFileSync(zip), key);
const output = path.join(root, 'ota-artifacts', 'qa-rollback');
fs.mkdirSync(output, { recursive: true });
const file = path.join(output, 'bundle.zip');
fs.writeFileSync(file, encrypted.bytes);
const remote = 'qa-only/' + config.channel + '/rollback-' + Date.now() + '.zip';
execFileSync('npx', ['--yes','supabase@2.121.0','storage','cp',file,'ss:///mobile-updates/' + remote,
  '--project-ref','gwjsivqksyimuabbdyqq','--experimental','--content-type','application/zip'], { stdio: 'inherit' });
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ payload: JSON.stringify({
  version: 'qa-rollback-' + Date.now(), url: origin + remote, checksum: encrypted.checksum, sessionKey: encrypted.sessionKey
}) }));
console.log('QA fixture only. Not eligible for the signed production release policy.');
