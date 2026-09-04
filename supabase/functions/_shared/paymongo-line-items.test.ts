import { strict as assert } from "node:assert";
import { buildPaymongoLineItems } from "./paymongo-line-items.ts";

Deno.test("keeps product and delivery lines when they match the order total", () => {
  const lines = buildPaymongoLineItems({
    orderNumber: "CC-01042",
    total: 13_649,
    deliveryFee: 650,
    rewardDiscount: 0,
    items: [{ product_name: "EKOLSUND", unit_price: 12_999, quantity: 1 }],
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.amount, 1_299_900);
  assert.equal(lines[1]?.amount, 65_000);
  assert.equal(
    lines.reduce((sum, line) => sum + line.amount * line.quantity, 0),
    1_364_900,
  );
});

Deno.test("charges the exact discounted database total for a rewarded order", () => {
  const lines = buildPaymongoLineItems({
    orderNumber: "CC-01043",
    total: 13_149,
    deliveryFee: 650,
    rewardDiscount: 500,
    items: [{ product_name: "EKOLSUND", unit_price: 12_999, quantity: 1 }],
  });
  assert.deepEqual(lines, [{
    name: "CozyCraft order CC-01043 · Home Circle reward applied",
    amount: 1_314_900,
    currency: "PHP",
    quantity: 1,
  }]);
});

Deno.test("falls back to one exact line when provider line rounding differs", () => {
  const lines = buildPaymongoLineItems({
    orderNumber: "CC-01044",
    total: 100,
    deliveryFee: 0,
    rewardDiscount: 0,
    items: [{ product_name: "Sample", unit_price: 33.333, quantity: 3 }],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.amount, 10_000);
});

Deno.test("rejects a zero or non-finite provider total", () => {
  const base = {
    orderNumber: "CC-01045",
    deliveryFee: 0,
    rewardDiscount: 0,
    items: [{ product_name: "Sample", unit_price: 1, quantity: 1 }],
  };
  assert.throws(() => buildPaymongoLineItems({ ...base, total: 0 }), /invalid/);
  assert.throws(
    () => buildPaymongoLineItems({ ...base, total: Number.NaN }),
    /invalid/,
  );
});
