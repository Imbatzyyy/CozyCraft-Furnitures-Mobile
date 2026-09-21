export type AppInfoSection = "about" | "developers"
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
    { id: "support", label: "Care & support", icon: "support_agent" },
  ] },
  { label: "Behind the comfort", items: [
    { id: "about", label: "About the App", icon: "info" },
    { id: "developers", label: "Developers", icon: "groups" },
  ] },
] as const satisfies ReadonlyArray<{ label: string; items: ReadonlyArray<{ id: AppMenuDestination; label: string; icon: string }> }>

export type AppDeveloper = {
  name: string
  role: string
  image: string
  contact: { label: string; href: string } | null
}

// App-only roster. The website and its shared CMS intentionally stay unchanged.
// Only add contact details supplied/approved by the member; never infer emails.
export const APP_DEVELOPERS: AppDeveloper[] = [
  { name: "Prince Balane", role: "Project Lead · Vision Ventures", image: "./team/prince-balane.jpg", contact: { label: "qpcbalane@tip.edu.ph", href: "mailto:qpcbalane@tip.edu.ph" } },
  { name: "Joylyn Campuso", role: "Product & Research", image: "./team/joylyn-campuso.jpg", contact: { label: "qjccampuso@tip.edu.ph", href: "mailto:qjccampuso@tip.edu.ph" } },
  { name: "Sammuel Guill Concepcion", role: "Development Team", image: "./team/sammuel-guill-concepcion.jpeg", contact: { label: "qsgconcepcion@tip.edu.ph", href: "mailto:qsgconcepcion@tip.edu.ph" } },
  { name: "Angela Faith Suba", role: "Customer Experience", image: "./team/angela-faith-suba.jpeg", contact: { label: "qafcsuba@tip.edu.ph", href: "mailto:qafcsuba@tip.edu.ph" } },
  { name: "Hydee Mae Sumalinog", role: "Operations & Quality", image: "./team/hydee-mae-sumalinog.jpg", contact: { label: "qhmusumalinog@tip.edu.ph", href: "mailto:qhmusumalinog@tip.edu.ph" } },
]
