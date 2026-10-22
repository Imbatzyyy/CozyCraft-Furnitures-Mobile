export const UPDATE_ORIGIN = 'https://gwjsivqksyimuabbdyqq.supabase.co';
export const UPDATE_BUCKET = UPDATE_ORIGIN + '/storage/v1/object/public/mobile-updates/';
export const CHECK_INTERVAL = 4 * 60 * 60 * 1000;
export const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
export interface UpdateRelease {
  schema: 1;
  channel: string;
  nativeVersion: string;
  builds: { android: number; ios: number };
  sequence: number;
  version: string;
  notes: string;
  issuedAt: number;
  expiresAt: number;
  enabled: boolean;
  url: string;
  bytes: number;
  checksum: string;
  sessionKey: string;
}
export interface UpdateIdentity {
  channel: string; nativeVersion: string; androidBuild: number; iosBuild: number; verifyKey: string;
}
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

export async function readReleaseResponse(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Update service unavailable');
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 16000) throw new Error('Oversized update manifest');
      parts.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Verify exact signed bytes BEFORE trusting metadata, paths, versions, or user-visible text. */
export async function verifyRelease(envelope: unknown, identity: UpdateIdentity, platform: string,
  nativeVersion: string, nativeBuild: string, highestSequence: number, now = Date.now()): Promise<UpdateRelease> {
  if (!envelope || typeof envelope !== 'object') throw new Error('Invalid update envelope');
  const e = envelope as Record<string, unknown>;
  if (typeof e['payload'] !== 'string' || e['payload'].length > 12000 ||
      typeof e['signature'] !== 'string' || e['signature'].length !== 344) throw new Error('Invalid signed update');
  const key = await crypto.subtle.importKey('spki', decode(identity.verifyKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(e['signature']),
    new TextEncoder().encode(e['payload']))) throw new Error('Update signature rejected');
  const r = JSON.parse(e['payload']) as UpdateRelease;
  if (r.schema !== 1 || r.channel !== identity.channel || r.nativeVersion !== identity.nativeVersion ||
      r.nativeVersion !== nativeVersion || !['android', 'ios'].includes(platform) ||
      !r.builds || r.builds.android !== identity.androidBuild || r.builds.ios !== identity.iosBuild ||
      String(platform === 'ios' ? r.builds.ios : r.builds.android) !== nativeBuild) throw new Error('Incompatible update');
  if (!Number.isSafeInteger(r.sequence) || r.sequence < 1 || r.sequence < highestSequence ||
      !Number.isSafeInteger(r.issuedAt) || !Number.isSafeInteger(r.expiresAt) ||
      r.issuedAt > now + 300000 || r.expiresAt <= now || r.expiresAt <= r.issuedAt ||
      r.expiresAt - r.issuedAt > 90 * 86400000) throw new Error('Expired or replayed update');
  if (typeof r.enabled !== 'boolean' || typeof r.notes !== 'string' || r.notes.length > 1200 ||
      !/^\d+\.\d+\.\d+-r\d+$/.test(r.version) || r.version !== r.nativeVersion + '-r' + r.sequence) throw new Error('Invalid update metadata');
  if (!r.enabled) return r;
  const expected = UPDATE_BUCKET + identity.channel + '/' + identity.nativeVersion + '/' + r.sequence + '/bundle.zip';
  if (r.url !== expected || !Number.isSafeInteger(r.bytes) || r.bytes < 1 || r.bytes > MAX_BUNDLE_BYTES ||
      !/^[a-f0-9]{512}$/.test(r.checksum) || typeof r.sessionKey !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]{342}==$/.test(r.sessionKey)) throw new Error('Invalid update package');
  return r;
}

/** A conservative gate: only an idle, committed shopping screen may be replaced. */
export function storefrontCanUpdate(doc: Document | null, nativeSafe: boolean, active: boolean, requireIdle = true): boolean {
  if (!doc || !nativeSafe || !active || doc.hidden) return false;
  if (!doc.querySelector('[data-cozy-update-safe="true"]') ||
      doc.querySelector('[data-cozy-update-busy="true"], [role="dialog"], [aria-modal="true"], .mobile-recovery-screen') ||
      doc.documentElement.dataset['cozyUpdateRequests'] !== '0') return false;
  if (doc.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return false;
  const last = Number(doc.documentElement.dataset['cozyUpdateInteraction']);
  return !requireIdle || (Number.isFinite(last) && Date.now() - last > 2000);
}
