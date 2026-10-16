export const APP_INFO_LABELS = { about: "About CozyCraft", history: "Company History", developers: "Developers", contact: "Contact Us", terms: "Terms of Service", privacy: "Privacy Policy" } as const
export type AppInfoSection = keyof typeof APP_INFO_LABELS
export function isAppInfoSection(value: string): value is AppInfoSection {
  return Object.prototype.hasOwnProperty.call(APP_INFO_LABELS, value)
}
export type AppMenuDestination = "home" | "shop" | "saved" | "bag" | "account" | "orders" | "membership" | "support" | AppInfoSection

export const APP_MENU_GROUPS = [
  { label: "Make yourself at home", items: [
    { id: "home", label: "Home", icon: "home" },
    { id: "shop", label: "Shop furniture", icon: "chair" },
    { id: "saved", label: "Wishlist", icon: "favorite" },
    { id: "bag", label: "Shopping bag", icon: "shopping_bag" },
  ] },
  { label: "Your CozyCraft", items: [
    { id: "orders", label: "My orders", icon: "local_shipping" },
    { id: "membership", label: "Home Circle", icon: "loyalty" },
    { id: "account", label: "My account", icon: "person" },
  ] },
  { label: "Discover CozyCraft", items: [
    { id: "about", label: "About CozyCraft", icon: "info" },
    { id: "history", label: "Company History", icon: "history" },
    { id: "developers", label: "Developers", icon: "groups" },
  ] },
  { label: "Help & information", items: [
    { id: "support", label: "Care & support", icon: "support_agent" },
    { id: "contact", label: "Contact Us", icon: "mail" },
    { id: "terms", label: "Terms of Service", icon: "description" },
    { id: "privacy", label: "Privacy Policy", icon: "shield" },
  ] },
] as const satisfies ReadonlyArray<{ label: string; items: ReadonlyArray<{ id: AppMenuDestination; label: string; icon: string }> }>

export type AppDeveloper = {
  name: string
  role: string
  description: string
  image: string
  contact: { label: string; href: string } | null
}

// Variant-only roster. The website and its shared CMS intentionally stay unchanged.
// Only add contact details supplied/approved by the member; never infer emails.
export const APP_DEVELOPERS: AppDeveloper[] = [
  { name: "Prince Balane", role: "Project Lead · Vision Ventures", description: "Guides the project’s direction and brings the team’s work together around a connected CozyCraft shopping experience.", image: "./team/prince-balane.jpg", contact: { label: "qpcbalane@tip.edu.ph", href: "mailto:qpcbalane@tip.edu.ph" } },
  { name: "Joylyn Campuso", role: "Product & Research", description: "Focuses on product ideas and research, helping the team shape a useful, thoughtfully organized furniture-shopping experience.", image: "./team/joylyn-campuso.jpg", contact: { label: "qjccampuso@tip.edu.ph", href: "mailto:qjccampuso@tip.edu.ph" } },
  { name: "Jacob Christopher Cañete", role: "Platform Development", description: "Focuses on the app’s technical foundation, bringing features together to support a connected and dependable furniture-shopping experience.", image: "./team/jacob-christopher-canete.jpg", contact: { label: "qjcanete02@tip.edu.ph", href: "mailto:qjcanete02@tip.edu.ph" } },
  { name: "Angela Faith Suba", role: "Customer Experience", description: "Focuses on the customer’s journey, helping make CozyCraft’s information, navigation, and support experience clear and welcoming.", image: "./team/angela-faith-suba.jpeg", contact: { label: "qafcsuba@tip.edu.ph", href: "mailto:qafcsuba@tip.edu.ph" } },
  { name: "Hydee Mae Sumalinog", role: "Operations & Quality", description: "Focuses on quality and everyday usability, helping the team review details and keep the shopping experience consistent.", image: "./team/hydee-mae-sumalinog.jpg", contact: { label: "qhmusumalinog@tip.edu.ph", href: "mailto:qhmusumalinog@tip.edu.ph" } },
]
