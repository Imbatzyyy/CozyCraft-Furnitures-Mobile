import {
  findPaidProviderPayment,
  providerSessionLivemode,
} from "./paymongo-session.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";

type AdminClient = SupabaseClient;
type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;

export type PendingPaymongoTransaction = {
  id: string;
  order_id?: string;
  provider_session_id: string;
};

export type PaymongoExpiryResult =
  | { outcome: "paid"; providerPaymentId: string }
  | { outcome: "expired" }
  | { outcome: "retry"; message: string };

const authHeaders = (secretKey: string) => ({
  Authorization: `Basic ${btoa(`${secretKey}:`)}`,
  "Content-Type": "application/json",
});

const sessionUrl = (sessionId: string) =>
  `https://api.paymongo.com/v1/checkout_sessions/${
    encodeURIComponent(sessionId)
  }`;

const readJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const providerStatus = (payload: unknown) => {
  const root = record(payload);
  const data = record(root?.["data"]);
  const attributes = record(data?.["attributes"]);
  const status = attributes?.["status"];
  return typeof status === "string" ? status.toLowerCase() : null;
};

const providerError = (payload: unknown, fallback: string) => {
  const root = record(payload);
  const errors = root?.["errors"];
  const firstError = Array.isArray(errors) ? record(errors[0]) : null;
  const detail = firstError?.["detail"];
  return typeof detail === "string" && detail.trim() ? detail.trim() : fallback;
};

const updateProviderSnapshot = async ({
  adminClient,
  transaction,
  status,
  payload,
}: {
  adminClient: AdminClient;
  transaction: PendingPaymongoTransaction;
  status: string;
  payload: unknown;
}) => {
  const { error } = await adminClient
    .from("payment_transactions")
    .update({
      provider_status: status,
      last_synced_at: new Date().toISOString(),
      ...(payload ? { raw_payload: payload } : {}),
    })
    .eq("id", transaction.id)
    .eq("status", "pending");
  return error as { message?: string } | null;
};

const settlePaidSession = async ({
  adminClient,
  orderId,
  transaction,
  payload,
}: {
  adminClient: AdminClient;
  orderId: string;
  transaction: PendingPaymongoTransaction;
  payload: unknown;
}): Promise<PaymongoExpiryResult | null> => {
  const payment = findPaidProviderPayment(payload);
  if (!payment) return null;

  const { error } = await adminClient.rpc("settle_paymongo_order", {
    p_order_id: orderId,
    p_transaction_id: transaction.id,
    p_provider_payment_id: payment.id,
    p_livemode: providerSessionLivemode(payload),
    p_raw_payload: payload,
  });
  if (error) {
    return {
      outcome: "retry",
      message: error.message ??
        "The completed payment could not be reconciled yet.",
    };
  }
  return { outcome: "paid", providerPaymentId: payment.id };
};

const finalizeExpiredSession = async ({
  adminClient,
  orderId,
  transaction,
  payload,
  reason,
}: {
  adminClient: AdminClient;
  orderId: string;
  transaction: PendingPaymongoTransaction;
  payload: unknown;
  reason: string;
}): Promise<PaymongoExpiryResult> => {
  // The database cancellation RPC is deliberately gated by this verified
  // provider status. Inventory cannot be released while PayMongo can still
  // accept payment through the hosted URL.
  const snapshotError = await updateProviderSnapshot({
    adminClient,
    transaction,
    status: "expired",
    payload,
  });
  if (snapshotError) {
    return {
      outcome: "retry",
      message: snapshotError.message ??
        "The expired payment session could not be recorded.",
    };
  }

  const { data, error } = await adminClient.rpc("expire_paymongo_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) {
    return {
      outcome: "retry",
      message: error.message ?? "The expired order could not be finalized.",
    };
  }
  if (data === false) {
    return {
      outcome: "retry",
      message:
        "The order changed while its payment session was expiring and will be checked again.",
    };
  }
  return { outcome: "expired" };
};

const fetchSession = async (sessionId: string, secretKey: string) => {
  const response = await fetch(sessionUrl(sessionId), {
    headers: authHeaders(secretKey),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await readJson(response);
  return { response, payload };
};

/**
 * Reconciles an elapsed CozyCraft payment window with PayMongo before the
 * local order is cancelled. It always checks for a paid race, explicitly
 * expires an active hosted session, verifies the final provider state, and
 * only then lets PostgreSQL release inventory.
 */
export const reconcileElapsedPaymongoSession = async ({
  adminClient,
  orderId,
  transaction,
  secretKey,
  reason = "PayMongo payment window expired",
}: {
  adminClient: AdminClient;
  orderId: string;
  transaction: PendingPaymongoTransaction;
  secretKey: string;
  reason?: string;
}): Promise<PaymongoExpiryResult> => {
  try {
    const initial = await fetchSession(
      transaction.provider_session_id,
      secretKey,
    );
    if (!initial.response.ok) {
      await updateProviderSnapshot({
        adminClient,
        transaction,
        status: "verification_failed",
        payload: initial.payload,
      });
      return {
        outcome: "retry",
        message: providerError(
          initial.payload,
          "PayMongo could not verify the payment session.",
        ),
      };
    }

    const initiallyPaid = await settlePaidSession({
      adminClient,
      orderId,
      transaction,
      payload: initial.payload,
    });
    if (initiallyPaid) return initiallyPaid;

    if (providerStatus(initial.payload) === "expired") {
      return finalizeExpiredSession({
        adminClient,
        orderId,
        transaction,
        payload: initial.payload,
        reason,
      });
    }

    const expireResponse = await fetch(
      `${sessionUrl(transaction.provider_session_id)}/expire`,
      {
        method: "POST",
        headers: authHeaders(secretKey),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const expirePayload = await readJson(expireResponse);

    const paidDuringExpiry = await settlePaidSession({
      adminClient,
      orderId,
      transaction,
      payload: expirePayload,
    });
    if (paidDuringExpiry) return paidDuringExpiry;

    if (expireResponse.ok && providerStatus(expirePayload) === "expired") {
      return finalizeExpiredSession({
        adminClient,
        orderId,
        transaction,
        payload: expirePayload,
        reason,
      });
    }

    // A non-2xx expire response can mean payment won the race. Re-read the
    // canonical session once before deciding whether it is safe to cancel.
    const verified = await fetchSession(
      transaction.provider_session_id,
      secretKey,
    );
    if (!verified.response.ok) {
      await updateProviderSnapshot({
        adminClient,
        transaction,
        status: "verification_failed",
        payload: verified.payload ?? expirePayload,
      });
      return {
        outcome: "retry",
        message: providerError(
          expirePayload,
          "PayMongo did not confirm that the checkout session was closed.",
        ),
      };
    }

    const paidAfterExpiry = await settlePaidSession({
      adminClient,
      orderId,
      transaction,
      payload: verified.payload,
    });
    if (paidAfterExpiry) return paidAfterExpiry;

    if (providerStatus(verified.payload) === "expired") {
      return finalizeExpiredSession({
        adminClient,
        orderId,
        transaction,
        payload: verified.payload,
        reason,
      });
    }

    await updateProviderSnapshot({
      adminClient,
      transaction,
      status: providerStatus(verified.payload) ?? "active",
      payload: verified.payload,
    });
    return {
      outcome: "retry",
      message: providerError(
        expirePayload,
        "PayMongo kept the payment session active. The order was kept reserved for safety.",
      ),
    };
  } catch (error) {
    await updateProviderSnapshot({
      adminClient,
      transaction,
      status: "verification_failed",
      payload: null,
    });
    return {
      outcome: "retry",
      message: error instanceof Error
        ? error.message
        : "The payment provider could not be reached. The order was kept active.",
    };
  }
};
