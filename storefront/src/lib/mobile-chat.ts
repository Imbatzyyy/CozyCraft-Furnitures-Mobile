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
  { destination: "support", matches: /\b(?:care\s*(?:and|&)\s*support|support (?:page|screen|tab|ticket)|customer (?:care|support)|contact (?:support|the care team|staff)|start (?:a )?(?:support )?ticket|get help)\b/i, label: "Open Care & Support", icon: "support_agent", title: "Care & Support", purpose: "Find quick answers or send a private request to the care team.", signedInOnly: true },
  { destination: "addresses", matches: /\b(?:delivery|saved|shipping) address(?:es)?\b/i, label: "Open Delivery Addresses", icon: "location_on", title: "Delivery Addresses", purpose: "Add, edit, and choose the address used at checkout.", signedInOnly: true },
  { destination: "payments", matches: /\b(?:payment preferences?|preferred payment|default payment|payment settings?)\b/i, label: "Open Payment Preferences", icon: "payments", title: "Payment Preferences", purpose: "Choose the payment method shown first at checkout.", signedInOnly: true },
  { destination: "bag", matches: /\b(?:shopping bag|my bag|cart|checkout|place (?:my |an? )?order|pay with (?:gcash|card)|gcash checkout|card checkout)\b/i, label: "Open My Bag", icon: "shopping_bag", title: "Bag", purpose: "Review selected items, delivery fees, and checkout details." },
  { destination: "saved", matches: /\b(?:wishlist|wish list|saved (?:items?|pieces?|products?)|favorites?|favourites?)\b/i, label: "Open Saved Pieces", icon: "favorite", title: "Saved Pieces", purpose: "Return to furniture you saved for later.", signedInOnly: true },
  { destination: "membership", matches: /\b(?:home circle|membership|member tier|loyalty|reward points?|my points?)\b/i, label: "Open Home Circle", icon: "stars", title: "Home Circle", purpose: "See points, tier progress, activity, and available rewards.", signedInOnly: true },
  { destination: "notifications", matches: /\b(?:notifications?|order updates?)\b/i, label: "Open Notifications", icon: "notifications", title: "Notifications", purpose: "Review recent payment, order, and delivery updates.", signedInOnly: true },
  { destination: "account", matches: /\b(?:my account|profile (?:page|screen|tab)|edit (?:my )?profile|account settings?|change (?:my )?(?:name|photo|phone|email)|phone verification|otp)\b/i, label: "Open My Profile", icon: "person", title: "My Profile", purpose: "Manage your profile and customer account tools.", signedInOnly: true },
  { destination: "privacy", matches: /\b(?:privacy|data policy)\b/i, label: "Open Privacy", icon: "privacy_tip", title: "Privacy", purpose: "Read how CozyCraft handles customer information." },
  { destination: "terms", matches: /\b(?:terms|conditions)\b/i, label: "Open Terms", icon: "gavel", title: "Terms", purpose: "Review the terms for using CozyCraft services." },
  { destination: "about", matches: /\b(?:about (?:cozycraft|us|page)|company story|founders?|vision ventures)\b/i, label: "Open About CozyCraft", icon: "info", title: "About CozyCraft", purpose: "Read the brand story and meet Vision Ventures." },
  { destination: "contact", matches: /\b(?:contact (?:page|details|information)|email address|phone number)\b/i, label: "Open Contact", icon: "contact_support", title: "Contact", purpose: "See CozyCraft customer-care contact information." },
  { destination: "shop", matches: /\b(?:shop|catalog|products? page|new arrivals?|living room|bedroom|dining room|browse (?:furniture|products?|pieces?))\b/i, label: "Browse Furniture", icon: "chair", title: "Shop", purpose: "Browse the live catalog by room and product type." },
  { destination: "home", matches: /\b(?:home page|homepage|main screen)\b/i, label: "Open Home", icon: "home", title: "Home", purpose: "Return to featured collections and recommendations." },
]

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
  if (definition.signedInOnly && !authenticated) {
    return { destination: "account", label: `Sign in to open ${definition.title}`, icon: "login" }
  }
  return {
    destination: definition.destination,
    label: definition.label,
    icon: definition.icon,
  }
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
  if (!navigationRequest.test(message)) return null
  const navigation = mobileAssistantNavigationFor(message, authenticated)
  if (!navigation) return null

  if (!authenticated && navigation.destination === "account" && navigation.label.startsWith("Sign in")) {
    return {
      reply: `${navigation.label}.\n1. Tap the button below.\n2. Sign in with your CozyCraft customer account.\n3. Open the requested section from My Profile.`,
      navigation,
    }
  }

  const definition = navigationDefinitions.find((item) => item.destination === navigation.destination)
  const title = definition?.title || navigation.label.replace(/^Open\s+/i, "")
  const reply = `${title}: ${definition?.purpose || "Open the correct app section directly."}\n1. Tap ${navigation.label} below.`

  return { reply, navigation }
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
  const sentences = splitSentences(value)
  const firstDirection = sentences.findIndex((sentence) =>
    directionSignal.test(sentence) || directionContinuation.test(sentence),
  )
  if (firstDirection < 0) return value ? [{ type: "paragraph", text: value }] : []

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
