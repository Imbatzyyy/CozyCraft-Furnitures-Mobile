import { describe, expect, it } from "vitest";
import { effectiveCodLimit, paymentUnavailableReason as reason } from "./payment-policy";
describe("final payable payment limits", () => {
  it.each([[19999.99, true], [20000, true], [20000.01, false]])("COD %s eligible %s", (total, eligible) => expect(!reason("cod", total, {})).toBe(eligible));
  it.each([[100000, true], [100000.01, false]])("GCash %s eligible %s", (total, eligible) => expect(!reason("gcash", total, {})).toBe(eligible));
  it("includes delivery and subtracts a valid voucher before testing", () => {
    expect(reason("cod", 19850 + 650, {})).not.toBe("");
    expect(reason("cod", 19850 + 650 - 500, {})).toBe("");
  });
  it("caps even old unlimited or inflated settings", () => {
    for (const value of [0, -1, undefined, NaN, 90000]) expect(effectiveCodLimit(value)).toBe(20000);
    expect(effectiveCodLimit(10000)).toBe(10000);
  });
  it("includes outstanding COD but never applies exposure to online methods", () => {
    expect(reason("cod", 10000, {}, 10000)).toBe("");
    expect(reason("cod", 10000.01, {}, 10000)).toContain("unpaid COD");
    expect(reason("gcash", 10000, {}, 999999)).toBe("");
  });
  it("honors lower server and admin limits and disabled methods", () => {
    expect(reason("cod", 10001, {}, 0, 10000)).not.toBe("");
    expect(reason("cod", 10001, {cod_maximum_order:10000})).not.toBe("");
    for (const method of ["cod","card","gcash"]) expect(reason(method, 100, {[method+"_enabled"]:false})).toContain("Temporarily unavailable");
  });
  it("rejects invalid totals/methods and the exclusive card cap", () => {
    expect(reason("card", 9999999.99, {})).toBe("");
    expect(reason("card", 10000000, {})).not.toBe("");
    for (const total of [NaN, Infinity, -1, 0]) expect(reason("card", total, {})).not.toBe("");
    expect(reason("unknown", 100, {})).not.toBe("");
  });
});
