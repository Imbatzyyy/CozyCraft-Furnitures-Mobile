import { describe, expect, it } from "vitest"
import {
  buildMobileAssistantAccountReply,
  formatMobileAssistantReply,
  mobileAssistantDataIntentsFor,
  mobileAssistantGuidanceFor,
  mobileAssistantNavigationFromReply,
  mobileAssistantNavigationFor,
  mobileAssistantResponseKind,
  type MobileAssistantAccountContext,
} from "./mobile-chat"

const products = [
  { id: "sofa-1", name: "EKOLSUND", category: "Living room", price: "₱12,999", stock: 4 },
  { id: "chair-1", name: "ODGER", category: "Dining room", price: "₱6,500", stock: 12 },
]

const signedInContext: MobileAssistantAccountContext = {
  authenticated: true,
  ready: true,
  profileName: "Joy",
  products,
  savedProductIds: ["sofa-1"],
  bag: [{ product: products[1], quantity: 2, selected: true }],
  orders: [{
    id: "#CC-01041",
    createdAt: "2026-09-04T08:00:00.000Z",
    total: 19_499,
    status: "Shipped",
    paymentStatus: "paid",
    items: [{ product: products[0], quantity: 1, selected: true }],
  }],
  notifications: [{ title: "Your order is on the way", read_at: null }],
  loyalty: { points_balance: 260, tier: "plus" },
}

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

  it("removes internal web paths even when a generated reply leaves them in prose", () => {
    expect(formatMobileAssistantReply(
      "You can sign in at our login page: `/login`. If you need help, let me know.",
    )).toEqual([
      { type: "paragraph", text: "You can sign in at our login page. If you need help, let me know." },
    ])
    expect(formatMobileAssistantReply("The shelf is 12 1/2 inches deep.")).toEqual([
      { type: "paragraph", text: "The shelf is 12 1/2 inches deep." },
    ])
  })

  it("classifies structured guidance without retaining message content", () => {
    expect(mobileAssistantResponseKind("1. Open Account. 2. Tap My Orders.")).toBe("directions")
    expect(mobileAssistantResponseKind("Your order is being prepared.")).toBe("order")
    expect(mobileAssistantResponseKind("The sofa is currently in stock.")).toBe("product")
    expect(mobileAssistantResponseKind("Welcome back.")).toBe("general")
  })

  it("resolves a support-page request to the actual mobile support section", () => {
    expect(mobileAssistantGuidanceFor("Guide me where to see support page", true)).toEqual({
      reply: "Care & Support: Find quick answers or send a private request to the care team.\n1. Tap Open Care & Support below.",
      navigation: {
        destination: "support",
        label: "Open Care & Support",
        icon: "support_agent",
      },
    })
  })

  it("does not show an orders action for unrelated ongoing conversation", () => {
    expect(mobileAssistantNavigationFor("Thank you, can you explain that more simply?", true)).toBeNull()
    expect(mobileAssistantNavigationFor("Where can I contact customer support?", true)?.destination).toBe("support")
  })

  it("uses orders only for an explicit tracking or order-history request", () => {
    expect(mobileAssistantNavigationFor("Track my latest order", true)).toMatchObject({
      destination: "orders",
      label: "Open My Orders",
    })
    expect(mobileAssistantNavigationFor("Explain delivery options", true)).toBeNull()
  })

  it("routes signed-out customers through account access for protected screens", () => {
    expect(mobileAssistantGuidanceFor("Show me where the support page is", false)?.navigation).toEqual({
      destination: "account",
      label: "Sign in to open Care & Support",
      icon: "login",
    })
    expect(mobileAssistantGuidanceFor("Where can I sign in?", false)?.navigation).toEqual({
      destination: "account",
      label: "Open customer sign-in",
      icon: "login",
    })
  })

  it("covers the key mobile shopping and account destinations with safe actions", () => {
    expect(mobileAssistantNavigationFor("Where is my wishlist?", true)?.destination).toBe("saved")
    expect(mobileAssistantNavigationFor("How can I open my delivery addresses?", true)?.destination).toBe("addresses")
    expect(mobileAssistantNavigationFor("Take me to payment preferences", true)?.destination).toBe("payments")
    expect(mobileAssistantNavigationFor("Where can I view Home Circle points?", true)?.destination).toBe("membership")
    expect(mobileAssistantNavigationFor("Show me the privacy policy", true)?.destination).toBe("privacy")
    expect(mobileAssistantNavigationFor("Where can I browse furniture?", true)?.destination).toBe("shop")
  })

  it("separates private-data questions from pure navigation and action requests", () => {
    expect(mobileAssistantDataIntentsFor("Summarize my latest order")).toEqual(["orders"])
    expect(mobileAssistantDataIntentsFor("What’s in my wishlist and my bag?")).toEqual(["wishlist", "bag"])
    expect(mobileAssistantDataIntentsFor("Where is my wishlist?")).toEqual([])
    expect(mobileAssistantDataIntentsFor("Cancel my order")).toEqual([])
    expect(mobileAssistantDataIntentsFor("Remove this item from my bag")).toEqual([])
    expect(mobileAssistantDataIntentsFor("Which sofas are in stock?")).toEqual([])
    expect(mobileAssistantDataIntentsFor("What are the possible order statuses?")).toEqual([])
    expect(mobileAssistantDataIntentsFor("Recommend a sofa based on my wishlist")).toEqual([])
  })

  it("never reads account facts for a signed-out customer", () => {
    const result = buildMobileAssistantAccountReply("Show me my orders", {
      ...signedInContext,
      authenticated: false,
    })

    expect(result).toMatchObject({
      liveAccountData: false,
      navigation: { destination: "account" },
    })
    expect(result?.reply).toContain("Sign in")
    expect(result?.reply).not.toContain("#CC-01041")
  })

  it("refuses stale cached records while the current account is synchronizing", () => {
    const result = buildMobileAssistantAccountReply("What’s in my bag?", {
      ...signedInContext,
      ready: false,
    })

    expect(result?.liveAccountData).toBe(false)
    expect(result?.reply).toContain("still synchronizing")
    expect(result?.reply).not.toContain("ODGER")
  })

  it("summarizes current orders and links to the matching mobile section", () => {
    const result = buildMobileAssistantAccountReply("Track my latest order and show its items", signedInContext)

    expect(result).toMatchObject({
      liveAccountData: true,
      navigation: { destination: "orders", label: "Open My Orders" },
    })
    expect(result?.reply).toContain("#CC-01041")
    expect(result?.reply).toContain("Shipped")
    expect(result?.reply).toContain("Payment: Paid")
    expect(result?.reply).toContain("EKOLSUND")
  })

  it("uses only the signed-in wishlist and bag snapshots", () => {
    const wishlist = buildMobileAssistantAccountReply("What’s in my wishlist?", signedInContext)
    const bag = buildMobileAssistantAccountReply("What’s in my bag?", signedInContext)

    expect(wishlist?.reply).toContain("EKOLSUND")
    expect(wishlist?.reply).not.toContain("ODGER")
    expect(wishlist?.navigation.destination).toBe("saved")
    expect(bag?.reply).toContain("ODGER × 2")
    expect(bag?.reply).toContain("₱13,000")
    expect(bag?.navigation.destination).toBe("bag")
  })

  it("reports support status without repeating private staff message content", () => {
    const result = buildMobileAssistantAccountReply("Check my support tickets", {
      ...signedInContext,
      supportTickets: [{
        ticket_number: "CARE-204",
        subject: "Delivery timing",
        status: "open",
        admin_reply: "Internal message that must stay out of the summary",
      }],
    })

    expect(result?.reply).toContain("CARE-204")
    expect(result?.reply).toContain("Care reply received")
    expect(result?.reply).not.toContain("Internal message")
    expect(result?.navigation.destination).toBe("support")
  })

  it("keeps complete delivery addresses and payment details out of chat", () => {
    const addressWithStreet = {
      label: "Home",
      city: "Quezon City",
      province: "Metro Manila",
      is_primary: true,
      address_line: "1305 E. Rodriguez Sr. Avenue",
    }
    const address = buildMobileAssistantAccountReply("What is my primary address?", {
      ...signedInContext,
      addresses: [addressWithStreet],
    })
    const payment = buildMobileAssistantAccountReply("What is my payment preference?", {
      ...signedInContext,
      paymentPreference: "gcash",
    })

    expect(address?.reply).toContain("Home")
    expect(address?.reply).toContain("Quezon City, Metro Manila")
    expect(address?.reply).not.toContain("1305 E. Rodriguez")
    expect(payment?.reply).toBe("Your preferred checkout payment method is GCash. No card or wallet details are displayed in chat.")
  })

  it("summarizes reviews, unread notifications, and membership on demand", () => {
    const reviews = buildMobileAssistantAccountReply("Which products can I review?", {
      ...signedInContext,
      orders: [{ ...signedInContext.orders[0], status: "Delivered" }],
    })
    const notifications = buildMobileAssistantAccountReply("How many unread notifications do I have?", signedInContext)
    const membership = buildMobileAssistantAccountReply("What’s my Home Circle points balance?", signedInContext)

    expect(reviews?.reply).toContain("Ready to review: EKOLSUND")
    expect(notifications?.reply).toContain("1 unread notification")
    expect(membership?.reply).toContain("260 points")
    expect(membership?.reply).toContain("Plus")
  })

  it("handles unavailable on-demand data without guessing", () => {
    const result = buildMobileAssistantAccountReply("Show me my return requests", {
      ...signedInContext,
      unavailable: ["returns"],
    })

    expect(result?.reply).toContain("won’t guess")
    expect(result?.navigation.destination).toBe("orders")
  })

  it("derives a navigation button only from an explicit next action in generated replies", () => {
    expect(mobileAssistantNavigationFromReply(
      "For private help, open My Account, then Support and start a request.",
      true,
    )).toMatchObject({ destination: "support", label: "Open Care & Support" })
    expect(mobileAssistantNavigationFromReply(
      "Your sofa is available and delivery is calculated at checkout.",
      true,
    )).toBeNull()
  })
})
