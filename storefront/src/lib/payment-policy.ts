export type PaymentMethod = "cod" | "gcash" | "card";
export const COD_LIMIT = 20_000;
export const GCASH_LIMIT = 100_000;
export const CARD_LIMIT_EXCLUSIVE = 10_000_000;
export const effectiveCodLimit = (configured: unknown) => {
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 ? Math.min(value, COD_LIMIT) : COD_LIMIT;
};
const pesos = (value: number) => "₱" + value.toLocaleString("en-PH", { maximumFractionDigits: 2 });
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);

// Use the final payable amount, including delivery and after valid discounts.
export function paymentUnavailableReason(
  method: string, total: number, settings: Record<string, unknown>,
  outstandingCod = 0, serverCodLimit: number = COD_LIMIT,
): string {
  if (!["cod", "gcash", "card"].includes(method)) return "Choose a payment method.";
  if (settings[method + "_enabled"] === false) return "Temporarily unavailable. Please choose another payment method.";
  if (!Number.isFinite(total) || total < 1) return "The final payable total must be at least ₱1.";
  if (method === "cod") {
    const limit = Math.min(effectiveCodLimit(settings.cod_maximum_order), effectiveCodLimit(serverCodLimit));
    if (cents(total) > cents(limit)) return `Cash on delivery is available up to ${pesos(limit)}, including delivery and after discounts. Choose GCash or card.`;
    if (cents(total) + cents(Math.max(0, outstandingCod)) > cents(limit)) {
      return `Your unpaid COD orders leave ${pesos(Math.max(0, limit - outstandingCod))} available for COD. Choose GCash or card, or wait until those orders are settled.`;
    }
  }
  if (method === "gcash" && cents(total) > cents(GCASH_LIMIT)) return "GCash is available up to ₱100,000 per order. Choose a card for this total.";
  if (method === "card" && cents(total) >= cents(CARD_LIMIT_EXCLUSIVE)) return "Card payments must be below ₱10,000,000. Please contact CozyCraft for this order.";
  return "";
}
