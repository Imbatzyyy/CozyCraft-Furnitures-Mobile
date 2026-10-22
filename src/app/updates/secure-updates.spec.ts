import { Capacitor } from '@capacitor/core';
import type { CapacitorUpdaterPlugin } from '@capgo/capacitor-updater';
import { RELEASE_CONFIG } from './release-config';
import { SecureUpdates } from './secure-updates';
import { CHECK_INTERVAL, UPDATE_BUCKET, type UpdateRelease } from './update-policy';

describe('Secure update interaction and failure recovery', () => {
  let doc: Document;
  let controller: SecureUpdates;
  let native: jasmine.SpyObj<CapacitorUpdaterPlugin>;
  let release: UpdateRelease;
  let requests: jasmine.Spy;
  const prefix = 'cozy-update:' + RELEASE_CONFIG.channel + ':1.0.89:';
  const response = () => new Response(JSON.stringify({ payload: JSON.stringify(release), signature: 'A'.repeat(342) + '==' }));
  beforeEach(() => {
    for (const key of ['checked', 'highest', 'later', 'failed']) localStorage.removeItem(prefix + key);
    doc = document.implementation.createHTMLDocument('Storefront');
    Object.defineProperty(doc, 'hidden', { value: false });
    doc.body.innerHTML = '<main class="lux-shell" data-cozy-update-safe="true"><button>Account</button></main>';
    doc.documentElement.dataset['cozyUpdateRequests'] = '0';
    doc.documentElement.dataset['cozyUpdateInteraction'] = String(Date.now() - 5000);
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    spyOn(Capacitor, 'getPlatform').and.returnValue('android');
    // Crypto authenticity is tested with real RSA keys in live-updates.test.mjs.
    spyOn(crypto.subtle, 'importKey').and.resolveTo({} as CryptoKey);
    spyOn(crypto.subtle, 'verify').and.resolveTo(true);
    native = jasmine.createSpyObj('Updater', ['current', 'list', 'addListener', 'download', 'set', 'delete', 'notifyAppReady']);
    native.current.and.resolveTo({ bundle: { id: 'builtin', version: '1.0.89', downloaded: '', checksum: '', status: 'success' }, native: '1.0.89' });
    native.list.and.resolveTo({ bundles: [] });
    native.addListener.and.resolveTo({ remove: async () => undefined });
    native.download.and.resolveTo({ id: 'qa-patch', version: '1.0.89-r8', downloaded: '', checksum: '', status: 'pending' });
    native.set.and.resolveTo();
    native.delete.and.resolveTo();
    native.notifyAppReady.and.resolveTo({ bundle: { id: 'builtin', version: '1.0.89', downloaded: '', checksum: '', status: 'success' } });
    release = { schema: 1, channel: RELEASE_CONFIG.channel, nativeVersion: '1.0.89', builds: { android: RELEASE_CONFIG.androidBuild, ios: RELEASE_CONFIG.iosBuild },
      sequence: 8, version: '1.0.89-r8', notes: 'Verified refinements.', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 86400000,
      enabled: true, bytes: 1000, checksum: 'a'.repeat(512), sessionKey: 'A'.repeat(22) + '==:' + 'A'.repeat(342) + '==',
      url: UPDATE_BUCKET + RELEASE_CONFIG.channel + '/1.0.89/8/bundle.zip' };
    requests = spyOn(window, 'fetch').and.callFake(async () => response());
    controller = new SecureUpdates(() => doc, () => true, () => undefined, native,
      async () => ({ id: 'com.cozycraft.furniture', name: 'Cozy Craft Furnitures', version: '1.0.89', build: String(RELEASE_CONFIG.androidBuild) }));
  });
  afterEach(() => controller.stop());

  it('offers a patch, remembers Later for 24 hours, and allows a manual override', async () => {
    await controller.check(); expect(controller.phase).toBe('available'); expect(controller.open).toBeTrue();
    controller.dismiss(); expect(controller.open).toBeFalse();
    expect(JSON.parse(localStorage.getItem(prefix + 'later')!).until).toBeGreaterThan(Date.now() + 86300000);
    localStorage.setItem(prefix + 'checked', String(Date.now() - CHECK_INTERVAL - 1));
    await controller.check(false); expect(controller.open).toBeFalse();
    await controller.check(); expect(controller.open).toBeTrue();
  });
  it('does not download or restart during checkout or background activity', async () => {
    await controller.check();
    doc.querySelector('main')!.setAttribute('data-cozy-update-safe', 'false');
    await controller.install();
    expect(controller.phase).toBe('error'); expect(native.download).not.toHaveBeenCalled(); expect(native.set).not.toHaveBeenCalled();
  });
  it('coalesces rapid Update taps and revalidates both before and after downloading', async () => {
    await controller.check();
    let resolve!: () => void;
    native.download.and.callFake(() => new Promise(done => { resolve = () => done({ id: 'qa-patch', version: release.version, downloaded: '', checksum: '', status: 'pending' }); }));
    const first = controller.install();
    for (let i = 0; i < 20 && !resolve; i++) await new Promise(done => setTimeout(done, 0));
    await controller.install(); controller.dismiss();
    expect(controller.open).toBeTrue(); expect(native.download.calls.count()).toBe(1);
    resolve(); await first;
    expect(requests.calls.count()).toBe(3); expect(native.set.calls.count()).toBe(1);
  });
  it('keeps the installed app intact when download fails', async () => {
    await controller.check(); native.download.and.rejectWith(new Error('Offline'));
    await controller.install();
    expect(controller.phase).toBe('error'); expect(native.set).not.toHaveBeenCalled();
  });
  it('rejects a withdrawn release after download and deletes only the inactive package', async () => {
    await controller.check();
    native.download.and.callFake(async () => { release = { ...release, enabled: false }; return { id: 'qa-patch', version: release.version, downloaded: '', checksum: '', status: 'pending' }; });
    await controller.install();
    expect(controller.phase).toBe('error'); expect(native.set).not.toHaveBeenCalled();
    expect(native.delete).toHaveBeenCalledWith({ id: 'qa-patch' });
  });
  it('does not activate if the app backgrounds while downloading', async () => {
    await controller.check();
    native.download.and.callFake(async () => { controller.foreground(false); return { id: 'qa-patch', version: release.version, downloaded: '', checksum: '', status: 'pending' }; });
    await controller.install();
    expect(native.set).not.toHaveBeenCalled(); expect(native.delete).toHaveBeenCalled();
  });
  it('fails closed on an invalid signature and respects automatic check backoff', async () => {
    (crypto.subtle.verify as jasmine.Spy).and.resolveTo(false);
    await controller.check(); expect(controller.phase).toBe('error'); expect(controller.release).toBeNull();
    await controller.check(false); expect(requests.calls.count()).toBe(1); expect(native.download).not.toHaveBeenCalled();
  });
  it('never automatically offers a patch that previously failed startup', async () => {
    localStorage.setItem(prefix + 'failed', release.version);
    await controller.check(false);
    expect(controller.phase).toBe('current'); expect(controller.open).toBeFalse(); expect(controller.release).toBeNull();
  });
});
