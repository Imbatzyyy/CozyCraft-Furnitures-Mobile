import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.111.0";
import { reconcileElapsedPaymongoSession } from "../_shared/paymongo-expiry.ts";
import {
  isUuid,
  mobilePaymentIntentDigest,
  normalizeMobilePaymentIntent,
} from "../_shared/mobile-payment-authorization.ts";
import { buildPaymongoLineItems } from "../_shared/paymongo-line-items.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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
const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin":
    allowedOrigins.has(request.headers.get("Origin") ?? "")
      ? request.headers.get("Origin")!
      : canonicalOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cozycraft-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Vary": "Origin",
});

const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });

const failOrder = async (
  adminClient: SupabaseClient,
  orderId: string | null,
  reason: string,
) => {
  if (!orderId) return;
  const { error } = await adminClient.rpc("fail_paymongo_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) {
    console.error("Could not mark failed PayMongo order", orderId, error);
  }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return json(request, { error: "Authentication required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");
  const paymongoSecretKey = Deno.env.get("PAYMONGO_SECRET_KEY");

  if (
    !supabaseUrl || !publishableKey || !serviceRoleKey || !paymongoSecretKey
  ) {
    return json(
      request,
      { error: "PayMongo checkout is not configured yet." },
      503,
    );
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return json(request, {
      error: "Your session has expired. Please sign in again.",
    }, 401);
  }

  let payload: {
    addressId?: string;
    paymentMethod?: string;
    returnOrigin?: string;
    checkoutKey?: string;
    items?: Array<{ product_id: string; quantity: number }>;
    redemptionId?: string | null;
    mobileReturn?: boolean;
    mobilePlatform?: string;
    paymentAuthorizationId?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "Invalid checkout request." }, 400);
  }

  const paymentMethod = payload.paymentMethod;
  if (!payload.addressId || !["card", "gcash"].includes(paymentMethod ?? "")) {
    return json(request, {
      error: "Choose a valid delivery address and payment method.",
    }, 400);
  }
  if (
    !payload.checkoutKey ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(payload.checkoutKey)
  ) {
    return json(request, { error: "Invalid checkout key." }, 400);
  }
  if (
    !Array.isArray(payload.items) || payload.items.length === 0 ||
    payload.items.length > 50
  ) {
    return json(request, {
      error: "Your checkout selection is empty or too large.",
    }, 400);
  }
  const items = payload.items.map((item) => ({
    product_id: String(item.product_id ?? ""),
    quantity: Number(item.quantity),
  }));
  if (
    items.some((item) =>
      !item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1
    )
  ) {
    return json(request, {
      error: "One or more checkout quantities are invalid.",
    }, 400);
  }

  const mobileClient = payload.mobileReturn === true ||
    request.headers.get("x-cozycraft-platform")?.toLowerCase() === "mobile";
  let mobileIntentDigest: string | null = null;
  if (mobileClient) {
    if (!isUuid(payload.paymentAuthorizationId)) {
      return json(request, {
        error:
          "Verify the payment code sent to your email before opening PayMongo.",
        paymentVerificationRequired: true,
      }, 403);
    }
    try {
      const intent = normalizeMobilePaymentIntent({ ...payload, items });
      mobileIntentDigest = await mobilePaymentIntentDigest(user.id, intent);
    } catch (error) {
      return json(request, {
        error: error instanceof Error
          ? error.message
          : "The authorized checkout details are invalid.",
      }, 400);
    }
    const { data: authorizationValid, error: authorizationError } =
      await userClient.rpc(
        "mobile_payment_authorization_valid",
        {
          p_challenge_id: payload.paymentAuthorizationId,
          p_checkout_key: payload.checkoutKey,
          p_payment_method: paymentMethod,
          p_intent_digest: mobileIntentDigest,
        },
      );
    if (authorizationError) {
      console.error(
        "Could not validate mobile payment authorization",
        authorizationError,
      );
      return json(request, {
        error: "Your payment code could not be checked yet. Please try again.",
        retryable: true,
      }, 503);
    }
    if (authorizationValid !== true) {
      return json(request, {
        error:
          "This payment code expired or does not match the current order. Send a new code and try again.",
        paymentVerificationRequired: true,
      }, 403);
    }
  }

  let orderId: string | null = null;
  let providerRequestStarted = false;
  try {
    const { data, error } = await userClient.rpc("place_order", {
      p_address_id: payload.addressId,
      p_payment_method: paymentMethod,
      p_items: items,
      p_checkout_key: payload.checkoutKey,
    });
    if (error) return json(request, { error: error.message }, 400);
    orderId = data as string;

    if (mobileClient) {
      const { data: authorizationConsumed, error: consumptionError } =
        await userClient.rpc(
          "consume_mobile_payment_authorization",
          {
            p_challenge_id: payload.paymentAuthorizationId,
            p_checkout_key: payload.checkoutKey,
            p_payment_method: paymentMethod,
            p_intent_digest: mobileIntentDigest,
            p_order_id: orderId,
          },
        );
      if (consumptionError) {
        console.error(
          "Reserved order is waiting for payment authorization binding",
          orderId,
          consumptionError,
        );
        return json(request, {
          error:
            "Your order is reserved, but its payment authorization is still being secured. Please try again.",
          retryable: true,
          orderId,
        }, 503);
      }
      if (authorizationConsumed !== true) {
        await failOrder(
          adminClient,
          orderId,
          "Mobile payment authorization was not valid for this order.",
        );
        orderId = null;
        return json(request, {
          error:
            "This payment code is no longer valid for the current order. Send a new code and try again.",
          paymentVerificationRequired: true,
        }, 403);
      }
    }

    if (payload.redemptionId) {
      const { error: rewardError } = await userClient.rpc(
        "apply_mobile_reward_to_order",
        {
          p_order_id: orderId,
          p_redemption_id: payload.redemptionId,
        },
      );
      if (rewardError) {
        await failOrder(
          adminClient,
          orderId,
          "The selected Home Circle reward could not be secured.",
        );
        orderId = null;
        return json(request, {
          error:
            "The selected Home Circle reward is no longer available. Return to checkout and choose another reward.",
          checkoutRefreshRequired: true,
        }, 409);
      }
    }

    // These reads are independent once the atomic order reservation returns.
    // Running them together removes one database round-trip from every online
    // checkout without weakening inventory or idempotency guarantees.
    const [existingTransactionResult, orderResult] = await Promise.all([
      adminClient
        .from("payment_transactions")
        .select(
          "id,order_id,provider_session_id,checkout_url,status,expires_at",
        )
        .eq("order_id", orderId)
        .maybeSingle(),
      adminClient
        .from("orders")
        .select(
          "id,order_number,total,delivery_fee,reward_discount,shipping_address,order_items(product_name,unit_price,quantity)",
        )
        .eq("id", orderId)
        .eq("user_id", user.id)
        .single(),
    ]);
    const { data: existingTransaction } = existingTransactionResult;
    const { data: order, error: orderError } = orderResult;
    if (existingTransactionResult.error || orderError) {
      // place_order is idempotent and has already reserved this order. A
      // transient read failure must remain retryable; cancelling here could
      // destroy a valid order or race an existing PayMongo session.
      console.error(
        "Reserved PayMongo order could not be read",
        orderId,
        existingTransactionResult.error ?? orderError,
      );
      return json(request, {
        error:
          "Your order is reserved, but payment setup could not be loaded yet. Please try again.",
        retryable: true,
        orderId,
      }, 503);
    }
    if (
      existingTransaction?.checkout_url &&
      existingTransaction.status === "pending" &&
      existingTransaction.expires_at &&
      Date.parse(existingTransaction.expires_at) > Date.now()
    ) {
      return json(request, {
        orderId,
        orderNumber: order?.order_number ?? null,
        checkoutUrl: existingTransaction.checkout_url,
        expiresAt: existingTransaction.expires_at,
        reused: true,
      });
    }
    if (
      existingTransaction?.status === "pending" &&
      existingTransaction.id &&
      existingTransaction.provider_session_id
    ) {
      const reconciliation = await reconcileElapsedPaymongoSession({
        adminClient,
        orderId,
        transaction: {
          id: existingTransaction.id,
          order_id: existingTransaction.order_id,
          provider_session_id: existingTransaction.provider_session_id,
        },
        secretKey: paymongoSecretKey,
      });
      if (reconciliation.outcome === "paid") {
        return json(request, {
          error: "This order has already been paid.",
          paid: true,
          orderId,
          orderNumber: order?.order_number ?? null,
        }, 409);
      }
      if (reconciliation.outcome === "expired") {
        return json(request, {
          error:
            "The previous payment window expired. Please return to your bag and place the order again.",
          expired: true,
          orderId,
        }, 410);
      }
      return json(request, {
        error:
          "The previous payment session could not be safely closed yet. Please try again shortly.",
        retryable: true,
        orderId,
      }, 503);
    }
    if (existingTransaction?.status === "pending") {
      return json(request, {
        error:
          "The previous payment reference is incomplete. The order was kept reserved for safety.",
        retryable: true,
        orderId,
      }, 503);
    }
    if (existingTransaction?.status === "paid") {
      return json(request, {
        error: "This order has already been paid.",
        paid: true,
        orderId,
        orderNumber: order?.order_number ?? null,
      }, 409);
    }
    if (!order) {
      return json(request, {
        error:
          "Your order is reserved, but its details are not available yet. Please try again.",
        retryable: true,
        orderId,
      }, 503);
    }

    const lineItems = buildPaymongoLineItems({
      orderNumber: order.order_number,
      total: Number(order.total),
      deliveryFee: Number(order.delivery_fee),
      rewardDiscount: Number(order.reward_discount),
      items: order.order_items,
    });
    const shipping = order.shipping_address as Record<string, string>;
    providerRequestStarted = true;
    const paymongoResponse = await fetch(
      "https://api.paymongo.com/v2/checkout_sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${paymongoSecretKey}:`)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": payload.checkoutKey,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: lineItems,
              payment_method_types: [paymentMethod],
              success_url:
                `${canonicalOrigin}/payment-return?payment=success&order=${order.id}`,
              cancel_url:
                `${canonicalOrigin}/payment-return?payment=cancelled&order=${order.id}`,
              reference_number: order.order_number,
              description: `CozyCraft order ${order.order_number}`,
              send_email_receipt: true,
              show_description: true,
              show_line_items: true,
              billing: {
                name: shipping.name,
                email: shipping.email,
                phone: shipping.mobile,
              },
              metadata: { order_id: order.id, user_id: user.id },
            },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const paymongoBody = await paymongoResponse.json().catch(() => null);
    if (!paymongoResponse.ok) {
      const message = paymongoBody?.errors?.[0]?.detail ??
        "PayMongo could not create the checkout session.";
      const isDefinitiveClientRejection = paymongoResponse.status >= 400 &&
        paymongoResponse.status < 500 &&
        ![408, 409, 425, 429].includes(paymongoResponse.status);
      if (isDefinitiveClientRejection) {
        // A definitive validation/authentication rejection means no hosted
        // checkout was accepted, so releasing the local reservation is safe.
        await failOrder(adminClient, orderId, message);
        orderId = null;
        return json(request, { error: message }, 502);
      }
      // Rate limits, conflicts and provider/server failures can be ambiguous.
      // Preserve the order and recover with the same idempotency key.
      return json(request, {
        error: message,
        retryable: true,
        orderId: order.id,
      }, 503);
    }

    const session = paymongoBody?.data;
    const checkoutUrl = session?.attributes?.checkout_url;
    if (!session?.id || !checkoutUrl) {
      // A 2xx response with an unreadable body is ambiguous: a payable hosted
      // session may exist. Keep the order reserved so the same idempotency key
      // can safely recover it on retry.
      return json(request, {
        error:
          "PayMongo created an incomplete payment response. Please try again to recover your reserved order.",
        retryable: true,
        orderId: order.id,
      }, 503);
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data: registeredCheckout, error: registrationError } =
      await adminClient.rpc(
        "register_paymongo_checkout",
        {
          p_order_id: order.id,
          p_provider_session_id: session.id,
          p_checkout_url: checkoutUrl,
          p_amount: order.total,
          p_livemode: Boolean(session.attributes?.livemode),
          p_raw_payload: session,
          p_expires_at: expiresAt,
        },
      );
    if (registrationError || !registeredCheckout) {
      // Persistence may have committed even if the response was interrupted.
      // Re-read the unique order transaction and return the winner. Never call
      // failOrder here: doing so could cancel a valid concurrent checkout.
      const [{ data: winner, error: winnerError }, { data: currentOrder }] =
        await Promise.all([
          adminClient
            .from("payment_transactions")
            .select("provider_session_id,checkout_url,status,expires_at")
            .eq("order_id", order.id)
            .maybeSingle(),
          adminClient
            .from("orders")
            .select("order_number,payment_status")
            .eq("id", order.id)
            .maybeSingle(),
        ]);
      if (
        !winnerError &&
        winner?.status === "pending" &&
        winner.checkout_url &&
        winner.expires_at &&
        Date.parse(winner.expires_at) > Date.now()
      ) {
        return json(request, {
          orderId: order.id,
          orderNumber: currentOrder?.order_number ?? order.order_number,
          checkoutUrl: winner.checkout_url,
          expiresAt: winner.expires_at,
          reused: true,
        });
      }
      if (
        !winnerError &&
        (winner?.status === "paid" || currentOrder?.payment_status === "paid")
      ) {
        return json(request, {
          error: "This order has already been paid.",
          paid: true,
          orderId: order.id,
          orderNumber: currentOrder?.order_number ?? order.order_number,
        }, 409);
      }
      console.error(
        "PayMongo checkout persistence will be retried",
        order.id,
        registrationError ?? winnerError,
      );
      return json(request, {
        error:
          "Your payment session is being secured. Please try again with the same order.",
        retryable: true,
        orderId: order.id,
      }, 503);
    }

    const persisted = registeredCheckout as {
      checkoutUrl?: string;
      status?: string;
      expiresAt?: string;
    };
    if (persisted.status === "paid") {
      return json(request, {
        error: "This order has already been paid.",
        paid: true,
        orderId: order.id,
        orderNumber: order.order_number,
      }, 409);
    }
    if (!persisted.checkoutUrl || !persisted.expiresAt) {
      return json(request, {
        error:
          "Your payment session is being secured. Please try again with the same order.",
        retryable: true,
        orderId: order.id,
      }, 503);
    }

    // Email delivery must never delay the customer-facing redirect. The edge
    // runtime keeps this background task alive after the response is returned.
    EdgeRuntime.waitUntil(
      adminClient.functions.invoke("send-transactional-email", {
        body: { eventType: "order_confirmation", orderId: order.id },
      }).then(() => undefined),
    );

    return json(request, {
      orderId: order.id,
      orderNumber: order.order_number,
      checkoutUrl: persisted.checkoutUrl,
      expiresAt: persisted.expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unable to start PayMongo checkout.";
    if (providerRequestStarted) {
      // A network timeout or interrupted response does not prove that PayMongo
      // failed to create the session. Retrying with the same checkout key and
      // Idempotency-Key is safe; cancelling the order here is not.
      console.error(
        "Ambiguous PayMongo checkout attempt will be retried",
        orderId,
        error,
      );
      return json(request, {
        error:
          "PayMongo did not confirm the payment session yet. Please try again.",
        retryable: true,
        orderId,
      }, 503);
    }
    await failOrder(adminClient, orderId, message);
    return json(request, { error: message }, 502);
  }
});
