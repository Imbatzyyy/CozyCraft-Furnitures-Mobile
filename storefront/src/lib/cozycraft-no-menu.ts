import { MOBILE_CARE_PAGES as CANONICAL_PAGES, type MobileCareDestination } from "./cozycraft-mobile-pages"
import { APP_DEVELOPERS } from "../features/navigation/app-navigation-data"
export { mobileTaskSteps, type MobileCareDestination } from "./cozycraft-mobile-pages"

// Local variant only: never change the shared production navigation reference.
const steps: Partial<Record<MobileCareDestination, string[]>> = {
  developers: ["Open Account, then Developers in the information links."],
  history: ["Open Account, then Company History in the information links."],
  privacy: ["Open Account, then Privacy beneath Company History and Terms."],
  terms: ["Open Account, then Terms in the information links."],
  about: ["Open Account, then About in the information links."],
  contact: ["Open Account, then Contact Us.", "Use the email or phone options shown there. For an account-specific concern, use Care & Support."],
  bag: ["Tap Bag in the bottom navigation.", "Select the items to buy and proceed to checkout. Sign in if asked, then review address, voucher, payment, and final total."],
  saved: ["Tap the heart tab in the bottom navigation."],
  membership: ["Open Account, then Home Circle.", "Review available rewards, expiry, and minimum purchase before redeeming. Select an eligible voucher at checkout."],
  shop: ["Tap Shop in the bottom navigation.", "Tap a product to see photos, specifications, availability, and reviews."],
  home: ["Tap Home in the bottom navigation."],
  account: ["Tap Account in the bottom navigation."],
}
export const MOBILE_CARE_PAGES = CANONICAL_PAGES.map(page => ({
  ...page,
  steps: steps[page.destination] || page.steps,
  matches: page.destination === "developers" ? /\b(developers?|development team|team members?|jacob|cañete|canete)\b/i : page.matches,
}))

export function noMenuVersionGuidance(message: string) {
  if (/\b(?:who|names?|members?|team|role)\b/i.test(message) && /\b(?:developers?|development|jacob|cañete|canete)\b/i.test(message)) {
    return {
      reply: "The developers in this no-side-menu version are:\n\n" + APP_DEVELOPERS.map(person => person.name + " — " + person.role).join("\n") + "\n\nOpen Account, then Developers to see their profiles.",
      navigation: { destination: "developers" as const, label: "Meet the Developers", icon: "groups" },
    }
  }
  if (/\b(?:pages|screens|navigation|side menu|sidebar)\b/i.test(message) && /\b(?:what|which|where|how|show|open|list)\b/i.test(message)) {
    return {
      reply: "This version uses the bottom tabs: Home, Shop, Saved, Bag, and Account. There is no side menu.\n\nAccount contains your orders, addresses, payment preferences, support, Home Circle, text size, and app tour. Its information buttons open About, Contact Us, Developers, Company History, Terms, and Privacy. The header keeps Search, Notifications, and your profile.",
      navigation: { destination: "account" as const, label: "Open Account", icon: "person" },
    }
  }
  return null
}
