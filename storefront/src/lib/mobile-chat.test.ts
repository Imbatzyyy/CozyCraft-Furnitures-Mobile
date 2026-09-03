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
      { type: "directions", items: ["Go to Account and open My Orders.", "Tap the delivered order."] },
      { type: "paragraph", text: "The receipt button is beside its details." },
    ])
  })

  it("removes internal routes and technical punctuation from customer directions", () => {
    const blocks = formatMobileAssistantReply(
      "1. Click the Profile icon (or go to `/profile`). 2. Select the Support tab — that’s `/profile?tab=support`.",
    )

    expect(blocks).toEqual([
      { type: "directions", items: ["Tap the Profile icon.", "Tap the Support tab."] },
    ])
    const directions = blocks.flatMap((block) => block.type === "directions" ? block.items : [])
    expect(directions.join(" ")).not.toMatch(/[=()/\\`]/)
  })

  it("rewrites breadcrumb arrows as direct next actions", () => {
    expect(formatMobileAssistantReply("1. Open My Account → Orders."))
      .toEqual([{ type: "directions", items: ["Open My Account, then Orders."] }])
  })

  it("keeps email addresses intact beside separated directions", () => {
    expect(formatMobileAssistantReply(
      "I’m here to help. Go to My Account, then Support. You may also email care@example.com.",
    )).toEqual([
      { type: "paragraph", text: "I’m here to help." },
      { type: "directions", items: ["Go to My Account, then Support."] },
      { type: "paragraph", text: "You may also email care@example.com." },
    ])
  })

  it("classifies structured guidance without retaining message content", () => {
    expect(mobileAssistantResponseKind("1. Open Account. 2. Tap My Orders.")).toBe("directions")
    expect(mobileAssistantResponseKind("Your order is being prepared.")).toBe("order")
    expect(mobileAssistantResponseKind("The sofa is currently in stock.")).toBe("product")
    expect(mobileAssistantResponseKind("Welcome back.")).toBe("general")
  })
})
