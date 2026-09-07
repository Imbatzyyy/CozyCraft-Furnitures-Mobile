import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { invoiceEmail, type InvoiceOrder } from "../_shared/order-invoice.ts";

const origins = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
  "https://www.cozycraftfurnitures.com",
  "https://cozycraftfurnitures.com",
]);
Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origins.has(origin)
      ? origin
      : "https://www.cozycraftfurnitures.com",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cozycraft-platform",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) {
    return json({ error: "Origin not allowed." }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  const token = request.headers.get("Authorization")?.replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) {
    return json({ error: "Please sign in to request an invoice." }, 401);
  }
  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SECRET_KEY"),
    resend = Deno.env.get("RESEND_API_KEY");
  if (!url || !secret || !resend) {
    return json({ error: "Invoice email is temporarily unavailable." }, 503);
  }
  try {
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
      },
    });
    const { data: { user }, error: authError } = await admin.auth.getUser(
      token,
    );
    if (authError || !user) {
      return json({ error: "Please sign in again." }, 401);
    }
    if (!user.email || !user.email_confirmed_at) {
      return json({
        error: "Verify your account email before requesting an invoice.",
      }, 403);
    }
    const raw = await request.text();
    if (raw.length > 512) return json({ error: "Request is too large." }, 413);
    let body: { orderId?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    if (
      !body?.orderId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.orderId,
      )
    ) return json({ error: "Choose a valid order." }, 400);
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("customer_active").eq("id", user.id).single();
    if (profileError || !profile || profile.customer_active === false) {
      return json({ error: "This account cannot request invoices." }, 403);
    }
    // Never accept a recipient, amount, status, or user ID from the caller.
    const { data: order, error } = await admin.from("orders").select(
      "id,order_number,status,created_at,subtotal,delivery_fee,reward_discount,total,payment_method,payment_status,shipping_address,order_items(id,product_name,quantity,unit_price)",
    ).eq("id", body.orderId).eq("user_id", user.id).maybeSingle();
    if (error) {
      return json(
        { error: "Could not read the order. Please try again." },
        503,
      );
    }
    if (!order) return json({ error: "Order not found." }, 404);
    if (order.status !== "delivered") {
      return json({ error: "Invoices are available after delivery." }, 409);
    }
    let message: ReturnType<typeof invoiceEmail>;
    try {
      message = invoiceEmail(order as InvoiceOrder);
    } catch (cause) {
      return json({
        error: cause instanceof Error
          ? cause.message
          : "Order amounts need review.",
      }, 409);
    }
    const payload = {
      from: Deno.env.get("RESEND_FROM_EMAIL") ||
        "CozyCraft Furnitures <no-reply@auth.cozycraftfurnitures.com>",
      to: [user.email],
      reply_to: "cozycraftfurnitures2026@gmail.com",
      ...message,
    };
    // Repeated taps and network retries reuse one provider operation per order/day.
    const key = `order-invoice/${user.id}/${order.id}/${
      new Date().toISOString().slice(0, 10)
    }`;
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${resend}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    const response = await result.json().catch(() => ({}));
    if (!result.ok || typeof response.id !== "string") {
      return json({
        error: result.status === 409
          ? "An invoice request is already being processed. Please check your email or try again later."
          : "The email service could not accept your invoice. Please try again.",
      }, 503);
    }
    return json({
      accepted: true,
      email: user.email,
      orderNumber: order.order_number || order.id,
    });
  } catch {
    return json({
      error:
        "The invoice request could not be confirmed. Please retry; duplicate requests are protected.",
    }, 503);
  }
});
