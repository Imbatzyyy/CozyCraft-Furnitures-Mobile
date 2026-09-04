import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  maskEmail,
  mobilePaymentIntentDigest,
  mobilePaymentMethodLabel,
  normalizeMobilePaymentIntent,
  paymentCodeDigest,
  randomSixDigitCode,
} from "../_shared/mobile-payment-authorization.ts";

const canonicalOrigin = "https://www.cozycraftfurnitures.com";
const allowedOrigins = new Set([
  canonicalOrigin,
  "https://cozycraftfurnitures.com",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : canonicalOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cozycraft-platform",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
};

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]!);

type RequestPayload =
  | {
    action: "request";
    addressId?: string;
    checkoutKey?: string;
    paymentMethod?: string;
    items?: Array<{ product_id?: string; quantity?: number }>;
    redemptionId?: string | null;
  }
  | { action: "verify"; challengeId?: string; code?: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed." }, 405);
  }

  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return json(request, {
      error: "This app is not allowed to request payment verification.",
    }, 403);
  }
  if (Number(request.headers.get("Content-Length") ?? 0) > 24_000) {
    return json(
      request,
      { error: "The verification request is too large." },
      413,
    );
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return json(request, { error: "Please sign in before checking out." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");
  const otpHashSecret = Deno.env.get("OTP_HASH_SECRET");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (
    !supabaseUrl || !publishableKey || !serviceRoleKey || !otpHashSecret ||
    !resendKey
  ) {
    console.error(
      "mobile payment email verification configuration is incomplete",
    );
    return json(request, {
      error: "Payment email verification is temporarily unavailable.",
    }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json(request, {
      error: "Your session has expired. Please sign in again.",
    }, 401);
  }

  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,full_name,role,customer_active")
    .eq("id", user.id)
    .single();
  if (
    profileError || !profile || profile.role !== "customer" ||
    profile.customer_active === false
  ) {
    return json(
      request,
      { error: "An active customer account is required." },
      403,
    );
  }
  const email = String(user.email ?? "").trim().toLowerCase();
  if (
    !email || !user.email_confirmed_at ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return json(request, {
      error:
        "Verify the email on your CozyCraft account before using online payment.",
    }, 409);
  }

  const payload = await request.json().catch(() => null) as
    | RequestPayload
    | null;
  if (
    !payload || (payload.action !== "request" && payload.action !== "verify")
  ) {
    return json(
      request,
      { error: "Invalid payment verification request." },
      400,
    );
  }

  if (payload.action === "request") {
    let intent;
    try {
      intent = normalizeMobilePaymentIntent(
        payload as unknown as Record<string, unknown>,
      );
    } catch (error) {
      return json(request, {
        error: error instanceof Error
          ? error.message
          : "Invalid checkout details.",
      }, 400);
    }

    const { data: address, error: addressError } = await userClient
      .from("addresses")
      .select("id")
      .eq("id", intent.addressId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (addressError || !address) {
      return json(request, {
        error: "Choose a delivery address saved to your account.",
      }, 400);
    }

    const intentDigest = await mobilePaymentIntentDigest(user.id, intent);
    const challengeId = crypto.randomUUID();
    const code = randomSixDigitCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const codeDigest = await paymentCodeDigest(
      otpHashSecret,
      challengeId,
      user.id,
      intentDigest,
      code,
    );

    const { data: reservationResult, error: reservationError } = await admin
      .rpc("reserve_mobile_payment_challenge", {
        p_challenge_id: challengeId,
        p_user_id: user.id,
        p_email: email,
        p_checkout_key: intent.checkoutKey,
        p_payment_method: intent.paymentMethod,
        p_intent_digest: intentDigest,
        p_code_digest: codeDigest,
        p_expires_at: expiresAt,
      });
    if (reservationError) {
      console.error(
        "Atomic payment challenge reservation failed",
        reservationError.code ?? "database",
      );
      return json(
        request,
        { error: "Payment verification could not start." },
        500,
      );
    }

    const reservation = record(reservationResult);
    const reservationOutcome = reservation["outcome"];
    const retryAfter = Math.max(
      1,
      Math.ceil(Number(reservation["retry_after"]) || 0),
    );
    if (reservationOutcome === "cooldown") {
      return json(request, {
        error:
          `Please wait ${retryAfter} seconds before requesting another payment code.`,
        retryAfter,
      }, 429);
    }
    if (reservationOutcome === "hourly_limit") {
      return json(request, {
        error:
          "Too many payment codes were requested. Please try again in one hour.",
        retryAfter,
      }, 429);
    }
    if (
      reservationOutcome !== "reserved" ||
      reservation["challenge_id"] !== challengeId
    ) {
      return json(
        request,
        { error: "Payment verification could not start." },
        500,
      );
    }

    const methodLabel = mobilePaymentMethodLabel(intent.paymentMethod);
    const displayName =
      String(profile.full_name || "there").trim().slice(0, 120) || "there";
    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_EMAIL") ??
          "CozyCraft Furnitures <no-reply@auth.cozycraftfurnitures.com>",
        to: [email],
        subject: `${code} is your CozyCraft payment code`,
        html:
          `<!doctype html><html><body style="margin:0;background:#f3efe8;font-family:Arial,sans-serif;color:#24211e"><div style="display:none;max-height:0;overflow:hidden;opacity:0">Your secure CozyCraft payment code is ${code}.</div><div style="padding:32px 14px"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e1d9ce;border-radius:24px;overflow:hidden"><div style="padding:28px 32px;border-bottom:1px solid #e5ded3;text-align:center"><img src="${canonicalOrigin}/email-logo.png" alt="CozyCraft Furnitures" width="150" style="max-width:150px;height:auto"><p style="margin:12px 0 0;font-size:10px;font-weight:bold;letter-spacing:2.2px;color:#756e65">SECURE MOBILE PAYMENT</p></div><div style="padding:34px 32px"><p style="margin:0 0 14px">Hello ${
            escapeHtml(displayName)
          },</p><h1 style="font-family:Georgia,serif;font-size:34px;line-height:1.12;margin:0 0 16px">Confirm your ${
            escapeHtml(methodLabel)
          } checkout.</h1><p style="color:#6e675f;line-height:1.7">Enter this one-time code in the CozyCraft mobile app. It expires in five minutes.</p><div style="margin:26px 0;padding:20px;border-radius:16px;background:#eee8de;text-align:center;font-size:34px;font-weight:bold;letter-spacing:10px">${code}</div><p style="margin:0;color:#7b746b;font-size:13px;line-height:1.65">Never share this code. CozyCraft staff will never ask for it. If you did not try to check out, ignore this message and consider changing your password.</p></div><div style="padding:20px 32px;background:#eee8de;color:#6f675e;font-size:12px;line-height:1.6">This code authorizes only the current GCash or card checkout in the CozyCraft mobile app. It does not confirm that payment was completed.</div></div></div></body></html>`,
      }),
    }).catch(() => null);
    const providerBody = await providerResponse?.json().catch(() => ({}));
    const providerReference = typeof providerBody?.id === "string"
      ? providerBody.id
      : null;
    if (!providerResponse?.ok || !providerReference) {
      console.error(
        "Resend payment OTP failed",
        providerResponse?.status ?? "network",
      );
      await admin.from("mobile_payment_email_challenges").update({
        status: "failed",
        last_error_code: providerResponse
          ? `http_${providerResponse.status}`
          : "network",
      }).eq("id", challengeId);
      return json(request, {
        error:
          "The payment code could not be emailed. Check your connection and try again.",
      }, 502);
    }

    const { data: sentChallenge, error: sentError } = await admin.from(
      "mobile_payment_email_challenges",
    ).update({
      status: "sent",
      provider_reference: providerReference,
    }).eq("id", challengeId).eq("status", "pending").select("id").maybeSingle();
    if (sentError || !sentChallenge) {
      console.error("Sent payment OTP could not be activated", sentError);
      return json(request, {
        error:
          "The payment code was emailed but could not be activated. Wait one minute, then send a new code.",
        retryAfter: 60,
      }, 503);
    }
    return json(request, {
      status: "code_sent",
      challengeId,
      maskedEmail: maskEmail(email),
      expiresAt,
      resendAfter: 60,
      paymentMethod: intent.paymentMethod,
      checkoutKey: intent.checkoutKey,
    }, 201);
  }

  const challengeId = typeof payload.challengeId === "string"
    ? payload.challengeId.trim()
    : "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(challengeId) || !/^\d{6}$/.test(code)
  ) {
    return json(request, {
      error: "Enter the complete six-digit payment code.",
    }, 400);
  }

  const { data: challenge, error: challengeError } = await admin
    .from("mobile_payment_email_challenges")
    .select("id,intent_digest")
    .eq("id", challengeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (challengeError || !challenge) {
    return json(request, {
      error: "This payment code is no longer valid. Request a new one.",
    }, 400);
  }
  const submittedDigest = await paymentCodeDigest(
    otpHashSecret,
    challengeId,
    user.id,
    challenge.intent_digest,
    code,
  );
  const { data: verificationResult, error: verificationError } = await admin
    .rpc("verify_mobile_payment_code", {
      p_challenge_id: challengeId,
      p_user_id: user.id,
      p_code_digest: submittedDigest,
    });
  if (verificationError) {
    console.error("Atomic payment code verification failed", verificationError);
    return json(request, {
      error: "The payment code could not be checked. Please try again.",
    }, 503);
  }
  const verification = record(verificationResult);
  const outcome = verification["outcome"];
  if (outcome === "incorrect") {
    const attemptsRemaining = Math.max(
      0,
      Number(verification["attempts_remaining"]) || 0,
    );
    return json(request, {
      error: attemptsRemaining === 0
        ? "Too many incorrect attempts. Request a new payment code."
        : `That code is incorrect. ${attemptsRemaining} attempt${
          attemptsRemaining === 1 ? "" : "s"
        } remaining.`,
      attemptsRemaining,
    }, 400);
  }
  if (outcome !== "verified") {
    const message = outcome === "newer"
      ? "A newer payment code was sent. Enter the latest code instead."
      : outcome === "expired"
      ? "The payment code expired. Request a new one."
      : "This payment code can no longer be used. Request a new one.";
    return json(request, {
      error: message,
    }, 400);
  }

  return json(request, {
    status: "authorized",
    authorizationId: verification["authorization_id"],
    checkoutKey: verification["checkout_key"],
    paymentMethod: verification["payment_method"],
    expiresAt: verification["expires_at"],
    verifiedAt: verification["verified_at"],
  });
});
