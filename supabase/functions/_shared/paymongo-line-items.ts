export type PaymongoLineItem = {
  name: string;
  amount: number;
  currency: "PHP";
  quantity: number;
};

type OrderItem = {
  product_name: string;
  unit_price: number;
  quantity: number;
};

type PaymongoOrderSummary = {
  orderNumber: string;
  total: number;
  deliveryFee: number;
  rewardDiscount: number;
  items: OrderItem[];
};

const totalCentavos = (items: PaymongoLineItem[]) =>
  items.reduce((total, item) => total + item.amount * item.quantity, 0);

const summarizedOrderItem = (
  orderNumber: string,
  amount: number,
  rewardApplied: boolean,
): PaymongoLineItem => ({
  name: rewardApplied
    ? `CozyCraft order ${orderNumber} · Home Circle reward applied`
    : `CozyCraft order ${orderNumber}`,
  amount,
  currency: "PHP",
  quantity: 1,
});

export const buildPaymongoLineItems = ({
  orderNumber,
  total,
  deliveryFee,
  rewardDiscount,
  items,
}: PaymongoOrderSummary): PaymongoLineItem[] => {
  const expectedTotal = Math.round(Number(total) * 100);
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 1) {
    throw new Error("The PayMongo checkout total is invalid.");
  }

  // PayMongo line items cannot contain a negative discount. Once a reward is
  // applied, a single descriptive line keeps the hosted charge exactly equal
  // to the database total without exposing an incorrect pre-discount amount.
  if (Number(rewardDiscount) > 0) {
    return [summarizedOrderItem(orderNumber, expectedTotal, true)];
  }

  const lineItems: PaymongoLineItem[] = items.map((item) => ({
    name: String(item.product_name || "CozyCraft furniture").slice(0, 255),
    amount: Math.round(Number(item.unit_price) * 100),
    currency: "PHP",
    quantity: Number(item.quantity),
  }));
  const deliveryCentavos = Math.round(Math.max(0, Number(deliveryFee)) * 100);
  if (deliveryCentavos > 0) {
    lineItems.push({
      name: "CozyCraft delivery",
      amount: deliveryCentavos,
      currency: "PHP",
      quantity: 1,
    });
  }

  const valid = lineItems.length > 0 &&
    lineItems.every((item) =>
      Number.isSafeInteger(item.amount) && item.amount > 0 &&
      Number.isSafeInteger(item.quantity) && item.quantity > 0
    );
  return valid && totalCentavos(lineItems) === expectedTotal
    ? lineItems
    : [summarizedOrderItem(orderNumber, expectedTotal, false)];
};
