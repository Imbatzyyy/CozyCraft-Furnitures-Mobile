// Local Android emulator diagnostic. Connect only to the forwarded CozyCraft WebView.
import fs from 'node:fs';
const [mode = 'state', argument = ''] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = targets.find(t => t.url === 'https://localhost/home');
if (!target) throw new Error('CozyCraft WebView is not open');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
let intercepted;
socket.onmessage = e => {
  const m = JSON.parse(String(e.data));
  if (m.method === 'Fetch.requestPaused' && intercepted) void send('Fetch.fulfillRequest', {
    requestId: m.params.requestId, responseCode: 200,
    responseHeaders: [{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Cache-Control',value:'no-store'}],
    body: intercepted
  });
  const callback = pending.get(m.id); if (callback) { pending.delete(m.id); callback(m); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const number = ++id, timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 150000);
  pending.set(number, value => { clearTimeout(timer); if (value.error) reject(new Error(JSON.stringify(value.error))); else resolve(value.result); });
  socket.send(JSON.stringify({ id: number, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
try {
  if (mode === 'state') console.log(await evaluate(`(async () => ({
    current: await window.Capacitor.nativePromise('CapacitorUpdater','current',{}),
    dialog: document.querySelector('.cozy-update-dialog')?.innerText || '',
    buttons: [...(document.querySelector('iframe')?.contentDocument?.querySelectorAll('button') || [])].map(b => b.textContent.trim()).filter(Boolean).slice(0,30),
    safety: document.querySelector('iframe')?.contentDocument?.querySelector('[data-cozy-update-safe]')?.getAttribute('data-cozy-update-safe'),
    requests: document.querySelector('iframe')?.contentDocument?.documentElement.dataset.cozyUpdateRequests
  }))()`));
  else if (mode === 'browse') console.log(await evaluate(`(() => { const d=document.querySelector('iframe').contentDocument; const b=[...d.querySelectorAll('button')].find(b => /browse as guest|continue as guest/i.test(b.textContent)); if(!b) return 'No guest button'; b.click(); return 'Guest browsing started'; })()`));
  else if (mode === 'account') console.log(await evaluate(`document.querySelector('iframe').contentDocument.querySelector('[data-nav="account"]').click()`));
  else if (mode === 'check') console.log(await evaluate(`(() => {const d=document.querySelector('iframe').contentDocument; const b=d.querySelector('.account-update-check'); if(!b) return 'Open Account first'; b.click(); return 'Clicked real Account update button';})()`));
  else if (mode === 'preview-staged') {
    const envelope = fs.readFileSync(argument, 'utf8');
    const release = JSON.parse(JSON.parse(envelope).payload);
    intercepted = Buffer.from(envelope).toString('base64');
    await send('Fetch.enable', { patterns: [{urlPattern:'https://gwjsivqksyimuabbdyqq.supabase.co/storage/v1/object/public/mobile-updates/channels/' + release.channel + '/' + release.nativeVersion + '.json*'}] });
    console.log('Test device only: signed staged metadata interception active for 180 seconds.');
    await new Promise(resolve => setTimeout(resolve, 180000));
    await send('Fetch.disable');
  }
  else if (mode === 'install' || mode === 'later' || mode === 'dismiss') console.log(await evaluate(`(() => {const label=${JSON.stringify(mode === 'install' ? 'Update now' : mode === 'later' ? 'Later' : 'Continue shopping')}; const b=[...document.querySelectorAll('.cozy-update-dialog button')].find(b=>b.textContent.trim()===label); if(!b) return 'Button unavailable'; b.click(); return label;})()`));
  else if (mode === 'screenshot') {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(argument, Buffer.from(result.data, 'base64'));
    console.log(argument);
  } else if (mode === 'reset-builtin') {
    try { console.log(await evaluate("window.Capacitor.nativePromise('CapacitorUpdater','reset',{})")); }
    catch (error) { if (!error.message.includes('Execution context was destroyed')) throw error; console.log('Native reload started; verify state after restart.'); }
  } else if (mode === 'apply-staged') {
    const release = JSON.parse(JSON.parse(fs.readFileSync(argument, 'utf8')).payload);
    const options = { url: release.url, version: release.version, checksum: release.checksum, sessionKey: release.sessionKey };
    try { console.log(await evaluate(`(async()=>{const b=await window.Capacitor.nativePromise('CapacitorUpdater','download',${JSON.stringify(options)});await window.Capacitor.nativePromise('CapacitorUpdater','set',{id:b.id});return {activated:b.version,id:b.id};})()`)); }
    catch (error) { if (!error.message.includes('Execution context was destroyed')) throw error; console.log('Native reload started; verify state after restart.'); }
  } else if (mode === 'verify-rejection' || mode === 'verify-other-key') {
    const manifest = JSON.parse(fs.readFileSync(argument, 'utf8'));
    const release = JSON.parse(manifest.payload);
    const bad = { url: release.url, version: 'qa-tamper-rejection', checksum: mode === 'verify-other-key' ? release.checksum : '0'.repeat(512), sessionKey: release.sessionKey };
    console.log(await evaluate(`window.Capacitor.nativePromise('CapacitorUpdater','download',${JSON.stringify(bad)}).then(()=>({unexpected:'accepted'}),e=>({rejected:String(e.message||e)}))`));
  } else throw new Error('Unknown diagnostic mode');
} finally { socket.close(); }
