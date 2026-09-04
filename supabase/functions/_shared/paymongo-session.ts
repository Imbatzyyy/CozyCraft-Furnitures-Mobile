type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;

export type PaidProviderPayment = { id: string };

export const findPaidProviderPayment = (
  payload: unknown,
): PaidProviderPayment | null => {
  const root = record(payload);
  const session = record(root?.data);
  const attributes = record(session?.attributes);
  const payments = Array.isArray(attributes?.payments)
    ? attributes.payments
    : [];

  for (const candidate of payments) {
    const payment = record(candidate);
    const nested = record(payment?.data);
    const paymentAttributes = record(payment?.attributes) ??
      record(nested?.attributes);
    if (paymentAttributes?.status !== "paid") continue;
    const id = typeof payment?.id === "string"
      ? payment.id
      : typeof nested?.id === "string"
      ? nested.id
      : "";
    if (id) return { id };
  }
  return null;
};

export const providerSessionLivemode = (payload: unknown) => {
  const root = record(payload);
  const session = record(root?.data);
  const attributes = record(session?.attributes);
  return attributes?.livemode === true;
};
