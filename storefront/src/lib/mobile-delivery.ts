export type MobileDeliveryServiceArea = {
  id: number
  area_code: string
  name: string
  description: string
  delivery_fee: number
  free_delivery_minimum: number | null
  lead_time_min_days: number
  lead_time_max_days: number
  assembly_available: boolean
  active: boolean
  sort_order: number
}

export type MobileDeliveryAddress = {
  province?: string | null
  city?: string | null
}

/**
 * Safe offline values matching the seeded server configuration. Supabase
 * replaces these after launch and remains authoritative when an order is
 * created, so a stale client can never choose its own delivery charge.
 */
export const DEFAULT_MOBILE_DELIVERY_SERVICE_AREAS: MobileDeliveryServiceArea[] = [
  { id: -1, area_code: "metro-manila", name: "Metro Manila", description: "NCR deliveries", delivery_fee: 650, free_delivery_minimum: 50_000, lead_time_min_days: 2, lead_time_max_days: 4, assembly_available: true, active: true, sort_order: 10 },
  { id: -2, area_code: "greater-manila", name: "Greater Manila Area", description: "Bulacan, Cavite, Laguna, and Rizal", delivery_fee: 950, free_delivery_minimum: 75_000, lead_time_min_days: 3, lead_time_max_days: 6, assembly_available: true, active: true, sort_order: 20 },
  { id: -3, area_code: "luzon", name: "Other Luzon areas", description: "Other serviceable Luzon destinations", delivery_fee: 1_450, free_delivery_minimum: 100_000, lead_time_min_days: 5, lead_time_max_days: 9, assembly_available: false, active: true, sort_order: 30 },
  { id: -4, area_code: "visayas", name: "Visayas", description: "Serviceable Visayas destinations", delivery_fee: 2_250, free_delivery_minimum: 150_000, lead_time_min_days: 8, lead_time_max_days: 14, assembly_available: false, active: true, sort_order: 40 },
  { id: -5, area_code: "mindanao", name: "Mindanao", description: "Serviceable Mindanao destinations", delivery_fee: 2_450, free_delivery_minimum: 150_000, lead_time_min_days: 9, lead_time_max_days: 16, assembly_available: false, active: true, sort_order: 50 },
]

const includesAny = (value: string, names: string[]) =>
  names.some((name) => value.includes(name))

export function mobileDeliveryAreaCodeForAddress(address: MobileDeliveryAddress) {
  const location = ` ${address.province ?? ""} ${address.city ?? ""} `
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")

  if (includesAny(location, ["metro manila", "national capital region", " ncr "])) {
    return "metro-manila"
  }
  if (includesAny(location, ["bulacan", "cavite", "laguna", "rizal"])) {
    return "greater-manila"
  }
  if (includesAny(location, [
    "western visayas", "central visayas", "eastern visayas", "aklan", "antique",
    "capiz", "guimaras", "iloilo", "negros", "bacolod", "bohol", "cebu",
    "siquijor", "biliran", "samar", "leyte",
  ])) {
    return "visayas"
  }
  if (includesAny(location, [
    "mindanao", "bangsamoro", "barmm", "zamboanga", "bukidnon", "camiguin",
    "lanao", "misamis", "davao", "cotabato", "sarangani", "sultan kudarat",
    "agusan", "dinagat", "surigao", "basilan", "sulu", "tawi tawi", "caraga",
    "soccsksargen", "cagayan de oro",
  ])) {
    return "mindanao"
  }
  return "luzon"
}

export function mobileDeliveryAreaForAddress(
  areas: MobileDeliveryServiceArea[],
  address: MobileDeliveryAddress,
) {
  const areaCode = mobileDeliveryAreaCodeForAddress(address)
  return areas.find((area) => area.active && area.area_code === areaCode) ?? null
}

export function mobileDeliveryFeeFor(area: MobileDeliveryServiceArea, subtotal: number) {
  return area.free_delivery_minimum !== null && subtotal >= area.free_delivery_minimum
    ? 0
    : area.delivery_fee
}

export function mobileDeliveryDateRange(
  area: Pick<MobileDeliveryServiceArea, "lead_time_min_days" | "lead_time_max_days">,
  from = new Date(),
) {
  const earliest = new Date(from)
  const latest = new Date(from)
  earliest.setDate(earliest.getDate() + area.lead_time_min_days)
  latest.setDate(latest.getDate() + area.lead_time_max_days)
  return { earliest, latest }
}

export function mobileCheckoutAmountError(
  subtotal: number,
  settings: Record<string, unknown>,
) {
  const minimum = Math.max(0, Number(settings.minimum_order_amount) || 0)
  const maximum = Math.max(0, Number(settings.maximum_order_amount) || 0)
  if (subtotal < minimum) {
    return `A minimum merchandise total of ₱${minimum.toLocaleString("en-PH")} is required.`
  }
  if (maximum > 0 && subtotal > maximum) {
    return `The maximum merchandise total per order is ₱${maximum.toLocaleString("en-PH")}.`
  }
  return ""
}

export function mobilePaymentMethodAvailable(
  method: "cod" | "card" | "gcash",
  subtotal: number,
  settings: Record<string, unknown>,
) {
  if (method === "cod") {
    const maximum = Math.max(0, Number(settings.cod_maximum_order) || 0)
    return settings.cod_enabled !== false && (maximum === 0 || subtotal <= maximum)
  }
  if (method === "card") return settings.card_enabled !== false
  return settings.gcash_enabled !== false
}
