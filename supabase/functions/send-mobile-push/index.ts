import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { shoppingKinds, shoppingPushOptions } from "../_shared/shopping-push.ts";

type PushRecord = {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  expires_at?: string;
  lease_id?: string;
};

type Device = { id: string; token: string; platform: string; shopping_supported?: boolean };
type PushResult = { sent: boolean; invalid: boolean; reason: string | null };

const encoder = new TextEncoder();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const base64Url = (value: Uint8Array | string) => {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemBytes = (pem: string) => {
  const value = atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
};

let googleAccess: { token: string; projectId: string; expiresAt: number } | null = null;
const googleAccessToken = async () => {
  if (googleAccess && googleAccess.expiresAt > Date.now() + 60_000) return googleAccess;
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("firebase_not_configured");
  const account = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
    project_id: string;
    token_uri?: string;
  };
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error("firebase_authorization_failed");
  googleAccess = {
    token: String(result.access_token),
    projectId: account.project_id,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  return googleAccess;
};

let appleAccess: { token: string; expiresAt: number } | null = null;
const appleAccessToken = async () => {
  if (appleAccess && appleAccess.expiresAt > Date.now() + 60_000) return appleAccess.token;
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  if (!keyId || !teamId || !privateKey) throw new Error("apns_not_configured");
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "ES256", kid: keyId }))}.${base64Url(JSON.stringify({
    iss: teamId,
    iat: issuedAt,
  }))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(unsigned),
  );
  appleAccess = {
    token: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
    expiresAt: Date.now() + 50 * 60_000,
  };
  return appleAccess.token;
};

const dataPayload = (notification: PushRecord) => ({
  notificationId: String(notification.id || ""),
  kind: String(notification.kind || "notification"),
  entityType: String(notification.entity_type || ""),
  entityId: String(notification.entity_id || ""),
  route: shoppingPushOptions(notification.kind).route,
});

const notificationTag = (notification: PushRecord) =>
  `cozycraft-${notification.kind}-${notification.entity_id || notification.id}`.slice(0, 64);

const sendAndroid = async (device: Device, notification: PushRecord): Promise<PushResult> => {
  const options = shoppingPushOptions(notification.kind, notification.expires_at);
  const access = await googleAccessToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(access.projectId)}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token: device.token,
        notification: { title: notification.title, body: notification.message },
        data: dataPayload(notification),
        android: {
          priority: "high",
          ...(options.marketing ? { ttl: `${options.ttl}s` } : {}),
          notification: {
            channel_id: options.marketing && !device.shopping_supported ? 'cozycraft_important_v2' : options.channel,
            icon: "ic_stat_cozycraft",
            color: "#A65F43",
            sound: "default",
            tag: notificationTag(notification),
            visibility: "PRIVATE",
          },
        },
      } }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.text();
  return {
    sent: response.ok,
    invalid: response.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(body),
    reason: response.ok ? null : `fcm_${response.status}`,
  };
};

const postToApns = async (
  host: string,
  device: Device,
  notification: PushRecord,
  token: string,
  topic: string,
) => {
  const isOrder = String(notification.kind).includes("order");
  const options = shoppingPushOptions(notification.kind, notification.expires_at);
  const response = await fetch(`https://${host}/3/device/${encodeURIComponent(device.token)}`, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": notificationTag(notification),
      ...(options.marketing ? { "apns-expiration": String(Math.floor(Date.now() / 1000) + options.ttl) } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: notification.title, body: notification.message },
        badge: 1,
        sound: "default",
        "thread-id": `cozycraft-customer-${isOrder ? "orders" : notification.kind || "updates"}`,
        "interruption-level": isOrder ? "time-sensitive" : "active",
        "relevance-score": isOrder ? 1 : 0.7,
      },
      ...dataPayload(notification),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await response.text() };
};

const sendIos = async (device: Device, notification: PushRecord): Promise<PushResult> => {
  const topic = Deno.env.get("APNS_BUNDLE_ID");
  if (!topic || !Deno.env.get("APNS_PRIVATE_KEY")) {
    return { sent: false, invalid: false, reason: "apns_not_configured" };
  }
  const token = await appleAccessToken();
  const productionFirst = (Deno.env.get("APNS_PRODUCTION") || "true").toLowerCase() !== "false";
  const hosts = productionFirst
    ? ["api.push.apple.com", "api.sandbox.push.apple.com"]
    : ["api.sandbox.push.apple.com", "api.push.apple.com"];
  const first = await postToApns(hosts[0], device, notification, token, topic);
  if (first.response.ok) return { sent: true, invalid: false, reason: null };

  // Xcode debug builds use sandbox device tokens while TestFlight/App Store
  // builds use production tokens. Retry only an environment mismatch.
  if (/BadDeviceToken|DeviceTokenNotForTopic/i.test(first.body)) {
    const second = await postToApns(hosts[1], device, notification, token, topic);
    if (second.response.ok) return { sent: true, invalid: false, reason: null };
    return {
      sent: false,
      invalid: second.response.status === 410 || /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/i.test(second.body),
      reason: `apns_${second.response.status}`,
    };
  }
  return {
    sent: false,
    invalid: first.response.status === 410 || /Unregistered/i.test(first.body),
    reason: `apns_${first.response.status}`,
  };
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!webhookSecret || request.headers.get("Authorization") !== `Bearer ${webhookSecret}`) {
    return json({ error: "Unauthorized." }, 401);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Push service is not configured." }, 503);

  const payload = await request.json().catch(() => ({}));
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const dispatch = async (notificationId: number) => {
  // Always read the canonical row. Payloads cannot substitute a recipient or
  // a fabricated offer, and a deleted/stale notification has no side effects.
  const { data: stored, error: readError } = await admin.from('customer_notifications')
    .select('*').eq('id', notificationId).maybeSingle();
  if (readError) throw new Error('notification_read_failed');
  if (!stored) return { notificationId, skipped: true };
  let notification = stored as PushRecord;
  if (shoppingKinds.has(notification.kind)) {
    const { data, error } = await admin.rpc('prepare_mobile_shopping_push', { p_notification_id: notificationId });
    // Fail closed when the migration is missing. Never bypass consent/rate limits.
    if (error) throw new Error('shopping_queue_unavailable');
    if (!data) return { notificationId, skipped: true };
    notification = data as PushRecord;
  }
  let deviceQuery = admin
    .from("mobile_push_tokens")
    .select("id,token,platform,shopping_supported")
    .eq("user_id", notification.user_id)
    .eq("active", true);
  if (shoppingKinds.has(notification.kind) && notification.kind !== 'promotion') {
    deviceQuery = deviceQuery.eq('shopping_supported', true).in('platform', ['ios','android']);
  }
  const { data: devices, error: deviceError } = await deviceQuery;
  if (deviceError) throw new Error('device_read_failed');

  let sent = 0;
  let failed = 0;
  const invalidIds: string[] = [];
  const failureKinds = new Set<string>();
  await Promise.all(((devices || []) as Device[]).map(async (device) => {
    try {
      const result = device.platform.toLowerCase().startsWith("ios")
        ? await sendIos(device, notification)
        : await sendAndroid(device, notification);
      if (result.sent) sent += 1;
      else failed += 1;
      if (result.invalid) invalidIds.push(device.id);
      if (result.reason) failureKinds.add(result.reason);
    } catch (error) {
      failed += 1;
      failureKinds.add(error instanceof Error ? error.message : "push_failed");
    }
  }));

  if (invalidIds.length) {
    await admin
      .from("mobile_push_tokens")
      .update({ active: false })
      .in("id", invalidIds);
  }
  if (notification.lease_id) {
    const { error } = await admin.rpc('finish_mobile_shopping_push', {
      p_notification_id: notification.id, p_lease_id: notification.lease_id, p_sent: sent > 0,
    });
    if (error) throw new Error('shopping_receipt_failed');
  }
  return {
    notificationId: notification.id,
    sent,
    failed,
    disabled: invalidIds.length,
    audience: devices?.length || 0,
    failures: [...failureKinds],
  };
  };
  try {
    if (payload.shoppingQueue === true) {
      const { data, error } = await admin.rpc('due_mobile_shopping_pushes');
      if (error) throw new Error('shopping_queue_unavailable');
      const results = [];
      // Bounded batches, with individual failures isolated. Lease recovery and
      // stable collapse IDs handle worker crashes without a phone-side timer.
      for (let offset = 0; offset < (data || []).length; offset += 5) {
        results.push(...await Promise.all((data as number[]).slice(offset, offset + 5).map(async id => {
          try { return await dispatch(id); } catch { return { notificationId: id, retry: true }; }
        })));
      }
      return json({ results });
    }
    const notificationId = Number((payload.record || payload.notification || payload)?.id);
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) return json({ error: 'A notification id is required.' }, 400);
    return json(await dispatch(notificationId));
  } catch {
    return json({ error: 'Notification dispatch could not be completed.' }, 503);
  }
});
