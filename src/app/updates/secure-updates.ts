import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import type { CapacitorUpdaterPlugin } from '@capgo/capacitor-updater';
import { RELEASE_CONFIG } from './release-config';
import { CHECK_INTERVAL, UPDATE_BUCKET, storefrontCanUpdate, verifyRelease, readReleaseResponse } from './update-policy';
import type { UpdateRelease } from './update-policy';

const read = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Optional cache, not a launch dependency. */ } };

export class SecureUpdates {
  open = false;
  phase: 'checking' | 'available' | 'downloading' | 'current' | 'error' = 'checking';
  message = '';
  progress = 0;
  installed = RELEASE_CONFIG.nativeVersion as string;
  release: UpdateRelease | null = null;
  active = true;
  private busy = false;
  private checked = false;
  private timer?: ReturnType<typeof setInterval>;
  private readySince = 0;
  private acknowledged = false;
  private priorFocus: HTMLElement | null = null;
  private readonly prefix = 'cozy-update:' + RELEASE_CONFIG.channel + ':' + RELEASE_CONFIG.nativeVersion + ':';
  private readonly platform = Capacitor.getPlatform();
  constructor(private document: () => Document | null, private nativeSafe: () => boolean,
    private changed: () => void, private updater: CapacitorUpdaterPlugin = CapacitorUpdater,
    private appInfo: () => ReturnType<typeof App.getInfo> = () => App.getInfo()) {}

  start() {
    if (!Capacitor.isNativePlatform() || this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, 1000);
    void this.updater.current().then(v => { this.installed = v.bundle.id === 'builtin' ? v.native : v.bundle.version; }).catch(() => undefined);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  foreground(active: boolean) { this.active = active; if (active) this.checked = false; }
  private safe(requireIdle = true) { return storefrontCanUpdate(this.document(), this.nativeSafe(), this.active, requireIdle); }
  private async tick() {
    if (!this.active) return;
    const doc = this.document();
    // Readiness is local rendering, never a database/payment/network success.
    const rendered = doc?.querySelector('.auth-phone:not(.splash), .lux-shell');
    if (!this.acknowledged && rendered && !doc?.querySelector('.mobile-recovery-screen')) {
      this.readySince ||= Date.now();
      if (Date.now() - this.readySince > 2500) {
        this.acknowledged = true;
        try { await this.updater.notifyAppReady(); }
        catch { this.acknowledged = false; }
      }
    } else if (!rendered) this.readySince = 0;
    if (!this.checked && this.safe() && !this.open && !this.busy) {
      this.checked = true;
      await this.check(false);
    }
  }
  private show() {
    this.priorFocus = window.document.activeElement as HTMLElement | null;
    this.open = true; this.changed();
    setTimeout(() => window.document.querySelector<HTMLButtonElement>('.cozy-update-dialog button')?.focus(), 0);
  }
  dismiss() {
    if (this.phase === 'downloading') return;
    if (this.release) save(this.prefix + 'later', JSON.stringify({ version: this.release.version, until: Date.now() + 86400000 }));
    this.open = false; this.changed(); this.priorFocus?.focus();
  }
  async check(manual = true) {
    if (this.busy || !Capacitor.isNativePlatform()) return;
    if (!manual && Date.now() - Number(read(this.prefix + 'checked')) < CHECK_INTERVAL) return;
    this.busy = true;
    this.phase = 'checking'; this.release = null;
    this.message = 'Checking for a verified CozyCraft update…';
    if (manual) this.show();
    try {
      const info = await this.appInfo();
      const response = await fetch(UPDATE_BUCKET + 'channels/' + RELEASE_CONFIG.channel + '/' + RELEASE_CONFIG.nativeVersion + '.json' + (manual ? '?verify=' + Date.now() : ''),
        { signal: AbortSignal.timeout(12000), credentials: 'omit', redirect: 'error', cache: manual ? 'reload' : 'default' });
      const highest = Number(read(this.prefix + 'highest')) || 0;
      const release = await verifyRelease(await readReleaseResponse(response), RELEASE_CONFIG, this.platform, info.version, info.build, highest);
      save(this.prefix + 'highest', String(Math.max(highest, release.sequence)));
      save(this.prefix + 'checked', String(Date.now()));
      const current = await this.updater.current();
      const failed = (await this.updater.list()).bundles.some(b => b.version === release.version && b.status === 'error');
      const declined = read(this.prefix + 'failed') === release.version;
      this.installed = current.bundle.id === 'builtin' ? info.version : current.bundle.version;
      if (!release.enabled || release.version === this.installed || failed || declined) {
        this.phase = 'current';
        this.message = release.version !== this.installed && (failed || declined) ? 'Your working version is safe. This patch needs another review before it can be offered again.' : 'You’re on the latest available update for this build.';
      } else {
        this.release = release; this.phase = 'available'; this.message = release.notes;
        let later = { version: '', until: 0 };
        try { later = JSON.parse(read(this.prefix + 'later') || '{}'); } catch { /* Ignore a damaged preference. */ }
        if (!manual && this.safe() && !(later.version === release.version && later.until > Date.now())) this.show();
      }
    } catch {
      this.phase = 'error';
      this.message = 'We couldn’t verify an update right now. Your current app is unchanged. Check your connection and try again later.';
      // Back off failures too. Manual checks remain available.
      save(this.prefix + 'checked', String(Date.now() - CHECK_INTERVAL + 15 * 60000));
    } finally { this.busy = false; this.changed(); }
  }
  async install() {
    if (this.busy || !this.release || this.phase !== 'available') return;
    if (!this.safe(false)) {
      this.message = 'Finish your current task, then check App updates from your Account. Nothing has been restarted.';
      this.phase = 'error'; this.changed(); return;
    }
    this.busy = true; this.phase = 'downloading'; this.progress = 0; this.changed();
    const release = this.release;
    let bundleId = '';
    const listener = await this.updater.addListener('download', event => {
      this.progress = Math.max(this.progress, Math.min(100, event.percent)); this.changed();
    }).catch(() => null);
    try {
      // Re-fetch the signed pointer so a withdrawn/replaced release cannot activate.
      const info = await this.appInfo();
      const revalidate = async () => {
        const response = await fetch(UPDATE_BUCKET + 'channels/' + RELEASE_CONFIG.channel + '/' + RELEASE_CONFIG.nativeVersion + '.json?verify=' + Date.now(),
          { signal: AbortSignal.timeout(12000), credentials: 'omit', redirect: 'error', cache: 'no-store' });
        const latest = await verifyRelease(await readReleaseResponse(response), RELEASE_CONFIG, this.platform, info.version, info.build, release.sequence);
        if (!latest.enabled || latest.checksum !== release.checksum || latest.sequence !== release.sequence) throw new Error('Update changed');
      };
      await revalidate();
      const bundle = await this.updater.download({ url: release.url, version: release.version, checksum: release.checksum, sessionKey: release.sessionKey });
      bundleId = bundle.id;
      await revalidate();
      // Native verification is mandatory. Never activate while backgrounded, in payment, or after expiry.
      if (!this.safe(false) || Date.now() >= release.expiresAt) throw new Error('Task or app state changed');
      // A failed startup remains suppressed even if native cleanup deletes its error record.
      save(this.prefix + 'failed', release.version);
      await this.updater.set({ id: bundle.id });
    } catch {
      if (bundleId) await this.updater.delete({ id: bundleId }).catch(() => undefined);
      this.phase = 'error';
      this.message = 'The update was not applied. Your current version is still available. Please return to Account and try again when ready.';
    } finally {
      await listener?.remove(); this.busy = false; this.changed();
    }
  }
  keydown(event: KeyboardEvent) {
    if (!this.open) return;
    if (event.key === 'Escape') { event.preventDefault(); this.dismiss(); }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(window.document.querySelectorAll<HTMLButtonElement>('.cozy-update-dialog button:not(:disabled)'));
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
