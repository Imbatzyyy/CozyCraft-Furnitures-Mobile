export type MobilePaymentMethod = "card" | "gcash";

export type MobilePaymentIntent = {
  addressId: string;
  checkoutKey: string;
  paymentMethod: MobilePaymentMethod;
  items: Array<{ product_id: string; quantity: number }>;
  redemptionId: string | null;
};

export class MobilePaymentIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobilePaymentIntentError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checkoutKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hex = (value: ArrayBuffer) =>
  Array.from(
    new Uint8Array(value),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

export const isUuid = (value: unknown) =>
  typeof value === "string" && uuidPattern.test(value.trim());

export const normalizeMobilePaymentIntent = (
  payload: Record<string, unknown>,
): MobilePaymentIntent => {
  const addressId = typeof payload["addressId"] === "string"
    ? payload["addressId"].trim()
    : "";
  const checkoutKey = typeof payload["checkoutKey"] === "string"
    ? payload["checkoutKey"].trim()
    : "";
  const paymentMethod = payload["paymentMethod"];
  const redemptionId = typeof payload["redemptionId"] === "string" &&
      payload["redemptionId"].trim()
    ? payload["redemptionId"].trim()
    : null;
  const inputItems = Array.isArray(payload["items"]) ? payload["items"] : [];

  if (!isUuid(addressId)) {
    throw new MobilePaymentIntentError(
      "Choose a valid delivery address before continuing.",
    );
  }
  if (!checkoutKeyPattern.test(checkoutKey)) {
    throw new MobilePaymentIntentError(
      "The secure checkout reference is invalid. Please try again.",
    );
  }
  if (paymentMethod !== "card" && paymentMethod !== "gcash") {
    throw new MobilePaymentIntentError(
      "Choose GCash or card before requesting a payment code.",
    );
  }
  if (redemptionId && !isUuid(redemptionId)) {
    throw new MobilePaymentIntentError(
      "The selected reward is invalid. Refresh checkout and try again.",
    );
  }
  if (inputItems.length === 0 || inputItems.length > 50) {
    throw new MobilePaymentIntentError(
      "Your checkout selection is empty or too large.",
    );
  }

  const seen = new Set<string>();
  const items = inputItems.map((input) => {
    const item = input && typeof input === "object"
      ? input as Record<string, unknown>
      : {};
    const productId = typeof item["product_id"] === "string"
      ? item["product_id"].trim()
      : "";
    const quantity = Number(item["quantity"]);
    if (
      !productId || productId.length > 200 || !Number.isInteger(quantity) ||
      quantity < 1 || quantity > 99
    ) {
      throw new MobilePaymentIntentError(
        "One or more checkout quantities are invalid.",
      );
    }
    if (seen.has(productId)) {
      throw new MobilePaymentIntentError(
        "A product appears more than once in this checkout. Refresh your bag and try again.",
      );
    }
    seen.add(productId);
    return { product_id: productId, quantity };
  }).sort((left, right) => left.product_id.localeCompare(right.product_id));

  return { addressId, checkoutKey, paymentMethod, items, redemptionId };
};

export const mobilePaymentIntentDigest = async (
  userId: string,
  intent: MobilePaymentIntent,
) => {
  const canonical = JSON.stringify({
    version: 1,
    userId,
    addressId: intent.addressId,
    checkoutKey: intent.checkoutKey,
    paymentMethod: intent.paymentMethod,
    redemptionId: intent.redemptionId,
    items: intent.items,
  });
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)),
  );
};

export const randomSixDigitCode = () => {
  const maximum = 0x1_0000_0000;
  const acceptedMaximum = maximum - (maximum % 1_000_000);
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample); while (sample[0] >= acceptedMaximum);
  return String(sample[0] % 1_000_000).padStart(6, "0");
};

export const paymentCodeDigest = async (
  secret: string,
  challengeId: string,
  userId: string,
  intentDigest: string,
  code: string,
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        `${challengeId}.${userId}.${intentDigest}.${code}`,
      ),
    ),
  );
};

export const safeEqual = (left: string, right: string) => {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
};

export const maskEmail = (email: string) => {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "your verified email";
  const visibleLocal = local.length <= 2
    ? local.slice(0, 1)
    : local.slice(0, 2);
  const [domainName = "", ...suffix] = domain.split(".");
  const visibleDomain = domainName.slice(0, 1);
  const hiddenLocal = "•".repeat(
    Math.max(2, Math.min(6, local.length - visibleLocal.length)),
  );
  const hiddenDomain = "•".repeat(
    Math.max(2, Math.min(6, domainName.length - visibleDomain.length)),
  );
  return `${visibleLocal}${hiddenLocal}@${visibleDomain}${hiddenDomain}${
    suffix.length ? `.${suffix.join(".")}` : ""
  }`;
};

export const mobilePaymentMethodLabel = (method: MobilePaymentMethod) =>
  method === "gcash" ? "GCash" : "credit or debit card";
