import assert from "node:assert/strict";
import test from "node:test";
import {
  maskEmail,
  mobilePaymentIntentDigest,
  normalizeMobilePaymentIntent,
  paymentCodeDigest,
  randomSixDigitCode,
  safeEqual,
} from "./mobile-payment-authorization.ts";

const checkoutKey = "30cfb521-9c92-4b8a-8dc7-b1cf8b663648";
const addressId = "99bdb728-40a8-4575-ac91-31228449c349";

test("normalizes and sorts an exact mobile payment intent", () => {
  const intent = normalizeMobilePaymentIntent({
    addressId,
    checkoutKey,
    paymentMethod: "gcash",
    redemptionId: null,
    items: [
      { product_id: "sofa-b", quantity: 2 },
      { product_id: "chair-a", quantity: 1 },
    ],
  });
  assert.deepEqual(intent.items, [
    { product_id: "chair-a", quantity: 1 },
    { product_id: "sofa-b", quantity: 2 },
  ]);
});

test("the intent digest is stable for item order but changes with checkout details", async () => {
  const first = normalizeMobilePaymentIntent({
    addressId,
    checkoutKey,
    paymentMethod: "card",
    redemptionId: null,
    items: [{ product_id: "b", quantity: 1 }, { product_id: "a", quantity: 2 }],
  });
  const reordered = normalizeMobilePaymentIntent({
    addressId,
    checkoutKey,
    paymentMethod: "card",
    redemptionId: null,
    items: [{ product_id: "a", quantity: 2 }, { product_id: "b", quantity: 1 }],
  });
  const changed = normalizeMobilePaymentIntent({
    addressId,
    checkoutKey,
    paymentMethod: "gcash",
    redemptionId: null,
    items: [{ product_id: "a", quantity: 2 }, { product_id: "b", quantity: 1 }],
  });
  assert.equal(
    await mobilePaymentIntentDigest("customer", first),
    await mobilePaymentIntentDigest("customer", reordered),
  );
  assert.notEqual(
    await mobilePaymentIntentDigest("customer", first),
    await mobilePaymentIntentDigest("customer", changed),
  );
});

test("rejects malformed, duplicate, and excessive checkout items", () => {
  assert.throws(
    () =>
      normalizeMobilePaymentIntent({
        addressId,
        checkoutKey,
        paymentMethod: "cod",
        items: [{ product_id: "a", quantity: 1 }],
      }),
    /GCash or card/,
  );
  assert.throws(
    () =>
      normalizeMobilePaymentIntent({
        addressId,
        checkoutKey,
        paymentMethod: "card",
        items: [{ product_id: "a", quantity: 1 }, {
          product_id: "a",
          quantity: 1,
        }],
      }),
    /more than once/,
  );
  assert.throws(
    () =>
      normalizeMobilePaymentIntent({
        addressId,
        checkoutKey,
        paymentMethod: "card",
        items: [{ product_id: "a", quantity: 0 }],
      }),
    /quantities/,
  );
});

test("creates six digit codes without losing leading zero support", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(randomSixDigitCode(), /^\d{6}$/);
  }
});

test("binds a code digest to the challenge, user, and payment intent", async () => {
  const first = await paymentCodeDigest(
    "secret",
    "challenge-a",
    "user-a",
    "intent-a",
    "012345",
  );
  const same = await paymentCodeDigest(
    "secret",
    "challenge-a",
    "user-a",
    "intent-a",
    "012345",
  );
  const changed = await paymentCodeDigest(
    "secret",
    "challenge-a",
    "user-a",
    "intent-b",
    "012345",
  );
  assert.equal(first.length, 64);
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.equal(safeEqual(first, same), true);
  assert.equal(safeEqual(first, changed), false);
});

test("masks customer email addresses without exposing the full value", () => {
  const masked = maskEmail("alex.rivera@example.com");
  assert.equal(masked, "al••••••@e••••••.com");
  assert.equal(masked.includes("alex.rivera"), false);
  assert.equal(maskEmail("invalid"), "your verified email");
});
