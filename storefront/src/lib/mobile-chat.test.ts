import { describe, expect, it } from "vitest"
import { formatMobileAssistantReply, mobileAssistantResponseKind } from "./mobile-chat"

describe("mobile assistant reply formatting", () => {
  it("separates numbered directions from the surrounding answer", () => {
    expect(formatMobileAssistantReply(
      "You can check it in the app. 1. Open Account. 2. Tap My Orders. Your latest status appears there.",
    )).toEqual([
      { type: "paragraph", text: "You can check it in the app." },
      { type: "directions", items: ["Open Account.", "Tap My Orders. Your latest status appears there."] },
    ])
  })

  it("turns natural navigation sentences into a spaced direction block", () => {
    expect(formatMobileAssistantReply(
      "Your receipt is available after confirmation. Go to Account and open My Orders. Then select the delivered order. The receipt button is beside its details.",
    )).toEqual([
      { type: "paragraph", text: "Your receipt is available after confirmation." },
      { type: "directions", items: ["Go to Account and open My Orders.", "select the delivered order."] },
      { type: "paragraph", text: "The receipt button is beside its details." },
    ])
  })

  it("classifies structured guidance without retaining message content", () => {
    expect(mobileAssistantResponseKind("1. Open Account. 2. Tap My Orders.")).toBe("directions")
    expect(mobileAssistantResponseKind("Your order is being prepared.")).toBe("order")
    expect(mobileAssistantResponseKind("The sofa is currently in stock.")).toBe("product")
    expect(mobileAssistantResponseKind("Welcome back.")).toBe("general")
  })
})
