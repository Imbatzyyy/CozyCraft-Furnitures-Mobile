export type MobileAssistantReplyBlock =
  | { type: "paragraph"; text: string }
  | { type: "directions"; items: string[] }

export type MobileAssistantDestination =
  | "home"
  | "shop"
  | "saved"
  | "bag"
  | "account"
  | "orders"
  | "addresses"
  | "payments"
  | "support"
  | "membership"
  | "notifications"
  | "about"
  | "contact"
  | "terms"
  | "privacy"

export type MobileAssistantNavigation = {
  destination: MobileAssistantDestination
  label: string
  icon: string
}

export type MobileAssistantGuidance = {
  reply: string
  navigation: MobileAssistantNavigation
}

export type MobileAssistantDataIntent =
  | "orders"
  | "tickets"
  | "wishlist"
  | "bag"
  | "returns"
  | "reviews"
  | "notifications"
  | "membership"
  | "addresses"
  | "payments"
  | "account"

export type MobileAssistantProductFact = {
  id: string
  name: string
  price: string
  stock?: number
  category?: string
}

export type MobileAssistantBagFact = {
  product: MobileAssistantProductFact
  quantity: number
  selected?: boolean
  reviewId?: string
}

export type MobileAssistantOrderFact = {
  id: string
  createdAt?: string
  total: number
  status: string
  paymentStatus?: string
  cancellationStatus?: string | null
  refundStatus?: string | null
  items: readonly MobileAssistantBagFact[]
}

export type MobileAssistantTicketFact = {
  ticket_number?: string | null
  subject?: string | null
  status?: string | null
  admin_reply?: string | null
  created_at?: string | null
}

export type MobileAssistantReturnFact = {
  return_number?: string | null
  reason?: string | null
  status?: string | null
  admin_note?: string | null
  created_at?: string | null
}

export type MobileAssistantAddressFact = {
  label?: string | null
  city?: string | null
  province?: string | null
  is_primary?: boolean | null
}

export type MobileAssistantNotificationFact = {
  title?: string | null
  kind?: string | null
  read_at?: string | null
  created_at?: string | null
}

export type MobileAssistantLoyaltyFact = {
  points_balance?: number | null
  tier?: string | null
}

export type MobileAssistantAccountContext = {
  authenticated: boolean
  ready?: boolean
  profileName?: string
  products: readonly MobileAssistantProductFact[]
  savedProductIds: readonly string[]
  bag: readonly MobileAssistantBagFact[]
  orders: readonly MobileAssistantOrderFact[]
  supportTickets?: readonly MobileAssistantTicketFact[]
  returnRequests?: readonly MobileAssistantReturnFact[]
  notifications?: readonly MobileAssistantNotificationFact[]
  loyalty?: MobileAssistantLoyaltyFact | null
  addresses?: readonly MobileAssistantAddressFact[]
  paymentPreference?: string
  unavailable?: readonly MobileAssistantDataIntent[]
}

export type MobileAssistantContextualReply = MobileAssistantGuidance & {
  liveAccountData: boolean
}

const navigationRequest = /\b(?:where|how (?:do|can|may|should)|guide me|show me|take me|bring me|navigate|open|find|which (?:page|screen|tab)|go to|access|see the)\b/i

const navigationDefinitions: Array<{
  destination: MobileAssistantDestination
  matches: RegExp
  label: string
  icon: string
  title: string
  purpose: string
  signedInOnly?: boolean
}> = [
  { destination: "orders", matches: /\b(?:my orders?|order history|track(?:ing)?\b[^.!?]{0,36}\b(?:order|package|delivery)|delivery status|cancel(?:lation)? (?:an? |my )?order|return (?:an? |my )?(?:order|product)|review (?:an? |my )?(?:order|purchase|product))\b/i, label: "Open My Orders", icon: "package_2", title: "My Orders", purpose: "See payment status, delivery progress, requests, and your complete order timeline.", signedInOnly: true },
  { destination: "support", matches: /\b(?:care\s*(?:and|&)\s*support|support (?:page|screen|tab|ticket)|(?:open|visit|view|check|tap|then) (?:the )?support|customer (?:care|support)|contact (?:support|the care team|staff)|start (?:a )?(?:support )?ticket|get help)\b/i, label: "Open Care & Support", icon: "support_agent", title: "Care & Support", purpose: "Find quick answers or send a private request to the care team.", signedInOnly: true },
  { destination: "addresses", matches: /\b(?:delivery|saved|shipping) address(?:es)?\b/i, label: "Open Delivery Addresses", icon: "location_on", title: "Delivery Addresses", purpose: "Add, edit, and choose the address used at checkout.", signedInOnly: true },
  { destination: "payments", matches: /\b(?:payment preferences?|preferred payment|default payment|payment settings?)\b/i, label: "Open Payment Preferences", icon: "payments", title: "Payment Preferences", purpose: "Choose the payment method shown first at checkout.", signedInOnly: true },
  { destination: "bag", matches: /\b(?:shopping bag|my bag|cart|checkout|place (?:my |an? )?order|pay with (?:gcash|card)|gcash checkout|card checkout)\b/i, label: "Open My Bag", icon: "shopping_bag", title: "Bag", purpose: "Review selected items, delivery fees, and checkout details." },
  { destination: "saved", matches: /\b(?:wishlist|wish list|saved (?:items?|pieces?|products?)|favorites?|favourites?)\b/i, label: "Open Saved Pieces", icon: "favorite", title: "Saved Pieces", purpose: "Return to furniture you saved for later.", signedInOnly: true },
  { destination: "membership", matches: /\b(?:home circle|membership|member tier|loyalty|reward points?|my points?)\b/i, label: "Open Home Circle", icon: "stars", title: "Home Circle", purpose: "See points, tier progress, activity, and available rewards.", signedInOnly: true },
  { destination: "notifications", matches: /\b(?:notifications?|order updates?)\b/i, label: "Open Notifications", icon: "notifications", title: "Notifications", purpose: "Review recent payment, order, and delivery updates.", signedInOnly: true },
  { destination: "account", matches: /\b(?:my account|profile (?:page|screen|tab)|edit (?:my )?profile|account settings?|sign[ -]?in|log[ -]?in|login|create (?:an? )?account|register|change (?:my )?(?:name|photo|phone|email)|phone verification|otp)\b/i, label: "Open My Profile", icon: "person", title: "My Profile", purpose: "Manage your profile and customer account tools.", signedInOnly: true },
  { destination: "privacy", matches: /\b(?:privacy|data policy)\b/i, label: "Open Privacy", icon: "privacy_tip", title: "Privacy", purpose: "Read how CozyCraft handles customer information." },
  { destination: "terms", matches: /\b(?:terms|conditions)\b/i, label: "Open Terms", icon: "gavel", title: "Terms", purpose: "Review the terms for using CozyCraft services." },
  { destination: "about", matches: /\b(?:about (?:cozycraft|us|page)|company story|founders?|vision ventures)\b/i, label: "Open About CozyCraft", icon: "info", title: "About CozyCraft", purpose: "Read the brand story and meet Vision Ventures." },
  { destination: "contact", matches: /\b(?:contact (?:page|details|information)|email address|phone number)\b/i, label: "Open Contact", icon: "contact_support", title: "Contact", purpose: "See CozyCraft customer-care contact information." },
  { destination: "shop", matches: /\b(?:shop|catalog|products? page|new arrivals?|living room|bedroom|dining room|browse (?:furniture|products?|pieces?))\b/i, label: "Browse Furniture", icon: "chair", title: "Shop", purpose: "Browse the live catalog by room and product type." },
  { destination: "home", matches: /\b(?:home page|homepage|main screen)\b/i, label: "Open Home", icon: "home", title: "Home", purpose: "Return to featured collections and recommendations." },
]

const privateDataPatterns: Array<{ intent: MobileAssistantDataIntent; matches: RegExp }> = [
  { intent: "orders", matches: /\b(?:orders?|tracking|shipment)\b/i },
  { intent: "tickets", matches: /\b(?:tickets?|support requests?|care conversations?)\b/i },
  { intent: "wishlist", matches: /\b(?:wishlist|wish list|saved (?:items?|pieces?|products?)|favorites?|favourites?)\b/i },
  { intent: "bag", matches: /\b(?:shopping bag|my bag|the bag|cart)\b/i },
  { intent: "returns", matches: /\b(?:return requests?|returns?(?: status)?)\b/i },
  { intent: "reviews", matches: /\b(?:my reviews?|reviewed (?:items?|pieces?|products?)|(?:items?|pieces?|products?) (?:to|i can|can i) review)\b/i },
  { intent: "notifications", matches: /\b(?:notifications?|unread updates?)\b/i },
  { intent: "membership", matches: /\b(?:home circle|membership|member tier|loyalty|reward points?|points balance|my points?)\b/i },
  { intent: "addresses", matches: /\b(?:my |saved |primary |delivery |shipping )?address(?:es)?\b/i },
  { intent: "payments", matches: /\b(?:payment preference|preferred payment|default payment)\b/i },
  { intent: "account", matches: /\b(?:which account|what account|signed in as|profile name)\b/i },
]

const privateDataQuestion = /\b(?:my|mine|i have|do i|have i|for me|signed in as|show me|latest order|current order|can i review|i can review|in my|on my|check my)\b/i
const directNavigationOnly = /\b(?:where|take me|bring me|navigate|go to|open|which (?:page|screen|tab)|how (?:do|can|may|should) i (?:open|find|reach|access))\b/i
const dataValueQuestion = /\b(?:what(?:'s| is| are)|which|how many|list|summari[sz]e|summary|latest|recent|current|status|pending|active|resolved|unread|balance|in my|on my|do i|have i|i have|show me my|check my)\b/i

/**
 * Identifies customer-account facts the mobile client can answer from its
 * already synchronized state. Pure route questions intentionally stay out of
 * this path so "Where is my wishlist?" remains concise navigation guidance.
 */
export function mobileAssistantDataIntentsFor(message: string): MobileAssistantDataIntent[] {
  const value = message.trim()
  if (!value) return []
  const nounOnly = /^(?:my\s+)?(?:orders?|tickets?|wishlist|wish list|saved items?|shopping bag|bag|cart|return requests?|returns?|reviews?|notifications?|home circle|membership|points|addresses?|payment preference)[?.!\s]*$/i.test(value)
  if (!nounOnly && !privateDataQuestion.test(value)) return []
  if (/\b(?:recommend|suggest|compare|match)\b/i.test(value)) return []
  if (directNavigationOnly.test(value) && !dataValueQuestion.test(value)) return []

  return privateDataPatterns
    .flatMap(({ intent, matches }) => {
      const match = value.match(matches)
      if (!match || typeof match.index !== "number") return []
      if (intent === "orders" && /\b(?:place|create|make)\s+(?:an?\s+|my\s+)?order\b/i.test(value)) return []
      if (intent === "orders" && /\b(?:cancel|change|modify|update|pay for|reorder|return)\s+(?:an?\s+|my\s+|the\s+)?order\b/i.test(value)) return []
      if (intent === "tickets" && /\b(?:create|start|submit|send)\s+(?:an?\s+|my\s+)?(?:support\s+)?(?:request|ticket)\b/i.test(value)) return []
      if (intent === "wishlist" && /\b(?:add|remove|delete|move)\b[^.!?]{0,40}\b(?:wishlist|wish list|saved items?)\b/i.test(value)) return []
      if (intent === "bag" && /\b(?:add|remove|delete|move|clear|checkout|check out|change|update)\b[^.!?]{0,40}\b(?:bag|cart|quantity)\b/i.test(value)) return []
      if (intent === "returns" && /\b(?:how|where)\b[^.!?]{0,36}\b(?:return|send back)\b/i.test(value)) return []
      if (intent === "reviews" && /\b(?:how|where)\b[^.!?]{0,36}\b(?:review|rate)\b/i.test(value)) return []
      if (intent === "addresses" && /\b(?:add|edit|change|remove|delete)\b[^.!?]{0,36}\baddress\b/i.test(value)) return []
      if (intent === "payments" && /\b(?:edit|change|set|update)\b[^.!?]{0,36}\bpayment\b/i.test(value)) return []
      return [{ intent, index: match.index }]
    })
    .sort((left, right) => left.index - right.index)
    .map(({ intent }) => intent)
    .filter((intent, index, intents) => intents.indexOf(intent) === index)
}

const navigationForDefinition = (
  definition: typeof navigationDefinitions[number],
  authenticated: boolean,
): MobileAssistantNavigation => {
  if (!authenticated && definition.destination === "account") {
    return { destination: "account", label: "Open customer sign-in", icon: "login" }
  }
  return definition.signedInOnly && !authenticated
    ? { destination: "account", label: `Sign in to open ${definition.title}`, icon: "login" }
    : { destination: definition.destination, label: definition.label, icon: definition.icon }
}

/**
 * Resolves only customer-visible destinations that the mobile app owns. The
 * assistant never receives permission to invent or execute a URL.
 */
export function mobileAssistantNavigationFor(
  message: string,
  authenticated: boolean,
): MobileAssistantNavigation | null {
  const definition = navigationDefinitions.find((item) => item.matches.test(message))
  if (!definition) return null
  return navigationForDefinition(definition, authenticated)
}

/** Uses only an explicit next-action sentence from an assistant reply. */
export function mobileAssistantNavigationFromReply(
  reply: string,
  authenticated: boolean,
): MobileAssistantNavigation | null {
  const actionSentences = reply.match(/\b(?:open|go to|visit|view|check|tap)\b[^.!?\n]{0,120}/gi) || []
  for (const sentence of actionSentences) {
    const definition = navigationDefinitions.find((item) => item.matches.test(sentence))
    if (definition) return navigationForDefinition(definition, authenticated)
  }
  return null
}

/**
 * Navigation questions use deterministic app knowledge instead of spending an
 * AI request on a route the client already knows exactly. Other questions keep
 * using the live assistant and database context.
 */
export function mobileAssistantGuidanceFor(
  message: string,
  authenticated: boolean,
): MobileAssistantGuidance | null {
  if (mobileAssistantDataIntentsFor(message).length) return null
  if (!navigationRequest.test(message)) return null
  const navigation = mobileAssistantNavigationFor(message, authenticated)
  if (!navigation) return null

  if (!authenticated && navigation.destination === "account") {
    const requestedDefinition = navigationDefinitions.find((item) => item.matches.test(message))
    const steps = [
      `Tap ${navigation.label} below.`,
      "Sign in with your CozyCraft customer account.",
      ...(requestedDefinition?.destination !== "account"
        ? [`Open ${requestedDefinition?.title || "the requested section"} from My Profile.`]
        : []),
    ]
    return {
      reply: `Sign-in is required to view this private account section.\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
      navigation,
    }
  }

  const definition = navigationDefinitions.find((item) => item.destination === navigation.destination)
  const title = definition?.title || navigation.label.replace(/^Open\s+/i, "")
  const reply = `${title}: ${definition?.purpose || "Open the correct app section directly."}\n1. Tap ${navigation.label} below.`

  return { reply, navigation }
}

const dataIntentDestination: Record<MobileAssistantDataIntent, MobileAssistantDestination> = {
  orders: "orders",
  tickets: "support",
  wishlist: "saved",
  bag: "bag",
  returns: "orders",
  reviews: "orders",
  notifications: "notifications",
  membership: "membership",
  addresses: "addresses",
  payments: "payments",
  account: "account",
}

const dataIntentName: Record<MobileAssistantDataIntent, string> = {
  orders: "orders",
  tickets: "support requests",
  wishlist: "wishlist",
  bag: "shopping bag",
  returns: "return requests",
  reviews: "product reviews",
  notifications: "notifications",
  membership: "Home Circle membership",
  addresses: "delivery addresses",
  payments: "payment preference",
  account: "profile",
}

const cleanFact = (value: unknown, maximum = 90) => String(value ?? "")
  .replace(/[\r\n\t]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maximum)

const readableFact = (value: unknown, fallback = "not available") => {
  const clean = cleanFact(value).replace(/[_-]+/g, " ").toLocaleLowerCase("en-PH")
  return clean ? `${clean.charAt(0).toLocaleUpperCase("en-PH")}${clean.slice(1)}` : fallback
}

const moneyNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]+/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
}).format(moneyNumber(value))

const plural = (count: number, singular: string, pluralValue = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralValue}`

const productAvailability = (product: MobileAssistantProductFact) => {
  if (typeof product.stock !== "number") return ""
  if (product.stock <= 0) return " · Out of stock"
  if (product.stock <= 5) return ` · ${product.stock} left`
  return " · In stock"
}

const productLine = (product: MobileAssistantProductFact, quantity?: number) =>
  `${cleanFact(product.name, 80)}${quantity ? ` × ${Math.max(1, Math.round(quantity))}` : ""} — ${cleanFact(product.price, 30)}${productAvailability(product)}`

const navigationForDataIntent = (
  intent: MobileAssistantDataIntent,
  authenticated: boolean,
) => {
  const destination = dataIntentDestination[intent]
  const definition = navigationDefinitions.find((item) => item.destination === destination)
  if (definition) return navigationForDefinition(definition, authenticated)
  return { destination, label: "Open CozyCraft", icon: "arrow_forward" } satisfies MobileAssistantNavigation
}

const unavailableDataReply = (intent: MobileAssistantDataIntent) =>
  `I couldn’t safely refresh your ${dataIntentName[intent]} just now, so I won’t guess. You can still open the section below and try again.`

function orderReply(message: string, context: MobileAssistantAccountContext) {
  const orders = [...context.orders]
  const requestedStatus = ["processing", "packed", "shipped", "delivered", "cancelled", "canceled"]
    .find((status) => new RegExp(`\\b${status}\\b`, "i").test(message))
  const normalizedStatus = requestedStatus === "canceled" ? "cancelled" : requestedStatus
  const matching = normalizedStatus
    ? orders.filter((order) => cleanFact(order.status).toLocaleLowerCase("en-PH").replace("canceled", "cancelled") === normalizedStatus)
    : orders
  if (normalizedStatus && !matching.length) {
    return `You don’t currently have any ${normalizedStatus} orders. Your account has ${plural(orders.length, "order")} in total.`
  }
  if (!matching.length) return "Your CozyCraft account does not have any orders yet."

  const visible = matching.slice(0, 3)
  const lines = visible.map((order) => {
    const payment = order.paymentStatus ? ` · Payment: ${readableFact(order.paymentStatus)}` : ""
    const cancellation = order.cancellationStatus ? ` · Cancellation: ${readableFact(order.cancellationStatus)}` : ""
    const refund = order.refundStatus ? ` · Refund: ${readableFact(order.refundStatus)}` : ""
    return `Order ${cleanFact(order.id, 50)} — ${readableFact(order.status)} · ${money(order.total)}${payment}${cancellation}${refund}`
  })
  const more = matching.length > visible.length ? `\nPlus ${plural(matching.length - visible.length, "more order")}.` : ""
  const wantsItems = /\b(?:items?|products?|pieces?|what (?:did|have) i order|what(?:'s| is) in)\b/i.test(message)
  const itemOrder = visible[0]
  const items = wantsItems && itemOrder?.items.length
    ? `\n\nItems in ${cleanFact(itemOrder.id, 50)}:\n${itemOrder.items.slice(0, 5).map((line) => productLine(line.product, line.quantity)).join("\n")}${itemOrder.items.length > 5 ? `\nPlus ${plural(itemOrder.items.length - 5, "more product")}.` : ""}`
    : ""
  return `${normalizedStatus ? `You have ${plural(matching.length, `${normalizedStatus} order`)}.` : `I found ${plural(orders.length, "order")} on your account.`}\n${lines.join("\n")}${more}${items}`
}

function bagReply(context: MobileAssistantAccountContext) {
  if (!context.bag.length) return "Your shopping bag is currently empty."
  const itemCount = context.bag.reduce((total, line) => total + Math.max(1, Number(line.quantity) || 1), 0)
  const selectedCount = context.bag.filter((line) => line.selected !== false).length
  const subtotal = context.bag
    .filter((line) => line.selected !== false)
    .reduce((total, line) => total + moneyNumber(line.product.price) * Math.max(1, Number(line.quantity) || 1), 0)
  const visible = context.bag.slice(0, 5)
  return `Your bag has ${plural(context.bag.length, "product")} and ${plural(itemCount, "item")} in total. ${plural(selectedCount, "product")} ${selectedCount === 1 ? "is" : "are"} selected for checkout.\n${visible.map((line) => productLine(line.product, line.quantity)).join("\n")}${context.bag.length > visible.length ? `\nPlus ${plural(context.bag.length - visible.length, "more product")}.` : ""}\n\nSelected merchandise subtotal: ${money(subtotal)}. Delivery fees and rewards are calculated separately at checkout.`
}

function wishlistReply(context: MobileAssistantAccountContext) {
  if (!context.savedProductIds.length) return "Your wishlist is currently empty."
  const saved = context.savedProductIds
    .map((id) => context.products.find((product) => product.id === id))
    .filter((product): product is MobileAssistantProductFact => Boolean(product))
  const visible = saved.slice(0, 5)
  return `Your wishlist has ${plural(context.savedProductIds.length, "saved piece")} right now.${visible.length ? `\n${visible.map((product) => productLine(product)).join("\n")}` : ""}${context.savedProductIds.length > visible.length ? `\nPlus ${plural(context.savedProductIds.length - visible.length, "more saved piece")}.` : ""}`
}

function ticketReply(context: MobileAssistantAccountContext) {
  if (!context.supportTickets) return unavailableDataReply("tickets")
  if (!context.supportTickets.length) return "You don’t have any support requests yet."
  const active = context.supportTickets.filter((ticket) => !/^(?:resolved|closed)$/i.test(cleanFact(ticket.status)))
  const visible = context.supportTickets.slice(0, 3)
  const lines = visible.map((ticket) => {
    const number = cleanFact(ticket.ticket_number, 40) || "Support request"
    const subject = cleanFact(ticket.subject, 90) || "Customer-care concern"
    const replyState = cleanFact(ticket.admin_reply) ? "Care reply received" : "Awaiting Care reply"
    return `${number} — ${subject} · ${readableFact(ticket.status, "Open")} · ${replyState}`
  })
  return `You have ${plural(context.supportTickets.length, "support request")}, with ${plural(active.length, "active request")}.\n${lines.join("\n")}${context.supportTickets.length > visible.length ? `\nPlus ${plural(context.supportTickets.length - visible.length, "older request")}.` : ""}`
}

function returnReply(context: MobileAssistantAccountContext) {
  if (!context.returnRequests) return unavailableDataReply("returns")
  if (!context.returnRequests.length) return "You don’t have any return requests right now."
  const visible = context.returnRequests.slice(0, 3)
  const lines = visible.map((request) =>
    `${cleanFact(request.return_number, 40) || "Return request"} — ${cleanFact(request.reason, 90) || "Reason recorded"} · ${readableFact(request.status, "Pending")}`)
  return `You have ${plural(context.returnRequests.length, "return request")}.\n${lines.join("\n")}${context.returnRequests.length > visible.length ? `\nPlus ${plural(context.returnRequests.length - visible.length, "older request")}.` : ""}`
}

function reviewReply(context: MobileAssistantAccountContext) {
  const allItems = context.orders.flatMap((order) => order.items.map((item) => ({ order, item })))
  const reviewed = allItems.filter(({ item }) => Boolean(item.reviewId))
  const available = allItems.filter(({ order, item }) => order.status === "Delivered" && !item.reviewId)
  return `You have reviewed ${plural(reviewed.length, "purchased product")}. ${plural(available.length, "delivered product")} ${available.length === 1 ? "is" : "are"} currently available for a review.${available.length ? `\nReady to review: ${available.slice(0, 4).map(({ item }) => cleanFact(item.product.name, 70)).join(", ")}.` : ""}`
}

function notificationReply(context: MobileAssistantAccountContext) {
  const notifications = context.notifications || []
  if (!notifications.length) return "You don’t have any customer notifications right now."
  const unread = notifications.filter((notification) => !notification.read_at)
  const visible = notifications.slice(0, 3)
  return `You have ${plural(unread.length, "unread notification")} and ${plural(notifications.length, "notification")} in total.\n${visible.map((notification) => `${cleanFact(notification.title, 100) || "CozyCraft update"} · ${notification.read_at ? "Read" : "Unread"}`).join("\n")}`
}

function membershipReply(context: MobileAssistantAccountContext) {
  if (!context.loyalty) return unavailableDataReply("membership")
  const points = Math.max(0, Number(context.loyalty.points_balance) || 0)
  const tier = readableFact(context.loyalty.tier, "Member")
  return `Your Home Circle balance is ${plural(points, "point")}, and your current tier is ${tier}.`
}

function addressReply(context: MobileAssistantAccountContext) {
  if (!context.addresses) return unavailableDataReply("addresses")
  if (!context.addresses.length) return "You don’t have a saved delivery address yet."
  const primary = context.addresses.find((address) => address.is_primary) || context.addresses[0]
  const area = [cleanFact(primary.city, 60), cleanFact(primary.province, 60)].filter(Boolean).join(", ")
  return `You have ${plural(context.addresses.length, "saved delivery address")}. Your primary address is labeled ${cleanFact(primary.label, 50) || "Primary"}${area ? ` and is in ${area}` : ""}. For privacy, I won’t repeat the complete street address in chat.`
}

function paymentReply(context: MobileAssistantAccountContext) {
  if (!context.paymentPreference) return unavailableDataReply("payments")
  const method = ({ cod: "Cash on Delivery", card: "card", gcash: "GCash" } as Record<string, string>)[context.paymentPreference.toLocaleLowerCase("en-PH")]
    || readableFact(context.paymentPreference)
  return `Your preferred checkout payment method is ${method}. No card or wallet details are displayed in chat.`
}

/**
 * Builds concise, deterministic answers for private customer facts. Database
 * values are rendered as plain facts and never passed back as instructions.
 */
export function buildMobileAssistantAccountReply(
  message: string,
  context: MobileAssistantAccountContext,
): MobileAssistantContextualReply | null {
  const intents = mobileAssistantDataIntentsFor(message)
  if (!intents.length) return null
  const primaryIntent = intents[0]
  const navigation = navigationForDataIntent(primaryIntent, context.authenticated)
  if (!context.authenticated) {
    return {
      reply: `Sign in to let CozyCraft Care check your own ${dataIntentName[primaryIntent]}. I never show another customer’s information.`,
      navigation,
      liveAccountData: false,
    }
  }
  if (context.ready === false) {
    return {
      reply: `Your CozyCraft account is still synchronizing, so I won’t show cached ${dataIntentName[primaryIntent]} that may belong to an earlier session. Please try again in a moment.`,
      navigation,
      liveAccountData: false,
    }
  }

  const unavailable = new Set(context.unavailable || [])
  const replies = intents.map((intent) => {
    if (unavailable.has(intent)) return unavailableDataReply(intent)
    if (intent === "orders") return orderReply(message, context)
    if (intent === "tickets") return ticketReply(context)
    if (intent === "wishlist") return wishlistReply(context)
    if (intent === "bag") return bagReply(context)
    if (intent === "returns") return returnReply(context)
    if (intent === "reviews") return reviewReply(context)
    if (intent === "notifications") return notificationReply(context)
    if (intent === "membership") return membershipReply(context)
    if (intent === "addresses") return addressReply(context)
    if (intent === "payments") return paymentReply(context)
    return `You’re signed in as ${cleanFact(context.profileName, 80) || "a CozyCraft customer"}.`
  })

  return {
    reply: replies.join("\n\n"),
    navigation,
    liveAccountData: true,
  }
}

const numberedInstruction = /^(?:(?:step\s*)?\d{1,2}[.)]|[-•])\s+(.+)$/i
const directionSignal = /\b(?:go to|head to|navigate to|visit|tap|choose|select|click|open (?:the |your |my )?(?:account|profile|orders?|bag|cart|wishlist|support|payment|delivery|product|settings|app|page))\b/i
const directionContinuation = /^(?:first|next|then|after that|from there|once there|finally),?\s+/i

function cleanInstruction(value: string) {
  const withoutInternalRoutes = value
    // Internal web routes are implementation details, not customer directions.
    .replace(/\s*\([^)]*(?:#?\/|[?&][a-z0-9_-]+=)[^)]*\)/gi, "")
    .replace(/\s*(?:[-–—,:]\s*)?(?:(?:or\s+)?(?:go|navigate)\s+to|that(?:'s| is)|that’s|via|using)?\s*`?#?\/[a-z0-9][a-z0-9_./?=&%-]*`?/gi, "")

  const directInstruction = withoutInternalRoutes
    .replace(/^[-•]\s*/, "")
    .replace(/[`*_]/g, "")
    .replace(/\s*[=\\/]\s*/g, " ")
    .replace(/\(([^)]+)\)/g, ", $1")
    .replace(/\s*(?:→|>)\s*/g, ", then ")
    .replace(/^click\b/i, "Tap")
    .replace(/^select\b/i, "Tap")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s*[-–—,:]+\s*([.!?])$/, "$1")
    .trim()

  if (!directInstruction) return ""
  return /[.!?]$/.test(directInstruction) ? directInstruction : `${directInstruction}.`
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function paragraphBlocks(value: string): MobileAssistantReplyBlock[] {
  const customerText = value
    .replace(/\s*\([^)]*`?#?\/(?:login|sign-in|create-account|account|profile|cart|bag|wishlist|orders?|checkout|products?|home|shop|about|contact|terms|privacy(?:-policy)?)[a-z0-9_./?=&%-]*`?[^)]*\)/gi, "")
    .replace(/`?#?\/(?:login|sign-in|create-account|account|profile|cart|bag|wishlist|orders?|checkout|products?|home|shop|about|contact|terms|privacy(?:-policy)?)[a-z0-9_./?=&%-]*`?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/:\s*([.!?]|$)/g, "$1")
    .trim()
  const sentences = splitSentences(customerText)
  const firstDirection = sentences.findIndex((sentence) =>
    directionSignal.test(sentence) || directionContinuation.test(sentence),
  )
  if (firstDirection < 0) return customerText ? [{ type: "paragraph", text: customerText }] : []

  const before = sentences.slice(0, firstDirection).join(" ").trim()
  const directions: string[] = []
  let afterIndex = firstDirection
  for (; afterIndex < sentences.length; afterIndex += 1) {
    const sentence = sentences[afterIndex]
    if (
      afterIndex > firstDirection &&
      !directionSignal.test(sentence) &&
      !directionContinuation.test(sentence)
    ) break
    const instruction = cleanInstruction(sentence.replace(directionContinuation, ""))
    if (instruction) directions.push(instruction)
  }
  const after = sentences.slice(afterIndex).join(" ").trim()

  return [
    ...(before ? [{ type: "paragraph" as const, text: before }] : []),
    ...(directions.length ? [{ type: "directions" as const, items: directions }] : []),
    ...(after ? [{ type: "paragraph" as const, text: after }] : []),
  ]
}

export function formatMobileAssistantReply(content: string): MobileAssistantReplyBlock[] {
  const normalized = content
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+(?=(?:(?:step\s*)?\d{1,2}[.)]|[-•])\s+)/gi, "\n")
    .trim()
  if (!normalized) return []

  const blocks: MobileAssistantReplyBlock[] = []
  let pendingDirections: string[] = []
  const flushDirections = () => {
    if (!pendingDirections.length) return
    blocks.push({ type: "directions", items: pendingDirections })
    pendingDirections = []
  }

  normalized.split(/\n+/).forEach((line) => {
    const cleanLine = line.trim()
    if (!cleanLine) return
    const instruction = cleanLine.match(numberedInstruction)
    if (instruction) {
      const customerInstruction = cleanInstruction(instruction[1])
      if (customerInstruction) pendingDirections.push(customerInstruction)
      return
    }
    flushDirections()
    blocks.push(...paragraphBlocks(cleanLine))
  })
  flushDirections()

  return blocks
}

export function mobileAssistantResponseKind(
  content: string,
): "general" | "directions" | "order" | "product" {
  if (formatMobileAssistantReply(content).some((block) => block.type === "directions")) return "directions"
  if (/\b(order|track|delivery|payment|refund|return|cancel)\b/i.test(content)) return "order"
  if (/\b(product|piece|sofa|chair|table|bed|cabinet|stock|price)\b/i.test(content)) return "product"
  return "general"
}
