import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import cozyLogo from "./imports/COZy.png"
import { enterGuestMode, isGuestMode, supabase, verifyCustomerSession } from "./lib/supabase"
import {
  createSupportTicket,
  acceptCurrentMobilePolicies,
  expandMobileCatalogQuery,
  loadCart,
  loadAddresses,
  loadDefaultAddress,
  loadCommunicationPreferences,
  loadMobileFaq,
  loadMobileHomepageBanners,
  loadMobileProductViews,
  loadMobileReturnRequests,
  loadMobileSearchSynonyms,
  loadNotifications,
  loadMobileStoreSettings,
  loadMobileDeliveryServiceAreas,
  loadMobileLoyalty,
  loadMobileLoyaltyActivity,
  loadMobileRedemptions,
  loadOrders,
  loadProducts,
  loadProfile,
  loadPaymentPreference,
  loadPhilippineBarangays,
  loadPhilippineLocations,
  loadReviews,
  loadWishlist,
  moveWishlistItemToCart,
  loadSupportTickets,
  markNotification,
  redeemMobilePoints,
  registerPushToken,
  recordMobileCatalogSearch,
  recordMobileProductView,
  unregisterPushToken,
  placeOrder,
  peso,
  removeCart,
  saveProfile,
  saveAddress,
  deleteAddress,
  setPrimaryAddress,
  savePaymentPreference,
  saveCommunicationPreferences,
  stageReviewImage,
  submitReview,
  submitMobileReturnRequest,
  toggleWishlist,
  upsertCart,
  type MobileRedemption,
  type MobileFaqPage,
  type MobileStoreSettings,
  type MobileCustomerProfile,
  type MobileAddress,
  type PhilippineBarangay,
  type PhilippineMunicipality,
  type PhilippineProvince,
  type PhilippineRegion,
  type MobileLoyaltyAccount,
  type MobileHomepageBanner,
  type MobileReturnRequest,
  type MobileSearchSynonym,
} from "./lib/mobile-data"
import { buildMobileRecommendations } from "./lib/mobile-recommendations"
import { clearStorefrontReturnState, notificationBadgeCount, readStorefrontReturnState, rememberStorefrontReturnState } from "./lib/mobile-navigation"
import PhoneVerificationField from "./features/profile/PhoneVerificationField"
import { usePhoneVerification } from "./features/profile/usePhoneVerification"
import { normalizePhilippineMobile, type VerifiedPhone } from "./features/profile/phone-verification"
import {
  DEFAULT_MOBILE_DELIVERY_SERVICE_AREAS,
  mobileCheckoutAmountError,
  mobileDeliveryAreaForAddress,
  mobileDeliveryDateRange,
  mobileDeliveryFeeFor,
  mobilePaymentMethodAvailable,
  type MobileDeliveryServiceArea,
} from "./lib/mobile-delivery"

type Product = {
  id: string
  name: string
  category: string
  subcategory?: string
  price: string
  old?: string
  image: string
  images?: string[]
  alt: string
  description?: string
  label?: string
  rating?: number
  reviews?: number
  stock?: number
  room?: "living" | "bedroom" | "dining"
  materials?: Array<{ type: string; description: string }>
  dimensions?: Array<{ label: string; value: string; unit: string }>
}

type CartLine = {
  product: Product
  quantity: number
  selected: boolean
  orderItemId?: number
  reviewId?: string
  reviewRating?: number
  reviewBody?: string
  reviewImages?: string[]
}

type CustomerOrder = {
  id: string
  databaseId?: string
  createdAt: string
  total: number
  status: "Processing" | "Packed" | "Shipped" | "Delivered" | "Cancelled"
  payment: string
  paymentStatus?: string
  refundStatus?: string | null
  refundedAt?: string | null
  cancellationReason?: string | null
  cancellationStatus?: "pending" | "approved" | "rejected" | null
  cancellationRequestedAt?: string | null
  cancellationReviewedAt?: string | null
  cancellationDecisionNote?: string | null
  subtotal?: number
  deliveryFee?: number
  deliveryAreaName?: string
  rewardDiscount?: number
  pointsEarned?: number
  address: string
  items: CartLine[]
  timeline?: Array<{ status: string; changedAt: string }>
}

type PendingPayment = {
  orderId?: string
  orderNumber?: string
  startedAt?: string
  total?: number
  subtotal?: number
  deliveryFee?: number
  deliveryAreaName?: string
  rewardDiscount?: number
  address?: string
  payment?: string
  items?: CartLine[]
}

const LAST_PRESENTED_PAYMENT_ORDER_KEY = "cozycraft-last-presented-payment-order"

function visibleOrderTimeline(order: CustomerOrder) {
  const events = order.timeline?.length
    ? order.timeline
    : [{ status: order.status, changedAt: order.createdAt }]
  return events.filter((event, index) => index === 0 || event.status !== events[index - 1]?.status)
}

function readPendingPayment(): PendingPayment {
  try {
    return JSON.parse(window.localStorage.getItem("cozycraft-pending-payment") || "{}") as PendingPayment
  } catch {
    return {}
  }
}

function pendingPaymentOrder(pending: PendingPayment, orderId: string): CustomerOrder {
  return {
    id: pending.orderNumber || orderId,
    databaseId: orderId,
    createdAt: pending.startedAt || new Date().toISOString(),
    total: Number(pending.total || 0),
    subtotal: Number(pending.subtotal || pending.total || 0),
    deliveryFee: Number(pending.deliveryFee || 0),
    deliveryAreaName: pending.deliveryAreaName || "",
    rewardDiscount: Number(pending.rewardDiscount || 0),
    status: "Processing",
    payment: pending.payment || "PayMongo",
    paymentStatus: "processing",
    address: pending.address || "",
    items: Array.isArray(pending.items) ? pending.items : [],
  }
}

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key)
      return saved ? JSON.parse(saved) as T : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}

const OFFLINE_CATALOG_KEY = "cozycraft-offline-catalog-v1"
const OFFLINE_SETTINGS_KEY = "cozycraft-offline-settings-v1"
const OFFLINE_DELIVERY_AREAS_KEY = "cozycraft-offline-delivery-areas-v1"

function reconnectResourceUrl(source: string, revision: number) {
  if (!source || !revision || !/^https?:/i.test(source)) return source
  try {
    const url = new URL(source)
    url.searchParams.set("cozycraft_retry", String(revision))
    return url.toString()
  } catch {
    return source
  }
}

function retryVisibleRemoteImages(revision: number) {
  window.requestAnimationFrame(() => {
    document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
      const source = image.currentSrc || image.src
      if (!/^https?:/i.test(source)) return
      image.src = reconnectResourceUrl(source, revision)
    })
  })
}

function readOfflineCache<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function cacheOfflineValue(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A full or privacy-restricted cache must never interrupt shopping.
  }
}

async function warmProductImageCache(products: Product[]) {
  if (!("caches" in window)) return
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (connection?.saveData || ["slow-2g", "2g"].includes(String(connection?.effectiveType || ""))) return
  try {
    const cache = await window.caches.open("cozycraft-product-images-v1")
    // Warm only the first visible catalog images. Caching every gallery image
    // multiplied storage egress even when a customer never opened the product.
    const sources = [...new Set(products.slice(0, 8).map((product) => product.image))]
      .filter((source) => /^https?:/i.test(source))
    await Promise.allSettled(sources.map((source) => cache.add(source)))
  } catch {
    // Image caching is best effort; the catalog text remains available offline.
  }
}
const photo = (id: string) => `./furniture/${id}.jpg`

const HOME_HEADLINES = [
  { lead: "Spaces for", emphasis: "slow mornings." },
  { lead: "Comfort made", emphasis: "beautifully yours." },
  { lead: "A better room", emphasis: "begins here." },
  { lead: "Designed for", emphasis: "life at home." },
  { lead: "Make room for", emphasis: "what matters." },
  { lead: "Furniture for", emphasis: "your next chapter." },
]

const launchHeadline = HOME_HEADLINES[Math.floor(Math.random() * HOME_HEADLINES.length)]

const HOME_SHOWCASES = [
  {
    image: "photo-1599696848652-f0ff23bc911f",
    alt: "Warm contemporary living room with a brown sofa",
    eyebrow: "THE QUIET LIVING EDIT",
    title: "Comfort,",
    emphasis: "considered.",
    action: "Explore seating",
    query: "Seating",
  },
  {
    image: "photo-1600210492486-724fe5c67fb0",
    alt: "Bright refined living space styled with neutral furniture",
    eyebrow: "THE LIGHT-FILLED HOME",
    title: "Live softly,",
    emphasis: "style boldly.",
    action: "Discover new pieces",
    query: "New",
  },
  {
    image: "photo-1617806118233-18e1de247200",
    alt: "Considered dining room arranged for shared meals",
    eyebrow: "THE GATHERING EDIT",
    title: "Made for",
    emphasis: "togetherness.",
    action: "Explore dining",
    query: "Dining",
  },
]
const demoProducts: Product[] = [
  {
    id: "1",
    name: "Sola Lounge Chair",
    category: "Seating",
    price: "₱12,800",
    old: "₱16,000",
    label: "20% off",
    image: photo("photo-1567016376408-0226e4d0c1ea"),
    alt: "Brown leather lounge chair in a modern interior",
    rating: 4.9,
    reviews: 128,
    stock: 8,
    room: "living",
  },
  {
    id: "2",
    name: "Mira Cloud Sofa",
    category: "Seating",
    price: "₱31,500",
    label: "New",
    image: photo("photo-1599696848652-f0ff23bc911f"),
    alt: "Warm beige sofa by a window",
    rating: 4.8,
    reviews: 94,
    stock: 5,
    room: "living",
  },
  {
    id: "3",
    name: "Arc Atelier Lamp",
    category: "Lighting",
    price: "₱3,250",
    image: photo("photo-1507473885765-e6ed057f782c"),
    alt: "Contemporary illuminated table lamp",
    rating: 4.7,
    reviews: 63,
    stock: 14,
    room: "bedroom",
  },
  {
    id: "4",
    name: "Araw Oak Table",
    category: "Dining",
    price: "₱18,900",
    image: photo("photo-1617806118233-18e1de247200"),
    alt: "Minimal oak dining table",
    rating: 4.9,
    reviews: 76,
    stock: 4,
    room: "dining",
  },
  {
    id: "5",
    name: "Luna Bedside Table",
    category: "Storage",
    price: "₱6,450",
    label: "Bestseller",
    image: photo("photo-1540638349517-3abd5afc5847"),
    alt: "Warm wood bedside table in a quiet bedroom",
    rating: 4.8,
    reviews: 52,
    stock: 11,
    room: "bedroom",
  },
  {
    id: "6",
    name: "Nara Dining Chair",
    category: "Dining",
    price: "₱4,850",
    old: "₱5,700",
    label: "15% off",
    image: photo("photo-1637412816281-f80ec9948fea"),
    alt: "Sculptural dining chair in a warm modern interior",
    rating: 4.7,
    reviews: 41,
    stock: 16,
    room: "dining",
  },
  {
    id: "7",
    name: "Tala Accent Cabinet",
    category: "Storage",
    price: "₱14,200",
    label: "Limited",
    image: photo("photo-1600210492486-724fe5c67fb0"),
    alt: "Refined accent cabinet in a sunlit room",
    rating: 4.9,
    reviews: 35,
    stock: 3,
    room: "living",
  },
]
const glyph: Record<string, string> = {
  home: "home",
  shop: "grid_view",
  saved: "favorite",
  bag: "shopping_bag",
  account: "person",
}

function flyProductTo(event: React.MouseEvent<HTMLElement>, target: "saved" | "bag", product: Product) {
  const origin = event.currentTarget.getBoundingClientRect()
  const destination = document.querySelector<HTMLElement>(`[data-nav="${target}"]`)
  if (!destination || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  const targetRect = destination.getBoundingClientRect()
  const flyer = document.createElement("div")
  flyer.className = `product-flyer fly-${target}`
  flyer.innerHTML = `<img src="${product.image.replace(/"/g, "&quot;")}" alt=""><span class="material-symbols-rounded">${target === "saved" ? "favorite" : "shopping_bag"}</span>`
  flyer.style.left = `${origin.left + origin.width / 2 - 22}px`
  flyer.style.top = `${origin.top + origin.height / 2 - 22}px`
  document.body.appendChild(flyer)
  const deltaX = targetRect.left + targetRect.width / 2 - (origin.left + origin.width / 2)
  const deltaY = targetRect.top + targetRect.height / 2 - (origin.top + origin.height / 2)
  const animation = flyer.animate([
    { transform: "translate3d(0,0,0) scale(.72) rotate(0deg)", opacity: 0 },
    { transform: "translate3d(0,-18px,0) scale(1.08) rotate(-5deg)", opacity: 1, offset: .2 },
    { transform: `translate3d(${deltaX * .58}px,${deltaY * .42}px,0) scale(.72) rotate(7deg)`, opacity: .92, offset: .62 },
    { transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(.18) rotate(14deg)`, opacity: 0 },
  ], { duration: 720, easing: "cubic-bezier(.2,.76,.24,1)" })
  animation.finished.finally(() => {
    flyer.remove()
    destination.animate([
      { transform: "scale(1)" },
      { transform: "scale(1.16)" },
      { transform: "scale(1)" },
    ], { duration: 330, easing: "ease-out" })
  })
}

const categories = [
  {
    id: "living",
    title: "Living Room",
    note: "Settle in beautifully",
    image: photo("photo-1599696848652-f0ff23bc911f"),
    groups: [
      {
        name: "Sofas",
        items: [
          "2-Seater Fabric Sofa",
          "3-Seater Fabric Sofa",
          "Sectional Sofa",
          "Recliner Sofa",
          "Sofa Bed",
        ],
      },
      {
        name: "Coffee Tables",
        items: [
          "Wooden Coffee Table",
          "Glass Coffee Table",
          "Round Coffee Table",
          "Storage Coffee Table",
          "Marble Coffee Table",
        ],
      },
      {
        name: "TV Stands",
        items: [
          "Wooden TV Stand",
          "Floating TV Stand",
          "Corner TV Stand",
          "TV Cart",
          "Modern TV Stand",
        ],
      },
    ],
  },
  {
    id: "bedroom",
    title: "Bedroom",
    note: "Rest starts here",
    image: photo("photo-1600210492486-724fe5c67fb0"),
    groups: [
      {
        name: "Beds",
        items: [
          "Single Size Bed",
          "Double Size Bed",
          "Queen Size Bed",
          "King Size Bed",
          "Bunk Bed",
        ],
      },
      {
        name: "Wardrobes",
        items: [
          "2-Door Wardrobe",
          "3-Door Wardrobe",
          "Sliding Door Wardrobe",
          "Walk-in Wardrobe",
          "Corner Wardrobe",
        ],
      },
      {
        name: "Nightstands",
        items: [
          "Wooden Nightstand",
          "Modern Nightstand",
          "Floating Nightstand",
          "Nightstand with Drawer",
          "Metal Nightstand",
        ],
      },
    ],
  },
  {
    id: "dining",
    title: "Dining Room",
    note: "Gather with intention",
    image: photo("photo-1617806118233-18e1de247200"),
    groups: [
      {
        name: "Dining Tables",
        items: [
          "Extendable Dining Table",
          "Marble Top Dining Table",
          "Glass Dining Table",
          "Wooden Ornate Dining Table",
          "Metal Industrial Dining Table",
        ],
      },
      {
        name: "Dining Chairs",
        items: [
          "Wooden Ornate Dining Chairs",
          "Modern Plastic Dining Chairs",
          "Metal Industrial Dining Chairs",
          "Molded Resin Dining Chairs",
          "Luxury Velvet Dining Chairs",
        ],
      },
      {
        name: "Dining Storage",
        items: [
          "Dining Hutch Cabinet",
          "Buffet Cabinet",
          "Pantry Cabinets",
          "Wine Storage Cabinet",
          "Serving Trolleys",
        ],
      },
    ],
  },
]

export default function Storefront() {
  const [returnState] = useState(readStorefrontReturnState)
  const [tab, setTab] = useState(returnState?.tab || "home")
  const [navGlassIndex, setNavGlassIndex] = useState(returnState?.tab === "account" ? 4 : 2)
  const [navGlassPosition, setNavGlassPosition] = useState(returnState?.tab === "account" ? 90 : 50)
  const [navGlassScrubbing, setNavGlassScrubbing] = useState(false)
  const navGlassPointer = useRef<{ pointerId: number; index: number } | null>(null)
  const navGlassTouch = useRef<{ index: number } | null>(null)
  const suppressNavClick = useRef(false)
  const [heroIndex, setHeroIndex] = useState(0)
  const heroTouchStart = useRef<number | null>(null)
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [products, setProducts] = useState<Product[]>(() => readOfflineCache<Product[]>(OFFLINE_CATALOG_KEY, []))
  const [catalogLoading, setCatalogLoading] = useState(() => !readOfflineCache<Product[]>(OFFLINE_CATALOG_KEY, []).length)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [reconnected, setReconnected] = useState(false)
  const [resourceRevision, setResourceRevision] = useState(0)
  const [userId, setUserId] = useState("")
  const [saved, setSaved] = useStoredState<string[]>("cozycraft-saved", [])
  const [movingSaved, setMovingSaved] = useState<string[]>([])
  const [bag, setBag] = useStoredState<CartLine[]>("cozycraft-bag", [])
  const [orders, setOrders] = useStoredState<CustomerOrder[]>(
    "cozycraft-orders",
    [],
  )
  const [recentlyViewed, setRecentlyViewed] = useStoredState<string[]>(
    "cozycraft-recently-viewed",
    [],
  )
  const [compareIds, setCompareIds] = useStoredState<string[]>("cozycraft-mobile-compare", [])
  const [compareOpen, setCompareOpen] = useState(false)
  const [homepageBanners, setHomepageBanners] = useState<MobileHomepageBanner[]>([])
  const [searchSynonyms, setSearchSynonyms] = useState<MobileSearchSynonym[]>([])
  const [profile, setProfile] = useStoredState<MobileCustomerProfile>("cozycraft-profile", {
    name: "Guest",
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    phoneVerifiedAt: null,
    image: "",
    gender: "",
    birth: "",
  })
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState("")
  const [toast, setToast] = useState("")
  const [detail, setDetail] = useState<Product | null>(null)
  useEffect(() => {
    if (!detail) return
    const refreshed = products.find((product) => product.id === detail.id)
    if (refreshed && refreshed !== detail) setDetail(refreshed)
  }, [products, detail])
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [placedOrder, setPlacedOrder] = useState<CustomerOrder | null>(null)
  // A pending checkout is not itself a payment return. Starting this as true
  // made every ordinary app launch flash the confirmation overlay.
  const [paymentReturning, setPaymentReturning] = useState(false)
  const paymentReturnInFlight = useRef("")
  const [profileOpen, setProfileOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] =
    useState<typeof categories[number] | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Array<Record<string, any>>>([])
  const [notificationsHydrated, setNotificationsHydrated] = useState(false)
  const applyNotifications = (items: Array<Record<string, any>>) => {
    setNotifications(items)
    setNotificationsHydrated(true)
  }
  const unreadNotificationCount = notificationBadgeCount(
    notifications.filter((item) => !item.read_at).length,
    notificationsHydrated,
    returnState,
  )
  const [storeSettings, setStoreSettings] = useState<MobileStoreSettings>(() => readOfflineCache<MobileStoreSettings>(OFFLINE_SETTINGS_KEY, {
    announcement_enabled: false,
    announcement_text: "",
    announcement_link: "",
    delivery_area: "Metro Manila",
    checkout_settings: {},
    fulfillment_settings: {},
  }))
  const [deliveryAreas, setDeliveryAreas] = useState<MobileDeliveryServiceArea[]>(() =>
    readOfflineCache<MobileDeliveryServiceArea[]>(
      OFFLINE_DELIVERY_AREAS_KEY,
      DEFAULT_MOBILE_DELIVERY_SERVICE_AREAS,
    ),
  )
  const [membershipOpen, setMembershipOpen] = useState(false)
  const [loyalty, setLoyalty] = useState<MobileLoyaltyAccount | null>(null)
  const [loyaltyActivity, setLoyaltyActivity] = useState<Array<Record<string, any>>>([])
  const [loyaltyRedemptions, setLoyaltyRedemptions] = useState<MobileRedemption[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [pushPermission, setPushPermission] = useState<"unknown" | "granted" | "denied" | "unsupported">("unknown")
  const [shopRoom, setShopRoom] = useState("living")
  const [shopSubcategory, setShopSubcategory] = useState("")
  const heroShowcases = useMemo(() => homepageBanners.length
    ? homepageBanners.map((banner, index) => ({
        image: banner.image_url || photo(HOME_SHOWCASES[index % HOME_SHOWCASES.length].image),
        alt: banner.title,
        eyebrow: banner.eyebrow || "COZYCRAFT EDIT",
        title: banner.title,
        emphasis: "",
        note: banner.subtitle || "",
        action: banner.cta_label || "Explore the edit",
        query: banner.cta_path || "",
      }))
    : HOME_SHOWCASES.map((showcase) => ({ ...showcase, note: "", image: photo(showcase.image) })), [homepageBanners])
  const currentDateLabel = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).formatToParts(currentDate)
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ""

    return `${value("weekday")}, ${value("day")} ${value("month")}`.toUpperCase()
  }, [currentDate])
  const requestPushPermission = () => {
    if (window.parent === window) {
      setPushPermission("unsupported")
      flash("Notifications are available in the installed CozyCraft app.")
      return
    }
    window.parent.postMessage({ type: "cozycraft-request-push-permission" }, "*")
  }

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    let active = true
    const refreshBanners = () => void loadMobileHomepageBanners(true)
      .then((rows) => { if (active) setHomepageBanners(rows) })
      .catch((error) => console.warn("Unable to refresh mobile banners", error))
    void loadMobileHomepageBanners()
      .then((rows) => { if (active) setHomepageBanners(rows) })
      .catch((error) => console.warn("Unable to load mobile banners", error))
    void loadMobileSearchSynonyms()
      .then((rows) => { if (active) setSearchSynonyms(rows) })
      .catch((error) => console.warn("Unable to load mobile search synonyms", error))
    const channel = supabase.channel("mobile-home-content")
      .on("postgres_changes", { event: "*", schema: "public", table: "homepage_banners" }, refreshBanners)
      .subscribe()
    const timer = window.setInterval(refreshBanners, 15 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [])
  useEffect(() => {
    if (!userId) return
    let active = true
    void loadMobileProductViews(userId)
      .then((ids) => {
        if (!active || !ids.length) return
        setRecentlyViewed((current) => [...new Set([...ids, ...current])].slice(0, 8))
      })
      .catch((error) => console.warn("Unable to restore recent products", error))
    if (window.localStorage.getItem("cozycraft-mobile-policy-consent-pending")) {
      void acceptCurrentMobilePolicies("mobile_signup")
        .then(() => window.localStorage.removeItem("cozycraft-mobile-policy-consent-pending"))
        .catch((error) => console.warn("Policy acceptance will retry", error))
    }
    return () => { active = false }
  }, [userId])
  useEffect(() => {
    let reconnectTimer = 0
    const handleOffline = () => {
      window.clearTimeout(reconnectTimer)
      setReconnected(false)
      setOnline(false)
    }
    const handleOnline = () => {
      const revision = Date.now()
      setOnline(true)
      setReconnected(true)
      setResourceRevision(revision)
      reconnectTimer = window.setTimeout(() => setReconnected(false), 3200)
      void Promise.all([loadProducts(), loadMobileStoreSettings()]).then(([catalog, settings]) => {
        setProducts(catalog as Product[])
        setStoreSettings(settings)
        cacheOfflineValue(OFFLINE_CATALOG_KEY, catalog)
        cacheOfflineValue(OFFLINE_SETTINGS_KEY, settings)
        void warmProductImageCache(catalog as Product[])
        retryVisibleRemoteImages(revision)
      }).catch(console.error)
    }
    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    return () => {
      window.clearTimeout(reconnectTimer)
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!resourceRevision || !online) return
    let active = true
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session
        const [catalog, settings] = await Promise.all([
          loadProducts(),
          loadMobileStoreSettings(),
        ])
        if (!active) return
        setProducts(catalog as Product[])
        setStoreSettings(settings)
        cacheOfflineValue(OFFLINE_CATALOG_KEY, catalog)
        cacheOfflineValue(OFFLINE_SETTINGS_KEY, settings)
        void warmProductImageCache(catalog as Product[])

        if (session?.user && !isGuestMode()) {
          const [nextProfile, nextSaved, nextCart, nextOrders, nextNotifications] = await Promise.all([
            loadProfile(session.user),
            loadWishlist(session.user.id),
            loadCart(session.user.id, catalog),
            loadOrders(session.user.id, catalog),
            loadNotifications(session.user.id),
          ])
          if (!active) return
          setProfile(nextProfile)
          setSaved(nextSaved)
          setBag(nextCart as CartLine[])
          setOrders(nextOrders as CustomerOrder[])
          applyNotifications(nextNotifications)
        }
        retryVisibleRemoteImages(resourceRevision)
      } catch (error) {
        console.error("Reconnect refresh failed", error)
      }
    })()
    return () => { active = false }
  }, [online, resourceRevision])
  useEffect(() => {
    if (tab !== "home") return
    const timer = window.setInterval(
      () => setHeroIndex((current) => (current + 1) % heroShowcases.length),
      5_800,
    )
    return () => window.clearInterval(timer)
  }, [heroShowcases.length, tab])
  useEffect(() => {
    if (heroIndex >= heroShowcases.length) setHeroIndex(0)
  }, [heroIndex, heroShowcases.length])
  useEffect(() => {
    const openNativeNotification = (event: MessageEvent) => {
      if (event.data?.type === "cozycraft-open-notifications") setNotificationsOpen(true)
      if (event.data?.type === "cozycraft-push-token") {
        const token = String(event.data.token || "")
        const platform = String(event.data.platform || "unknown")
        if (!token) return
        window.localStorage.setItem("cozycraft-native-push-token", token)
        window.localStorage.setItem("cozycraft-native-push-platform", platform)
        if (userId) void registerPushToken(token, platform).catch(console.error)
      }
      if (event.data?.type === "cozycraft-push-permission") {
        const status = String(event.data.status || "unknown")
        setPushPermission(status === "granted" ? "granted" : status === "denied" ? "denied" : status === "unsupported" ? "unsupported" : "unknown")
        if (status === "granted") flash("Order and delivery notifications are on")
        else if (status === "denied") flash("Notifications remain off. You can enable them in your phone settings.")
      }
      if (event.data?.type === "cozycraft-push-received") {
        if (userId) void loadNotifications(userId).then(applyNotifications).catch(console.error)
      }
    }
    window.addEventListener("message", openNativeNotification)
    return () => window.removeEventListener("message", openNativeNotification)
  }, [userId])
  useEffect(() => {
    if (!userId) return
    const token = window.localStorage.getItem("cozycraft-native-push-token") || ""
    const platform = window.localStorage.getItem("cozycraft-native-push-platform") || "unknown"
    if (token) void registerPushToken(token, platform).catch(console.error)
  }, [userId])
  useEffect(() => {
    const handlePaymentReturn = (event: MessageEvent) => {
      if (event.data?.type === "cozycraft-paymongo-error") {
        const message = String(
          event.data?.message || "The secure PayMongo page could not be opened. Please try again.",
        )
        const pendingPayment = readPendingPayment()

        window.localStorage.removeItem("cozycraft-pending-payment")
        paymentReturnInFlight.current = ""
        setPaymentReturning(false)
        if (pendingPayment.orderId) {
          void supabase.functions
            .invoke("cancel-paymongo-checkout", { body: { orderId: pendingPayment.orderId } })
            .then(({ error }) => {
              if (error) console.error("Unable to release failed PayMongo checkout", error)
            })
            .catch((error) => console.error("Unable to release failed PayMongo checkout", error))
        }
        flash(message)
        return
      }
      if (event.data?.type !== "cozycraft-payment-callback") return
      const callbackUrl = String(event.data.url || "")
      if (!callbackUrl || paymentReturnInFlight.current === callbackUrl) return
      if (window.localStorage.getItem("cozycraft-last-payment-callback") === callbackUrl) {
        window.parent.postMessage({ type: "cozycraft-app-url-consumed", url: callbackUrl }, "*")
        return
      }
      paymentReturnInFlight.current = callbackUrl
      setPaymentReturning(true)
      void (async () => {
        try {
          const callback = new URL(callbackUrl)
          const payment = callback.searchParams.get("payment")
          const storedPayment = readPendingPayment()
          const orderId = callback.searchParams.get("order") || storedPayment.orderId || ""
          if (!orderId) throw new Error("The payment return did not include an order reference.")

          // PayMongo's successful Back to merchant action is the UI handoff.
          // Never leave the old checkout underneath while network reconciliation
          // runs: its selected cart lines may already have been removed, which
          // previously exposed a misleading PHP 0 checkout.
          if (payment === "success") {
            const cachedOrder = orders.find((order) => order.databaseId === orderId)
            setCheckoutOpen(false)
            setPlacedOrder(cachedOrder || pendingPaymentOrder(storedPayment, orderId))
            // Presentation is a one-time UI event. Later webhook/realtime
            // updates may replace this order's data, but must never reopen it.
            window.localStorage.setItem(LAST_PRESENTED_PAYMENT_ORDER_KEY, orderId)
            setPaymentReturning(false)
            window.localStorage.removeItem("cozycraft-pending-payment")
            window.localStorage.setItem("cozycraft-last-payment-callback", callbackUrl)
            window.parent.postMessage({ type: "cozycraft-app-url-consumed", url: callbackUrl }, "*")
          }

          let activeUserId = userId
          for (let attempt = 0; !activeUserId && attempt < 12; attempt += 1) {
            const { data } = await supabase.auth.getSession()
            activeUserId = data.session?.user.id || ""
            if (!activeUserId) await new Promise((resolve) => window.setTimeout(resolve, 250))
          }
          if (!activeUserId) throw new Error("Your session is still restoring. Please keep CozyCraft open for a moment.")
          const catalog = products.length ? products : await loadProducts() as Product[]

        if (payment === "success") {
          // PayMongo may redirect back a fraction of a second before its webhook
          // finishes updating the order. Reconciliation is helpful, but a
          // temporary reconciliation error must not trap the customer on the
          // confirmation screen forever.
          const sync = await Promise.race([
            supabase.functions.invoke("sync-paymongo-payments", { body: { orderIds: [orderId] } }),
            new Promise<never>((_, reject) => window.setTimeout(
              () => reject(new Error("Payment verification is taking longer than expected.")),
              12_000,
            )),
          ]).catch((error) => {
            console.warn("Immediate PayMongo reconciliation is still pending", error)
            return null
          })
          if (sync?.error) console.warn("Immediate PayMongo reconciliation is still pending", sync.error)
          } else {
            const cancellation = await supabase.functions.invoke("cancel-paymongo-checkout", { body: { orderId } })
            if (cancellation.error) throw cancellation.error
          }

        let nextOrders = await Promise.race([
          loadOrders(activeUserId, catalog),
          new Promise<never>((_, reject) => window.setTimeout(
            () => reject(new Error("Your order is taking longer than expected to synchronize.")),
            12_000,
          )),
        ]) as CustomerOrder[]
          // The server return handler now verifies and settles before opening
          // the app. If that provider check is still pending, Realtime will
          // deliver the eventual update; repeated foreground polling only
          // duplicated requests and could reopen stale UI minutes later.

        setOrders(nextOrders)
        setCheckoutOpen(false)
        if (payment === "success") {
          const returnedOrder = nextOrders.find((order) => order.databaseId === orderId)
          // The saved checkout snapshot already opened Order Confirmed. Replace
          // it with the canonical server order as soon as that row is visible.
          // A briefly stale query must never send the customer back to checkout.
          if (returnedOrder) {
            setPlacedOrder((current) => current?.databaseId === orderId ? returnedOrder : current)
          }
          flash(returnedOrder?.paymentStatus === "paid" ? "Payment confirmed" : "Payment received and being verified")
        } else {
          window.localStorage.removeItem("cozycraft-pending-payment")
          flash("Checkout cancelled. No payment was completed.")
        }
        void loadCart(activeUserId, catalog)
          .then((nextBag) => setBag(nextBag as CartLine[]))
          .catch((error) => console.error("Unable to refresh the bag after payment", error))
        if (payment !== "success") {
          window.localStorage.setItem("cozycraft-last-payment-callback", callbackUrl)
          window.parent.postMessage({ type: "cozycraft-app-url-consumed", url: callbackUrl }, "*")
        }
      } catch (error) {
        console.error(error)
        // Once a successful PayMongo return has opened Order Confirmed, a slow
        // reconciliation request is background-only and must not replace it.
        const payment = (() => {
          try { return new URL(callbackUrl).searchParams.get("payment") } catch { return null }
        })()
        if (payment !== "success") {
          flash(error instanceof Error ? error.message : "We could not confirm the payment return.")
        }
      } finally {
        // Always release the full-screen confirmation overlay. Previously an
        // edge-function, network, or stale-order error left this state active
        // indefinitely after Back to merchant.
        setPaymentReturning(false)
        paymentReturnInFlight.current = ""
      }
      })()
    }
    window.addEventListener("message", handlePaymentReturn)
    return () => window.removeEventListener("message", handlePaymentReturn)
  }, [userId, products, orders])
  useEffect(() => {
    const handleNativeBack = (event: MessageEvent) => {
      if (event.data?.type !== "cozycraft-native-back") return
      if (paymentReturning) {
        flash("Your payment is still being confirmed")
      } else if (placedOrder) setPlacedOrder(null)
      else if (checkoutOpen) setCheckoutOpen(false)
      else if (detail) setDetail(null)
      else if (profileOpen) setProfileOpen(false)
      else if (categoryOpen) setCategoryOpen(null)
      else if (notificationsOpen) setNotificationsOpen(false)
      else if (membershipOpen) setMembershipOpen(false)
      else if (search) setSearch(false)
      else if (tab === "account") {
        const closeAccountLayer = new CustomEvent("cozycraft-close-account-layer", { cancelable: true })
        window.dispatchEvent(closeAccountLayer)
        if (!closeAccountLayer.defaultPrevented) setTab("home")
      }
      else if (tab !== "home") setTab("home")
      else window.parent.postMessage({ type: "cozycraft-native-back-unhandled" }, "*")
    }
    window.addEventListener("message", handleNativeBack)
    return () => window.removeEventListener("message", handleNativeBack)
  }, [paymentReturning, placedOrder, checkoutOpen, detail, profileOpen, categoryOpen, notificationsOpen, membershipOpen, search, tab])
  useEffect(() => {
    if (!userId || paymentReturnInFlight.current) return
    const pending = readPendingPayment()
    if (!pending.orderId) return
    let disposed = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          // A deep-link callback may have consumed this checkout while this
          // delayed recovery timer was waiting. Never let the stale closure
          // reconcile and present that same order a second time.
          if (readPendingPayment().orderId !== pending.orderId) return
          const age = pending.startedAt ? Date.now() - new Date(pending.startedAt).getTime() : 0
          if (age > 30 * 60 * 1000) {
            await Promise.race([
              supabase.functions.invoke("cancel-paymongo-checkout", { body: { orderId: pending.orderId } }),
              new Promise((resolve) => window.setTimeout(resolve, 8000)),
            ])
            window.localStorage.removeItem("cozycraft-pending-payment")
            flash("The unfinished checkout expired safely. You can try again.")
            return
          }

          // PayMongo redirects back before its webhook and Supabase can finish on
          // slower mobile connections. Reconcile once here, but never leave the
          // native app trapped behind the confirmation overlay if that request stalls.
          await Promise.race([
            supabase.functions.invoke("sync-paymongo-payments", { body: { orderIds: [pending.orderId] } }),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error("Payment verification timed out")), 12000)),
          ]).catch((error) => console.warn("Payment reconciliation will continue in the background", error))

          if (readPendingPayment().orderId !== pending.orderId) return

          const catalog = products.length ? products : await loadProducts() as Product[]
          let nextOrders = await Promise.race([
            loadOrders(userId, catalog),
            new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Order refresh timed out")), 12000)),
          ]) as CustomerOrder[]
          let returnedOrder = nextOrders.find((order) => order.databaseId === pending.orderId)

          // Give the webhook a short bounded window to publish the final state.
          for (let attempt = 0; !returnedOrder && attempt < 2; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1200))
            nextOrders = await Promise.race([
              loadOrders(userId, catalog),
              new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Order refresh timed out")), 8000)),
            ]) as CustomerOrder[]
            returnedOrder = nextOrders.find((order) => order.databaseId === pending.orderId)
          }

          if (disposed) return
          if (returnedOrder?.status === "Cancelled" || ["failed", "cancelled", "canceled"].includes(String(returnedOrder?.paymentStatus))) {
            window.localStorage.removeItem("cozycraft-pending-payment")
            flash("The payment was not completed. Your bag is unchanged.")
            return
          }

          // A normal launch must stay visually quiet while an abandoned or
          // still-open PayMongo checkout remains pending. Only a verified paid
          // order is allowed to open Order Confirmed without a deep-link return.
          if (!returnedOrder || returnedOrder.paymentStatus !== "paid") return
          if (readPendingPayment().orderId !== pending.orderId) return
          if (window.localStorage.getItem(LAST_PRESENTED_PAYMENT_ORDER_KEY) === pending.orderId) {
            window.localStorage.removeItem("cozycraft-pending-payment")
            return
          }

          setOrders(nextOrders)
          setCheckoutOpen(false)
          setPlacedOrder(returnedOrder)
          window.localStorage.setItem(LAST_PRESENTED_PAYMENT_ORDER_KEY, pending.orderId!)
          window.localStorage.removeItem("cozycraft-pending-payment")
          void loadCart(userId, catalog)
            .then((nextBag) => { if (!disposed) setBag(nextBag as CartLine[]) })
            .catch((error) => console.warn("Cart refresh after payment failed", error))
          flash(returnedOrder.paymentStatus === "paid" ? "Payment confirmed" : "Payment received and being verified")
        } catch (error) {
          console.error(error)
        }
      })()
    }, 900)
    return () => {
      disposed = true
      window.clearTimeout(timer)
    }
  }, [userId, products])
  const searchTerms = useMemo(
    () => expandMobileCatalogQuery(query, searchSynonyms),
    [query, searchSynonyms],
  )
  const shown = useMemo(() => {
    if (!searchTerms.length) return products
    return products.filter((product) => {
      const searchable = [
        product.name,
        product.category,
        product.subcategory,
        product.description,
        ...(product.materials || []).flatMap((material) => [material.type, material.description]),
      ].join(" ").toLocaleLowerCase("en-PH")
      return searchTerms.some((term) => searchable.includes(term))
    })
  }, [products, searchTerms])
  useEffect(() => {
    if (!userId || !search || query.trim().length < 2) return
    const timer = window.setTimeout(() => {
      void recordMobileCatalogSearch(query, shown.length).catch((error) =>
        console.warn("Unable to record catalog search", error),
      )
    }, 900)
    return () => window.clearTimeout(timer)
  }, [query, search, shown.length, userId])
  const memberPoints = loyalty?.points_balance || 0
  const lifetimeSpend = Number(loyalty?.lifetime_eligible_spend || 0)
  const completedOrderCount = useMemo(
    () => orders.filter((order) => order.status === "Delivered").length,
    [orders],
  )
  const memberTier = ({ member: "Cozy Member", plus: "Cozy Plus", premium: "Cozy Premium", elite: "Cozy Elite" } as const)[loyalty?.tier || "member"]
  useEffect(() => {
    if (!userId) {
      setLoyalty(null)
      setLoyaltyActivity([])
      setLoyaltyRedemptions([])
      return
    }
    let live = true
    const refresh = async () => {
      try {
        const [account, activity, redemptions] = await Promise.all([
          loadMobileLoyalty(),
          loadMobileLoyaltyActivity(userId),
          loadMobileRedemptions(userId),
        ])
        if (live) {
          setLoyalty(account)
          setLoyaltyActivity(activity)
          setLoyaltyRedemptions(redemptions)
        }
      } catch (error) {
        console.error("Unable to refresh Home Circle rewards", error)
      }
    }
    void refresh()
    const channel = supabase.channel(`mobile-loyalty-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mobile_loyalty_accounts", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "mobile_loyalty_transactions", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "mobile_loyalty_redemptions", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe()
    return () => {
      live = false
      void supabase.removeChannel(channel)
    }
  }, [userId])
  useEffect(() => {
    let live = true
    const resetToGuest = () => {
      if (!live) return
      setUserId("")
      setSaved([])
      setBag([])
      setOrders([])
      applyNotifications([])
      setProfile({
        name: "Guest",
        username: "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        image: "",
        gender: "",
        birth: "",
      })
    }
    const refreshCatalog = async () => {
      try {
        const next = await loadProducts()
        if (live) {
          setProducts(next as Product[])
          cacheOfflineValue(OFFLINE_CATALOG_KEY, next)
          void warmProductImageCache(next as Product[])
        }
      } catch (error) {
        console.error(error)
        if (live && navigator.onLine && !products.length) flash("We couldn't refresh the catalog. Please try again.")
      } finally {
        if (live) setCatalogLoading(false)
      }
    }
    void refreshCatalog()
    const refreshSettings = async () => {
      try {
        const settings = await loadMobileStoreSettings()
        if (live) {
          setStoreSettings(settings)
          cacheOfflineValue(OFFLINE_SETTINGS_KEY, settings)
        }
      } catch (error) { console.error(error) }
    }
    void refreshSettings()
    const catalogChannel = supabase.channel("mobile-catalog")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, refreshCatalog)
      .subscribe()
    const settingsChannel = supabase.channel("mobile-store-settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "store_settings" }, refreshSettings)
      .subscribe()
    const refreshDeliveryAreas = async () => {
      try {
        const areas = await loadMobileDeliveryServiceAreas()
        if (live && areas.length) {
          setDeliveryAreas(areas)
          cacheOfflineValue(OFFLINE_DELIVERY_AREAS_KEY, areas)
        }
      } catch (error) {
        console.error("Unable to refresh delivery areas", error)
      }
    }
    void refreshDeliveryAreas()
    const deliveryAreasChannel = supabase.channel("mobile-delivery-areas")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_service_areas" }, refreshDeliveryAreas)
      .subscribe()
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isGuestMode()) {
        resetToGuest()
        if (session) window.setTimeout(() => void enterGuestMode(), 0)
        return
      }
      setUserId(session?.user.id || "")
      if (!session?.user) {
        resetToGuest()
        return
      }
      void (async () => {
        try {
          if (!(await verifyCustomerSession(session.user.id))) {
            if (live) setUserId("")
            window.location.hash = "#/sign-in?reason=invalid-login"
            return
          }
          const [nextProfile, nextSaved, nextNotifications] = await Promise.all([
            loadProfile(session.user),
            loadWishlist(session.user.id),
            loadNotifications(session.user.id),
          ])
          if (!live) return
          setProfile(nextProfile)
          setSaved(nextSaved)
          applyNotifications(nextNotifications)
          const catalog = await loadProducts()
          const nextCart = await loadCart(session.user.id, catalog)
          if (live) setBag(nextCart as CartLine[])
          if (live) setOrders(await loadOrders(session.user.id, catalog) as CustomerOrder[])
        } catch (error) { console.error(error) }
      })()
    })
    void supabase.auth.getSession().then(({ data }) => {
      const session = data.session
      if (isGuestMode()) {
        resetToGuest()
        if (session) window.setTimeout(() => void enterGuestMode(), 0)
        return
      }
      setUserId(session?.user.id || "")
      if (session?.user) {
        void verifyCustomerSession(session.user.id).then(async (customer) => {
          if (!customer) {
            if (live) setUserId("")
            window.location.hash = "#/sign-in?reason=invalid-login"
            return null
          }
          return Promise.all([loadProfile(session.user), loadWishlist(session.user.id), loadProducts(), loadNotifications(session.user.id)])
        }).then(async (result) => {
          if (!result) return
          const [nextProfile, nextSaved, catalog, nextNotifications] = result
          if (!live) return
          setProfile(nextProfile)
          setSaved(nextSaved)
          applyNotifications(nextNotifications)
          setBag(await loadCart(session.user.id, catalog) as CartLine[])
          setOrders(await loadOrders(session.user.id, catalog) as CustomerOrder[])
        }).catch(console.error)
      }
    })
    return () => {
      live = false
      void supabase.removeChannel(catalogChannel)
      void supabase.removeChannel(settingsChannel)
      void supabase.removeChannel(deliveryAreasChannel)
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    let refreshingProfile: Promise<void> | null = null
    let lastProfileRefresh = 0
    let profileRevision = 0
    const refreshProfile = async (event?: { new?: Record<string, unknown> }) => {
      if (!active) return
      const row = event?.new
      if (row) profileRevision += 1
      // Show the verified phone immediately; the narrow refresh below also
      // synchronizes other profile fields and resolves private avatar URLs.
      if (row?.id === userId && Object.hasOwn(row, "phone_verified_at")) {
        setProfile((current) => ({
          ...current,
          phone: typeof row.phone === "string" ? row.phone : "",
          phoneVerifiedAt: typeof row.phone_verified_at === "string" ? row.phone_verified_at : null,
        }))
      }
      if (refreshingProfile) return refreshingProfile
      lastProfileRefresh = Date.now()
      const revision = profileRevision
      refreshingProfile = (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user.id !== userId) return
        const next = await loadProfile(data.session.user)
        if (active && revision === profileRevision) setProfile(next)
      } catch (error) { console.error(error) }
      finally {
        refreshingProfile = null
        if (active && revision !== profileRevision) void refreshProfile()
      }
      })()
      return refreshingProfile
    }
    const refreshCart = async () => {
      try {
        setBag(await loadCart(userId, products) as CartLine[])
      } catch (error) { console.error(error) }
    }
    const refreshWishlist = async () => {
      try {
        setSaved(await loadWishlist(userId))
      } catch (error) { console.error(error) }
    }
    const refreshOrders = async () => {
      try {
        const nextOrders = await loadOrders(userId, products) as CustomerOrder[]
        setOrders(nextOrders)
        // Realtime is state synchronization, not navigation. Refresh an order
        // confirmation only while it is still visibly open; a dismissed dialog
        // stays dismissed when PayMongo settles seconds or minutes later.
        setPlacedOrder((current) => {
          if (!current?.databaseId) return current
          return nextOrders.find((order) => order.databaseId === current.databaseId) || current
        })
      } catch (error) { console.error(error) }
    }
    const refreshNotifications = async (event?: { eventType?: string; new?: Record<string, any> }) => {
      try {
        applyNotifications(await loadNotifications(userId))
        const item = event?.new
        if (event?.eventType === "INSERT" && item && window.parent !== window) {
          window.parent.postMessage({
            type: "cozycraft-local-notification",
            title: String(item.title || "CozyCraft update"),
            body: String(item.message || "You have a new update."),
            id: String(item.id || ""),
          }, "*")
        }
      } catch (error) { console.error(error) }
    }
    const channel = supabase.channel(`mobile-commerce-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cart_items", filter: `user_id=eq.${userId}` }, refreshCart)
      .on("postgres_changes", { event: "*", schema: "public", table: "wishlist_items", filter: `user_id=eq.${userId}` }, refreshWishlist)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` }, refreshOrders)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `user_id=eq.${userId}` }, refreshOrders)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_notifications", filter: `user_id=eq.${userId}` }, refreshNotifications)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, refreshProfile)
      .subscribe((status) => { if (status === "SUBSCRIBED") void refreshProfile() })
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - lastProfileRefresh >= 5_000) void refreshProfile()
    }
    const refreshOnNativeReturn = (event: MessageEvent) => {
      if (event.source === window.parent && event.data?.type === "cozycraft-native-app-active") refreshOnReturn()
    }
    window.addEventListener("focus", refreshOnReturn)
    window.addEventListener("online", refreshOnReturn)
    document.addEventListener("visibilitychange", refreshOnReturn)
    window.addEventListener("message", refreshOnNativeReturn)
    return () => {
      active = false
      window.removeEventListener("focus", refreshOnReturn)
      window.removeEventListener("online", refreshOnReturn)
      document.removeEventListener("visibilitychange", refreshOnReturn)
      window.removeEventListener("message", refreshOnNativeReturn)
      void supabase.removeChannel(channel)
    }
  }, [products, userId])
  const flash = (x: string) => {
    setToast(x)
    window.setTimeout(() => setToast(""), 2300)
  }
  const requireAccount = () => {
    if (userId) return true
    window.location.hash = "#/sign-in"
    return false
  }
  const requireConnection = () => {
    if (online) return true
    flash("You're offline. Reconnect to make changes; browsing is still available.")
    return false
  }
  const save = (id: string) => {
    if (!requireAccount()) return
    if (!requireConnection()) return
    const active = saved.includes(id)
    setSaved((v) => (active ? v.filter((x) => x !== id) : [...v, id]))
    void toggleWishlist(userId, id, active).catch((error) => {
      console.error(error)
      setSaved((v) => (active ? [...v, id] : v.filter((x) => x !== id)))
      flash("That change could not be saved.")
    })
    flash(
      active ? "Removed from your saved pieces" : "Saved to your collection",
    )
  }
  const openProduct = (product: Product) => {
    setDetail(product)
    setRecentlyViewed((items) =>
      [product.id, ...items.filter((id) => id !== product.id)].slice(0, 6),
    )
    if (userId) void recordMobileProductView(userId, product.id).catch((error) =>
      console.warn("Unable to save recently viewed product", error),
    )
  }
  const toggleCompare = (productId: string) => {
    setCompareIds((current) => {
      if (current.includes(productId)) return current.filter((id) => id !== productId)
      if (current.length >= 3) {
        flash("Compare up to 3 pieces at a time")
        return current
      }
      return [...current, productId]
    })
  }
  const add = (p: Product) => {
    if (!requireAccount()) return
    if (!requireConnection()) return
    if (Number(p.stock ?? 0) <= 0) {
      flash("This piece is currently unavailable")
      return
    }
    setBag((lines) => {
      const existing = lines.find((line) => line.product.id === p.id)
      const quantity = Math.min((existing?.quantity || 0) + 1, p.stock ?? 99)
      void upsertCart(userId, p.id, quantity, true).catch(console.error)
      if (!existing)
        return [...lines, { product: p, quantity: 1, selected: true }]
      return lines.map((line) =>
        line.product.id === p.id
          ? {
              ...line,
              quantity: Math.min(line.quantity + 1, p.stock ?? 99),
              selected: true,
            }
          : line,
      )
    })
    flash("Added to your bag")
  }
  const moveSavedToBag = async (p: Product) => {
    if (!requireAccount() || !requireConnection() || movingSaved.includes(p.id)) return
    if (Number(p.stock ?? 0) <= 0) {
      flash("This piece is currently unavailable")
      return
    }
    const previousSaved = saved
    const previousBag = bag
    const existing = bag.find((line) => line.product.id === p.id)
    const optimisticQuantity = Math.min((existing?.quantity || 0) + 1, p.stock ?? 99)
    setMovingSaved((current) => [...current, p.id])
    setSaved((current) => current.filter((id) => id !== p.id))
    setBag((current) => existing
      ? current.map((line) => line.product.id === p.id
        ? { ...line, quantity: optimisticQuantity, selected: true }
        : line)
      : [...current, { product: p, quantity: 1, selected: true }])
    try {
      const result = await moveWishlistItemToCart(p.id)
      setBag((current) => current.map((line) => line.product.id === p.id
        ? { ...line, quantity: Math.min(result.quantity, p.stock ?? result.quantity), selected: true }
        : line))
      flash(`${p.name} moved to your bag`)
    } catch (error) {
      console.error(error)
      setSaved(previousSaved)
      setBag(previousBag)
      flash("That piece could not be moved. Your wishlist was restored.")
    } finally {
      setMovingSaved((current) => current.filter((id) => id !== p.id))
    }
  }
  const updateLine = (id: string, patch: Partial<CartLine>) => {
    if (!requireConnection()) return
    setBag((lines) =>
      lines.map((line) =>
        line.product.id === id ? (() => {
          const next = { ...line, ...patch }
          if (userId) void upsertCart(userId, id, next.quantity, next.selected).catch(console.error)
          return next
        })() : line,
      ),
    )
  }
  const removeLine = (id: string) => {
    if (!requireConnection()) return
    setBag((lines) => lines.filter((line) => line.product.id !== id))
    if (userId) void removeCart(userId, id).catch(console.error)
  }
  const bagCount = bag.reduce((sum, line) => sum + line.quantity, 0)
  const bagQuantities = useMemo(
    () => Object.fromEntries(bag.map((line) => [line.product.id, line.quantity])),
    [bag],
  )
  const homeRecommendations = useMemo(
    () => buildMobileRecommendations({
      products,
      savedIds: saved,
      bagProductIds: bag.map((line) => line.product.id),
      recentlyViewedIds: recentlyViewed,
      orders,
      limit: 4,
    }),
    [bag, orders, products, recentlyViewed, saved],
  )
  // Home is deliberately centered so the primary destination is always
  // reachable with either thumb and remains the visual anchor of the dock.
  const nav = ["shop", "saved", "home", "bag", "account"]
  const isIOS26Glass = () => document.documentElement.classList.contains("cozy-platform-ios26")
  const navigateTo = (destination: string) => {
    setSearch(false)
    setDetail(null)
    setCheckoutOpen(false)
    setPlacedOrder(null)
    setProfileOpen(false)
    setCategoryOpen(null)
    setNotificationsOpen(false)
    setMembershipOpen(false)
    setTab(destination)
  }

  useEffect(() => {
    if (navGlassPointer.current || navGlassTouch.current) return
    const activeIndex = nav.indexOf(tab)
    if (activeIndex >= 0) {
      setNavGlassIndex(activeIndex)
      setNavGlassPosition(10 + activeIndex * 20)
    }
  }, [tab])

  const navIndexAt = (dock: HTMLElement, clientX: number) => {
    const buttons = Array.from(dock.querySelectorAll<HTMLButtonElement>("button[data-nav]"))
    if (!buttons.length) return 0
    return buttons.reduce((closest, button, index) => {
      const bounds = button.getBoundingClientRect()
      const distance = Math.abs(clientX - (bounds.left + bounds.width / 2))
      return distance < closest.distance ? { index, distance } : closest
    }, { index: 0, distance: Number.POSITIVE_INFINITY }).index
  }

  const navPositionAt = (dock: HTMLElement, clientX: number) => {
    const bounds = dock.getBoundingClientRect()
    if (!bounds.width) return 50
    return Math.max(8, Math.min(92, ((clientX - bounds.left) / bounds.width) * 100))
  }

  const beginNavGlassScrub = (event: React.PointerEvent<HTMLElement>) => {
    if (!isIOS26Glass()) return
    if (event.pointerType === "touch") return
    if (event.pointerType === "mouse" && event.button !== 0) return
    const index = navIndexAt(event.currentTarget, event.clientX)
    navGlassPointer.current = { pointerId: event.pointerId, index }
    setNavGlassIndex(index)
    setNavGlassPosition(navPositionAt(event.currentTarget, event.clientX))
    setNavGlassScrubbing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveNavGlassScrub = (event: React.PointerEvent<HTMLElement>) => {
    const pointer = navGlassPointer.current
    if (!pointer) {
      if (event.pointerType === "mouse" && isIOS26Glass()) {
        setNavGlassIndex(navIndexAt(event.currentTarget, event.clientX))
        setNavGlassPosition(navPositionAt(event.currentTarget, event.clientX))
      }
      return
    }
    if (pointer.pointerId !== event.pointerId) return
    const index = navIndexAt(event.currentTarget, event.clientX)
    setNavGlassPosition(navPositionAt(event.currentTarget, event.clientX))
    if (index !== pointer.index) {
      pointer.index = index
      setNavGlassIndex(index)
    }
  }

  const finishNavGlassScrub = (event: React.PointerEvent<HTMLElement>, commit: boolean) => {
    const pointer = navGlassPointer.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    navGlassPointer.current = null
    setNavGlassScrubbing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (commit) {
      suppressNavClick.current = true
      setNavGlassPosition(10 + pointer.index * 20)
      navigateTo(nav[pointer.index])
    } else {
      const activeIndex = nav.indexOf(tab)
      setNavGlassIndex(activeIndex >= 0 ? activeIndex : 2)
      setNavGlassPosition(10 + (activeIndex >= 0 ? activeIndex : 2) * 20)
    }
  }

  const beginNavGlassTouch = (event: React.TouchEvent<HTMLElement>) => {
    if (!isIOS26Glass()) return
    const touch = event.touches[0]
    if (!touch) return
    const index = navIndexAt(event.currentTarget, touch.clientX)
    navGlassTouch.current = { index }
    setNavGlassIndex(index)
    setNavGlassPosition(navPositionAt(event.currentTarget, touch.clientX))
    setNavGlassScrubbing(true)
  }

  const moveNavGlassTouch = (event: React.TouchEvent<HTMLElement>) => {
    const activeTouch = navGlassTouch.current
    const touch = event.touches[0]
    if (!activeTouch || !touch) return
    const index = navIndexAt(event.currentTarget, touch.clientX)
    setNavGlassPosition(navPositionAt(event.currentTarget, touch.clientX))
    if (index !== activeTouch.index) {
      activeTouch.index = index
      setNavGlassIndex(index)
    }
  }

  const finishNavGlassTouch = (event: React.TouchEvent<HTMLElement>, commit: boolean) => {
    const activeTouch = navGlassTouch.current
    if (!activeTouch) return
    const releasedTouch = event.changedTouches[0]
    if (releasedTouch) {
      activeTouch.index = navIndexAt(event.currentTarget, releasedTouch.clientX)
      setNavGlassIndex(activeTouch.index)
      setNavGlassPosition(navPositionAt(event.currentTarget, releasedTouch.clientX))
    }
    navGlassTouch.current = null
    setNavGlassScrubbing(false)
    if (commit) {
      suppressNavClick.current = true
      setNavGlassPosition(10 + activeTouch.index * 20)
      navigateTo(nav[activeTouch.index])
    } else {
      const activeIndex = nav.indexOf(tab)
      setNavGlassIndex(activeIndex >= 0 ? activeIndex : 2)
      setNavGlassPosition(10 + (activeIndex >= 0 ? activeIndex : 2) * 20)
    }
  }

  const returnScrollRestored = useRef(false)
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".lux-body")
    if (!scroller) return
    if (!returnScrollRestored.current && returnState?.tab === tab) {
      const frame = window.requestAnimationFrame(() => {
        scroller.scrollTo({ top: returnState.scrollTop, behavior: "auto" })
        returnScrollRestored.current = true
        clearStorefrontReturnState()
      })
      return () => window.cancelAnimationFrame(frame)
    }
    scroller.scrollTo({ top: 0, behavior: "smooth" })
  }, [returnState, tab])

  return (
    <main className="lux-shell">
      <section className="lux-phone">
        {(!online || reconnected) && (
          <aside className={`connection-banner ${online ? "is-online" : "is-offline"}`} role="status" aria-live="polite">
            <span className="material-symbols-rounded" aria-hidden="true">{online ? "cloud_done" : "cloud_off"}</span>
            <div>
              <b>{online ? "Back online" : "You're offline"}</b>
              <small>{online ? "CozyCraft is syncing the latest updates." : "You can browse saved products. Account changes and checkout need a connection."}</small>
            </div>
          </aside>
        )}
        <header className="lux-header">
          <button className="logo-button" onClick={() => navigateTo("home")}>
            <img src={cozyLogo} alt="CozyCraft Furniture" />
          </button>
          <div>
            <button
              className="round-icon"
              onClick={() => setSearch(true)}
              aria-label="Search CozyCraft"
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                search
              </span>
            </button>
            <button
              className="round-icon notification-trigger"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Open notifications"
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                notifications
              </span>
              {unreadNotificationCount > 0 && (
                <i><span>{Math.min(99, unreadNotificationCount)}</span></i>
              )}
            </button>
            <button
              className="round-icon profile-trigger"
              onClick={() => setProfileOpen(true)}
              aria-label="Open profile"
            >
              {profile.image ? (
                <img
                  key={`${profile.image}-${resourceRevision}`}
                  src={reconnectResourceUrl(profile.image, resourceRevision)}
                  alt=""
                  onError={(event) => {
                    if (!online) return
                    const image = event.currentTarget
                    const retries = Number(image.dataset.retries || "0")
                    if (retries >= 2) return
                    image.dataset.retries = String(retries + 1)
                    window.setTimeout(() => {
                      image.src = reconnectResourceUrl(profile.image, Date.now())
                    }, 700 * (retries + 1))
                  }}
                />
              ) : (
                <span>
                  {profile.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
              )}
            </button>
          </div>
        </header>
        <aside
          className={`mobile-benefit-bar ${storeSettings.announcement_enabled && storeSettings.announcement_text ? "is-announcement" : ""}`}
          onClick={() => {
            const link = storeSettings.announcement_link
            if (!link) return
            if (/^https:\/\//i.test(link)) window.open(link, "_blank", "noopener,noreferrer")
            else if (link.includes("new-arrivals") || link.includes("shop")) setTab("shop")
          }}
        >
          {storeSettings.announcement_enabled && storeSettings.announcement_text ? (
            <span className="live-announcement">
              <i className="material-symbols-rounded">campaign</i>
              <b>STORE UPDATE</b>{storeSettings.announcement_text}
              {storeSettings.announcement_link && <em>Explore →</em>}
            </span>
          ) : <>
            <span>
              <i className="material-symbols-rounded">local_shipping</i>
              Delivery fees and timing based on your address
            </span>
            <span>
              <i className="material-symbols-rounded">verified</i>
              {Number(storeSettings.fulfillment_settings.return_window_days || 0) > 0
                ? `${storeSettings.fulfillment_settings.return_window_days}-day returns & care`
                : "CozyCraft care guarantee"}
            </span>
          </>}
        </aside>
        <section className="lux-body">
          {tab === "home" && (
            <>
              <section className="home-intro">
                <p className="hello">{currentDateLabel}</p>
                <h1>
                  {launchHeadline.lead}
                  <br />
                  <em>{launchHeadline.emphasis}</em>
                </h1>
              </section>
              <section
                className="home-hero home-showcase"
                aria-roledescription="carousel"
                aria-label="CozyCraft featured collections"
                onTouchStart={(event) => { heroTouchStart.current = event.touches[0]?.clientX ?? null }}
                onTouchEnd={(event) => {
                  if (heroTouchStart.current === null) return
                  const distance = (event.changedTouches[0]?.clientX ?? heroTouchStart.current) - heroTouchStart.current
                  heroTouchStart.current = null
                  if (Math.abs(distance) < 45) return
                  setHeroIndex((current) => distance < 0
                    ? (current + 1) % heroShowcases.length
                    : (current - 1 + heroShowcases.length) % heroShowcases.length)
                }}
              >
                <div className="home-showcase-track" style={{ transform: `translateX(-${heroIndex * 100}%)` }}>
                  {heroShowcases.map((slide, index) => (
                    <article className="home-showcase-slide" aria-hidden={heroIndex !== index} key={`${slide.eyebrow}-${index}`}>
                      <img src={slide.image} alt={heroIndex === index ? slide.alt : ""} loading={index === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} />
                      <div className="home-hero-copy">
                        <p>{slide.eyebrow}</p>
                        <h2>{slide.title}{slide.emphasis && <><br /><em>{slide.emphasis}</em></>}</h2>
                        {slide.note && <small className="home-showcase-note">{slide.note}</small>}
                        <button
                          tabIndex={heroIndex === index ? 0 : -1}
                          onClick={() => {
                            const destination = slide.query.toLocaleLowerCase("en-PH")
                            setQuery(destination.includes("new-arrivals") ? "New" : destination.includes("living") ? "" : slide.query)
                            if (destination.includes("living")) setShopRoom("living")
                            setTab("shop")
                          }}
                        >
                          {slide.action} <b>→</b>
                        </button>
                      </div>
                      <span className="hero-number">{String(index + 1).padStart(2, "0")}</span>
                    </article>
                  ))}
                </div>
                <nav className="home-showcase-dots" aria-label="Choose featured collection">
                  {heroShowcases.map((slide, index) => (
                    <button
                      className={heroIndex === index ? "active" : ""}
                      aria-label={`Show ${slide.eyebrow.toLowerCase()}`}
                      aria-current={heroIndex === index ? "true" : undefined}
                      onClick={() => setHeroIndex(index)}
                      key={`${slide.eyebrow}-${index}`}
                    />
                  ))}
                </nav>
              </section>
              <section className="home-rooms category-rooms">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setCategoryOpen(category)}
                  >
                    <img src={category.image} alt="" />
                    <span>
                      {category.title}
                      <small>{category.note}</small>
                      <b>↗</b>
                    </span>
                  </button>
                ))}
              </section>
              <section
                className="discovery-chips"
                aria-label="Popular searches"
              >
                {[
                  "New arrivals",
                  "Small spaces",
                  "Under ₱10,000",
                  "Bestsellers",
                ].map((label) => (
                  <button
                    key={label}
                    onClick={() => {
                      setQuery(
                        label === "Under ₱10,000" ? "" : label.split(" ")[0],
                      )
                      setTab("shop")
                    }}
                  >
                    {label}
                  </button>
                ))}
              </section>
              <section className="member-editorial">
                <div>
                  <p className="hello">COZYCRAFT HOME CIRCLE</p>
                  <h2>
                    Considered living,
                    <br />
                    <em>with more to love.</em>
                  </h2>
                  <span>
                    Earn points, preview new collections and receive personal
                    delivery notes.
                  </span>
                  <button onClick={() => userId ? setMembershipOpen(true) : requireAccount()}>
                    Explore membership →
                  </button>
                </div>
                <b>
                  {memberPoints.toLocaleString()}<small>POINTS</small>
                </b>
              </section>
              <SectionTitle
                title="New to the edit"
                action={() => setTab("shop")}
              />
              {catalogLoading && <p className="hello">REFRESHING THE CATALOG…</p>}
              <div className="lux-grid home-products">
                {products.slice(0, 2).map((p) => (
                  <Card
                    key={p.id}
                    p={p}
                    saved={saved.includes(p.id)}
                    bagQuantity={bagQuantities[p.id] || 0}
                    save={() => save(p.id)}
                    add={() => add(p)}
                    open={() => openProduct(p)}
                  />
                ))}
              </div>
              {homeRecommendations.length > 0 && (
                <section className="home-recommendations" aria-labelledby="home-recommendations-title">
                  <header>
                    <div>
                      <p className="hello">YOUR HOME, CONSIDERED</p>
                      <h2 id="home-recommendations-title">Selected <em>for you.</em></h2>
                      <small>Thoughtful matches from your saved pieces, browsing, and favourite rooms.</small>
                    </div>
                    <button type="button" onClick={() => setTab("shop")}>See all <span aria-hidden="true">→</span></button>
                  </header>
                  <div className="home-recommendation-rail">
                    {homeRecommendations.map(({ product: p, reason }) => (
                      <article key={p.id}>
                        <span className="recommendation-reason"><i className="material-symbols-rounded" aria-hidden="true">auto_awesome</i>{reason}</span>
                        <Card
                          p={p}
                          saved={saved.includes(p.id)}
                          bagQuantity={bagQuantities[p.id] || 0}
                          save={() => save(p.id)}
                          add={() => add(p)}
                          open={() => openProduct(p)}
                        />
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <section className="home-service-grid">
                {[
                  {
                    icon: "chair",
                    title: "Room planning",
                    note: "Build a space that works",
                  },
                  {
                    icon: "local_shipping",
                    title: "Careful delivery",
                    note: "Placed exactly where you want it",
                  },
                  {
                    icon: "support_agent",
                    title: "CozyCraft Care",
                    note: "Human support when you need it",
                  },
                ].map((item) => (
                  <article key={item.title}>
                    <span className="material-symbols-rounded">
                      {item.icon}
                    </span>
                    <div>
                      <b>{item.title}</b>
                      <small>{item.note}</small>
                    </div>
                  </article>
                ))}
              </section>
              {recentlyViewed.length > 0 && (
                <>
                  <SectionTitle
                    title="Recently viewed"
                    action={() => setTab("shop")}
                  />
                  <div className="horizontal-product-rail">
                    {recentlyViewed
                      .map((id) =>
                        products.find((product) => product.id === id),
                      )
                      .filter(Boolean)
                      .map((product) => {
                        const p = product as Product
                        return (
                          <Card
                            key={p.id}
                            p={p}
                            saved={saved.includes(p.id)}
                            bagQuantity={bagQuantities[p.id] || 0}
                            save={() => save(p.id)}
                            add={() => add(p)}
                            open={() => openProduct(p)}
                          />
                        )
                      })}
                  </div>
                </>
              )}
            </>
          )}
          {tab === "shop" && (
            <ShopPage
              products={products}
              roomId={shopRoom}
              subcategory={shopSubcategory}
              setRoom={(id) => {
                setShopRoom(id)
                setShopSubcategory("")
              }}
              setSubcategory={setShopSubcategory}
              openProduct={openProduct}
              saved={saved}
              bagQuantities={bagQuantities}
              save={save}
              add={add}
            />
          )}
          {tab === "saved" && (
            <Collection
              title="Saved pieces"
              kicker="YOUR PRIVATE LIST"
              icon="♡"
              items={products.filter((p) => saved.includes(p.id))}
              empty="Save the pieces you want to live with."
              saved={saved}
              bagQuantities={bagQuantities}
              save={save}
              add={moveSavedToBag}
              movingIds={movingSaved}
              open={openProduct}
            />
          )}
          {tab === "bag" && (
            <Bag
              userId={userId}
              lines={bag}
              deliveryAreas={deliveryAreas}
              open={openProduct}
              clear={() => {
                if (!requireConnection()) return
                bag.forEach((line) => void removeCart(userId, line.product.id).catch(console.error))
                setBag([])
              }}
              remove={removeLine}
              update={updateLine}
              checkout={() => {
                if (requireConnection()) setCheckoutOpen(true)
              }}
            />
          )}
          {tab === "account" && (
            <Account
              userId={userId}
              flash={flash}
              name={profile.name}
              email={profile.email}
              image={profile.image}
              orders={orders}
              points={memberPoints}
              tier={memberTier}
              lifetimeSpend={lifetimeSpend}
              completedOrders={completedOrderCount}
              savedCount={saved.length}
              bagCount={bagCount}
              unreadNotificationCount={unreadNotificationCount}
              pushPermission={pushPermission}
              enableNotifications={requestPushPermission}
              openMembership={() => setMembershipOpen(true)}
              edit={() => setProfileOpen(true)}
              shop={() => setTab("shop")}
              reviewPublished={(orderItemId, review) => {
                setOrders((current) => current.map((order) => ({
                  ...order,
                  items: order.items.map((line) => line.orderItemId === orderItemId ? {
                    ...line,
                    reviewId: String(review?.id || "submitted"),
                    reviewRating: Number(review?.rating || 0),
                    reviewBody: String(review?.body || ""),
                    reviewImages: Array.isArray(review?.image_urls) ? review.image_urls : [],
                  } : line),
                })))
              }}
            />
          )}
        </section>
        {!chatOpen && !checkoutOpen && !detail && !compareOpen && !search && <nav
          className={`lux-nav${navGlassScrubbing ? " is-glass-scrubbing" : ""}`}
          onPointerDown={beginNavGlassScrub}
          onPointerMove={moveNavGlassScrub}
          onPointerUp={(event) => finishNavGlassScrub(event, true)}
          onPointerCancel={(event) => finishNavGlassScrub(event, false)}
          onTouchStart={beginNavGlassTouch}
          onTouchMove={moveNavGlassTouch}
          onTouchEnd={(event) => finishNavGlassTouch(event, true)}
          onTouchCancel={(event) => finishNavGlassTouch(event, false)}
          onPointerLeave={() => {
            if (navGlassPointer.current || navGlassTouch.current) return
            const activeIndex = nav.indexOf(tab)
            setNavGlassIndex(activeIndex >= 0 ? activeIndex : 2)
            setNavGlassPosition(10 + (activeIndex >= 0 ? activeIndex : 2) * 20)
          }}
        >
          <span
            className="lux-nav-lens"
            style={{ left: `${navGlassPosition}%` }}
            aria-hidden="true"
          />
          {nav.map((id, index) => (
            <button
              key={id}
              data-nav={id}
              aria-label={
                id === "saved"
                  ? `Wishlist, ${saved.length} product${saved.length === 1 ? "" : "s"}`
                  : id === "bag"
                    ? `Bag, ${bagCount} item${bagCount === 1 ? "" : "s"}`
                    : id
              }
              className={`${tab === id ? "active" : ""}${navGlassIndex === index ? " glass-target" : ""}`.trim()}
              aria-current={tab === id ? "page" : undefined}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && isIOS26Glass() && !navGlassPointer.current && !navGlassTouch.current) {
                  setNavGlassIndex(index)
                  setNavGlassPosition(10 + index * 20)
                }
              }}
              onClick={(event) => {
                if (suppressNavClick.current) {
                  suppressNavClick.current = false
                  event.preventDefault()
                  return
                }
                setNavGlassIndex(index)
                setNavGlassPosition(10 + index * 20)
                navigateTo(id)
              }}
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                {glyph[id]}
                {id === "saved" && saved.length > 0 ? (
                  <i aria-hidden="true">
                    {saved.length > 99 ? "99+" : saved.length}
                  </i>
                ) : null}
                {id === "bag" && bagCount > 0 ? (
                  <i aria-hidden="true">
                    {bagCount > 99 ? "99+" : bagCount}
                  </i>
                ) : null}
              </span>
            </button>
          ))}
        </nav>}
        {!detail && !compareOpen && !search && <MobileCareChat
          userId={userId}
          products={products}
          onOpenChange={setChatOpen}
          openProduct={(product) => openProduct(product)}
          openOrders={() => navigateTo("account")}
        />}
        {notificationsOpen && (
          <NotificationsPage
            items={notifications}
            userId={userId}
            close={() => setNotificationsOpen(false)}
            refresh={async () => userId && applyNotifications(await loadNotifications(userId))}
          />
        )}
        {membershipOpen && (
          <MembershipPage
            points={memberPoints}
            tier={memberTier}
            lifetimeSpend={lifetimeSpend}
            orderCount={completedOrderCount}
            activity={loyaltyActivity}
            redemptions={loyaltyRedemptions}
            redeem={async (points) => {
              await redeemMobilePoints(points)
              setLoyalty(await loadMobileLoyalty())
              setLoyaltyActivity(await loadMobileLoyaltyActivity(userId))
              setLoyaltyRedemptions(await loadMobileRedemptions(userId))
              flash(`${points} points redeemed successfully`)
            }}
            close={() => setMembershipOpen(false)}
            shop={() => { setMembershipOpen(false); setTab("shop") }}
          />
        )}
        {categoryOpen && (
          <CategoryPage
            category={categoryOpen}
            close={() => setCategoryOpen(null)}
            select={(id, item) => {
              setShopRoom(id)
              setShopSubcategory(item)
              setCategoryOpen(null)
              setTab("shop")
            }}
          />
        )}
        {profileOpen && (
            <ProfilePage
            name={profile.name}
            email={profile.email}
            phone={profile.phone}
            phoneVerifiedAt={profile.phoneVerifiedAt ?? null}
            onPhoneVerified={(verified) => setProfile((current) => ({ ...current, ...verified }))}
            image={profile.image}
            username={profile.username}
            firstName={profile.firstName}
            lastName={profile.lastName}
            gender={profile.gender}
            birth={profile.birth}
            points={memberPoints}
            tier={memberTier}
            completedOrders={completedOrderCount}
            savedCount={saved.length}
            userId={userId}
            openWishlist={() => {
              setProfileOpen(false)
              setTab("saved")
            }}
            close={() => setProfileOpen(false)}
            save={async (nextProfile) => {
              if (!userId) throw new Error("Please sign in before saving your profile.")
              if (!requireConnection()) throw new Error("You’re offline. Reconnect to save your profile changes.")
              await saveProfile(userId, nextProfile)
              const { data } = await supabase.auth.getSession()
              if (data.session?.user.id === userId) setProfile(await loadProfile(data.session.user))
              flash("Profile updated successfully")
            }}
          />
        )}
        {detail && (
          <ProductDetail
            p={detail}
            saved={saved.includes(detail.id)}
            compared={compareIds.includes(detail.id)}
            deliveryAreas={deliveryAreas}
            userId={userId}
            close={() => setDetail(null)}
            save={() => save(detail.id)}
            compare={() => toggleCompare(detail.id)}
            add={() => {
              add(detail)
              setDetail(null)
            }}
          />
        )}
        {compareIds.length > 0 && !compareOpen && !checkoutOpen && !placedOrder && !detail && !search && (
          <aside className="compare-tray" aria-label={`${compareIds.length} products selected for comparison`}>
            <span><b>{compareIds.length}</b><small>piece{compareIds.length === 1 ? "" : "s"} to compare</small></span>
            <button type="button" onClick={() => setCompareOpen(true)}>Compare now <span aria-hidden="true">→</span></button>
            <button type="button" className="compare-tray-close" aria-label="Clear comparison" onClick={() => setCompareIds([])}>×</button>
          </aside>
        )}
        {compareOpen && (
          <CompareSheet
            products={compareIds.map((id) => products.find((product) => product.id === id)).filter(Boolean) as Product[]}
            close={() => setCompareOpen(false)}
            remove={toggleCompare}
            open={(product) => { setCompareOpen(false); openProduct(product) }}
          />
        )}
        {checkoutOpen && (
          <CheckoutPage
            userId={userId}
            lines={bag.filter((line) => line.selected)}
            profile={profile}
            storeSettings={storeSettings}
            deliveryAreas={deliveryAreas}
            redemptions={loyaltyRedemptions.filter((reward) => reward.status === "available" && new Date(reward.expires_at).getTime() > Date.now())}
            close={() => setCheckoutOpen(false)}
            complete={(order) => {
              setOrders((current) => [order, ...current])
              setBag((current) => current.filter((line) => !line.selected))
              setCheckoutOpen(false)
              setPlacedOrder(order)
            }}
          />
        )}
        {placedOrder && (
          <OrderComplete
            order={placedOrder}
            pushPermission={pushPermission}
            enableNotifications={requestPushPermission}
            close={() => setPlacedOrder(null)}
            goHome={() => {
              setPlacedOrder(null)
              setTab("home")
            }}
          />
        )}
        {paymentReturning && !placedOrder && (
          <section className="payment-returning" role="status" aria-live="polite">
            <div><span className="material-symbols-rounded">verified_user</span><p className="hello">SECURE PAYMENT</p><h2>Confirming your order…</h2><p>Keep CozyCraft open while PayMongo and the store securely confirm your payment.</p><i aria-hidden="true" /></div>
          </section>
        )}
        {search && (
          <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search CozyCraft furniture">
            <header className="search-premium-header">
              <button className="dismiss" onClick={() => setSearch(false)} aria-label="Close search">
                <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
              </button>
              <div>
                <p>COZYCRAFT DISCOVERY</p>
                <h1>Find your piece.</h1>
              </div>
              <span className="search-header-mark material-symbols-rounded" aria-hidden="true">chair</span>
            </header>
            <div className="search-input-shell">
              <span className="material-symbols-rounded" aria-hidden="true">search</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search furniture and rooms"
                aria-label="Search furniture"
                inputMode="search"
                enterKeyHint="search"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search">
                  <span className="material-symbols-rounded" aria-hidden="true">close</span>
                </button>
              )}
            </div>
            {!query && (
              <section className="search-discovery">
                <p>POPULAR DISCOVERIES</p>
                <div>
                  {["Cloud sofa", "Dining chairs", "Storage", "Lighting"].map(
                    (term) => (
                      <button key={term} onClick={() => setQuery(term)}>
                        {term}
                        <span className="material-symbols-rounded" aria-hidden="true">north_east</span>
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}
            {query && shown.length > 0 && (
              <p className="search-result-meta">{shown.length} {shown.length === 1 ? "piece" : "pieces"} found</p>
            )}
            <div className="search-list">
              {shown.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSearch(false)
                    openProduct(p)
                  }}
                >
                  <img src={p.image} alt="" loading="lazy" decoding="async" />
                  <span>
                    {p.name}
                    <small>{p.category}</small>
                  </span>
                  <b>{p.price}</b>
                  <i className="material-symbols-rounded" aria-hidden="true">arrow_forward</i>
                </button>
              ))}
              {query && shown.length === 0 && (
                <section className="search-empty">
                  <span className="material-symbols-rounded">search_off</span>
                  <h2>No pieces found</h2>
                  <p>Try a room, material or furniture type.</p>
                  <button onClick={() => setQuery("")}>Clear search</button>
                </section>
              )}
            </div>
          </div>
        )}
        {toast && (
          <aside className="lux-toast" role="status">
            <span>✓</span>
            {toast}
            <button onClick={() => setToast("")}>×</button>
          </aside>
        )}
      </section>
    </main>
  )
}
type MobileChatMessage = { role: "user" | "assistant"; content: string; createdAt: string }

function MobileCareChat({ userId, products, openProduct, openOrders, onOpenChange }: {
  userId: string
  products: Product[]
  openProduct: (product: Product) => void
  openOrders: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [messages, setMessages] = useStoredState<MobileChatMessage[]>(`cozycraft-mobile-chat-${userId || "guest"}`, [{ role: "assistant", content: "Welcome to CozyCraft Care. Tell me what you’re looking for, or ask about an order, delivery, or your account.", createdAt: new Date().toISOString() }])
  const endRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
  const quickPrompts = [
    { label: "Find pieces in my budget", icon: "chair" },
    { label: "Help with a small room", icon: "space_dashboard" },
    { label: "Track my latest order", icon: "local_shipping" },
    { label: "Explain delivery options", icon: "home_pin" },
  ]
  const recommended = useMemo(() => {
    const latest = [...messages].reverse().find((message) => message.role === "assistant")?.content.toLowerCase() || ""
    return products.filter((product) => latest.includes(product.name.toLowerCase())).slice(0, 3)
  }, [messages, products])
  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => endRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "end",
    }))
    return () => window.cancelAnimationFrame(frame)
  }, [messages, sending, open])
  useEffect(() => {
    const field = draftRef.current
    if (!field) return
    field.style.height = "auto"
    field.style.height = `${Math.min(Math.max(field.scrollHeight, 48), 112)}px`
  }, [draft])
  useEffect(() => {
    document.documentElement.classList.toggle("cozy-chat-open", open)
    onOpenChange(open)
    return () => document.documentElement.classList.remove("cozy-chat-open")
  }, [open, onOpenChange])
  const send = async (value = draft) => {
    const message = value.trim()
    if (!message || sending) return
    const history = messages.slice(-10).map(({ role, content }) => ({ role, content }))
    setDraft("")
    setError("")
    setSending(true)
    setMessages((current) => [...current, { role: "user", content: message, createdAt: new Date().toISOString() }])
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("cozycraft-assistant", { body: { message, history, client: "mobile" } })
      if (invokeError) throw invokeError
      if (typeof data?.reply !== "string" || !data.reply.trim()) throw new Error(data?.error || "Cozy returned an empty response.")
      setMessages((current) => [...current, { role: "assistant", content: data.reply.trim(), createdAt: new Date().toISOString() }])
    } catch (requestError) {
      console.error(requestError)
      setError(navigator.onLine ? "Cozy couldn’t respond just now. Please try again." : "You’re offline. Reconnect and try sending again.")
    } finally { setSending(false) }
  }
  const resetConversation = () => {
    setError("")
    setDraft("")
    setMessages([{ role: "assistant", content: "A fresh start. How can CozyCraft Care help with your home today?", createdAt: new Date().toISOString() }])
  }
  const isNewConversation = messages.length === 1 && messages[0]?.role === "assistant"
  return <>
    {!open && <button className="mobile-ai-launcher" onClick={() => setOpen(true)} aria-label="Open CozyCraft Care"><span className="material-symbols-rounded">chat_bubble</span><i/><b>Care</b></button>}
    {open && <section className="mobile-ai-chat" role="dialog" aria-modal="true" aria-label="CozyCraft customer care chat">
      <header>
        <button onClick={() => setOpen(false)} aria-label="Minimize CozyCraft Care"><span className="material-symbols-rounded">keyboard_arrow_down</span></button>
        <div className="ai-care-brand"><span aria-hidden="true">C</span><p><b>CozyCraft Care</b><small><i/>Online · Shopping and order support</small></p></div>
        <button onClick={resetConversation} aria-label="Start a new conversation"><span className="material-symbols-rounded">edit_square</span></button>
      </header>
      <main>
        {isNewConversation && <section className="ai-welcome"><p className="hello">PERSONAL SHOPPING & CARE</p><h2>Thoughtful help,<br/><em>right when you need it.</em></h2><span>Explore the live collection, compare pieces, or get help with delivery and your latest orders.</span></section>}
        {isNewConversation && <section className="ai-quick-prompts" aria-label="Popular ways CozyCraft Care can help"><p className="hello">HOW CAN WE HELP?</p><div>{quickPrompts.map((prompt) => <button type="button" key={prompt.label} disabled={sending} onClick={() => void send(prompt.label)}><span className="material-symbols-rounded" aria-hidden="true">{prompt.icon}</span><b>{prompt.label}</b><i className="material-symbols-rounded" aria-hidden="true">arrow_forward</i></button>)}</div></section>}
        <section className={`ai-conversation ${isNewConversation ? "is-new" : ""}`} aria-label="Conversation">
          {!isNewConversation && <p className="hello ai-conversation-label">YOUR CONVERSATION</p>}
          <div className="ai-message-list" aria-live="polite">{messages.map((message, index) => <article className={message.role} key={`${message.createdAt}-${index}`}><header>{message.role === "assistant" && <span aria-hidden="true">C</span>}<small>{message.role === "assistant" ? "CozyCraft Care" : "You"}</small><time>{new Date(message.createdAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</time></header><p>{message.content}</p></article>)}{sending && <article className="assistant typing"><header><span aria-hidden="true">C</span><small>CozyCraft Care</small></header><p aria-label="CozyCraft Care is replying"><i/><i/><i/></p></article>}</div>
        </section>
        {recommended.length > 0 && <section className="ai-product-rail"><p className="hello">PIECES MENTIONED</p><div>{recommended.map((product) => <button key={product.id} onClick={() => { setOpen(false); openProduct(product) }}><img src={product.image} alt=""/><span><b>{product.name}</b><small>{product.price}</small></span><i>→</i></button>)}</div></section>}
        {messages.some((message) => /order|track|delivery status/i.test(message.content)) && userId && <button className="ai-order-link" onClick={() => { setOpen(false); openOrders() }}>Open my orders <b>→</b></button>}
        {error && <p className="ai-error" role="alert">{error}<button onClick={() => void send(messages.filter((message) => message.role === "user").at(-1)?.content || "")}>Retry</button></p>}
        <div ref={endRef}/>
      </main>
      <form onSubmit={(event) => { event.preventDefault(); void send() }}><div className="ai-composer"><textarea ref={draftRef} rows={1} value={draft} disabled={sending} aria-label="Message CozyCraft Care" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send() } }} onFocus={(event) => window.setTimeout(() => event.currentTarget.scrollIntoView({ block: "nearest" }), 180)} placeholder="Message CozyCraft Care" maxLength={2000}/><button disabled={!draft.trim() || sending} aria-label={sending ? "Sending message" : "Send message"}><span className="material-symbols-rounded">arrow_upward</span></button></div><p>Automated replies may be imperfect. Confirm important payment and order details.</p></form>
      <footer>Secure CozyCraft customer care</footer>
    </section>}
  </>
}
function SectionTitle({ title, action }: { title: string; action: () => void }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <button onClick={action}>See all →</button>
    </div>
  )
}
function Card({
  p,
  saved,
  bagQuantity,
  save,
  add,
  open,
  addLabel,
  addBusy = false,
}: {
  p: Product
  saved: boolean
  bagQuantity: number
  save: () => void
  add: () => void
  open: () => void
  addLabel?: string
  addBusy?: boolean
}) {
  const [isolatedImage, setIsolatedImage] = useState(false)
  return (
    <article className="lux-card">
      <div className="card-image">
        <button
          className="image-button"
          onClick={open}
          aria-label={`View ${p.name}`}
        >
          <img
            crossOrigin="anonymous"
            src={p.image}
            alt={p.alt}
            loading="lazy"
            decoding="async"
            className={isolatedImage ? "is-isolated-product" : ""}
            onLoad={(event) => {
              const image = event.currentTarget
              try {
                const sample = document.createElement("canvas")
                sample.width = 24
                sample.height = 24
                const context = sample.getContext("2d", { willReadFrequently: true })
                if (!context) return
                context.drawImage(image, 0, 0, 24, 24)
                const pixels = context.getImageData(0, 0, 24, 24).data
                const cornerIndexes = [0, 23, 552, 575]
                const background = cornerIndexes.reduce((total, pixelIndex) => {
                  const index = pixelIndex * 4
                  total[0] += pixels[index]
                  total[1] += pixels[index + 1]
                  total[2] += pixels[index + 2]
                  return total
                }, [0, 0, 0]).map((value) => value / 4)
                let backgroundLike = 0
                for (let index = 0; index < pixels.length; index += 4) {
                  const red = pixels[index]
                  const green = pixels[index + 1]
                  const blue = pixels[index + 2]
                  const distance = Math.hypot(
                    red - background[0],
                    green - background[1],
                    blue - background[2],
                  )
                  if (distance < 34) backgroundLike += 1
                }
                setIsolatedImage(backgroundLike / 576 > .42)
              } catch {
                // Cross-origin product images keep the standard, distortion-free crop.
              }
            }}
          />
        </button>
        {p.label && <span>{p.label}</span>}
        <button
          onClick={(event) => {
            if (!saved) flyProductTo(event, "saved", p)
            save()
          }}
          aria-label="Save this item"
          aria-pressed={saved}
          className={`card-save ${saved ? "is-saved" : ""}`}
        >
          <svg className="card-heart" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21 10.55 19.7C5.4 15.1 2 12.05 2 8.3A5.3 5.3 0 0 1 7.35 3C9.25 3 11.08 3.88 12 5.27 12.92 3.88 14.75 3 16.65 3A5.3 5.3 0 0 1 22 8.3c0 3.75-3.4 6.8-8.55 11.4Z" />
          </svg>
        </button>
      </div>
      <div className="card-copy">
        <p>{p.category}</p>
        <h3>{p.name}</h3>
        <small className="card-rating">
          {Number(p.rating || 0) > 0
            ? <>★ {Number(p.rating).toFixed(1)} · {Number(p.reviews || 0)} review{Number(p.reviews || 0) === 1 ? "" : "s"}</>
            : <>New piece · Be first to review</>}
        </small>
        <div>
          <strong>{p.price}</strong>
          {p.old && <del>{p.old}</del>}
          <button
            className={`card-add ${bagQuantity > 0 ? "is-in-bag" : ""} ${addLabel ? "has-action-label" : ""} ${addBusy ? "is-busy" : ""}`}
            disabled={Number(p.stock ?? 0) <= 0 || addBusy}
            onClick={(event) => {
              if (addBusy) return
              if (Number(p.stock ?? 0) > 0) flyProductTo(event, "bag", p)
              add()
            }}
            aria-label={addBusy ? `Moving ${p.name} to bag` : addLabel || (bagQuantity > 0 ? `${p.name}, ${bagQuantity} in bag. Add one more` : `Add ${p.name} to bag`)}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              {addBusy ? "progress_activity" : Number(p.stock ?? 0) > 0 ? (bagQuantity > 0 ? "shopping_bag" : "add_shopping_cart") : "block"}
            </span>
            {bagQuantity > 0 && <i aria-hidden="true">{bagQuantity > 99 ? "99+" : bagQuantity}</i>}
            {addLabel && <small>{addBusy ? "MOVING" : addLabel}</small>}
          </button>
        </div>
      </div>
    </article>
  )
}
function Collection({
  title,
  kicker,
  icon,
  items,
  empty,
  saved,
  bagQuantities,
  save,
  add,
  movingIds = [],
  open,
}: {
  title: string
  kicker: string
  icon: string
  items: Product[]
  empty: string
  saved: string[]
  bagQuantities: Record<string, number>
  save: (id: string) => void
  add: (p: Product) => void
  movingIds?: string[]
  open: (p: Product) => void
}) {
  return (
    <section className="saved-page">
      <header className="saved-intro">
        <div>
          <p className="hello">{kicker}</p>
          <h1>{title}</h1>
        </div>
        <span>{items.length}</span>
        <p>Pieces you’re imagining into your home.</p>
      </header>
      {items.length ? (
        <>
          <section
            className="saved-feature"
            onClick={() => open(items[0])}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") open(items[0])
            }}
          >
            <img src={items[0].image} alt={items[0].alt} />
            <div>
              <p>YOUR NEXT FAVOURITE</p>
              <h2>{items[0].name}</h2>
              <span>
                View piece <b>→</b>
              </span>
            </div>
          </section>
          <div className="saved-section-title">
            <span>ALL SAVED PIECES</span>
            <small>{items.length} objects</small>
          </div>
          <div className="saved-grid">
            {items.map((p) => (
              <Card
                key={p.id}
                p={p}
                saved={saved.includes(p.id)}
                bagQuantity={bagQuantities[p.id] || 0}
                save={() => save(p.id)}
                add={() => add(p)}
                open={() => open(p)}
                addLabel="MOVE TO BAG"
                addBusy={movingIds.includes(p.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="saved-empty">
          <span>{icon}</span>
          <h2>
            Your edit is
            <br />
            <em>waiting to grow.</em>
          </h2>
          <p>{empty}</p>
        </div>
      )}
    </section>
  )
}
function Bag({
  userId,
  lines,
  deliveryAreas,
  open,
  clear,
  remove,
  update,
  checkout,
}: {
  userId: string
  lines: CartLine[]
  deliveryAreas: MobileDeliveryServiceArea[]
  open: (product: Product) => void
  clear: () => void
  remove: (id: string) => void
  update: (id: string, patch: Partial<CartLine>) => void
  checkout: () => void
}) {
  const [deliveryAddress, setDeliveryAddress] = useState<MobileAddress | null>(null)
  useEffect(() => {
    let active = true
    if (!userId) {
      setDeliveryAddress(null)
      return
    }
    const refreshAddress = () => {
      void loadDefaultAddress(userId)
        .then((savedAddress) => {
          if (active) setDeliveryAddress(savedAddress as MobileAddress | null)
        })
        .catch(() => {
          if (active) setDeliveryAddress(null)
        })
    }
    refreshAddress()
    const addressChannel = supabase.channel(`mobile-bag-address-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "addresses",
        filter: `user_id=eq.${userId}`,
      }, refreshAddress)
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(addressChannel)
    }
  }, [userId])
  const selected = lines.filter((line) => line.selected)
  const subtotal = selected.reduce(
    (sum, line) =>
      sum + Number(line.product.price.replace(/[₱,]/g, "")) * line.quantity,
    0,
  )
  const deliveryArea = deliveryAddress
    ? mobileDeliveryAreaForAddress(deliveryAreas, deliveryAddress)
    : null
  const delivery = selected.length && deliveryArea
    ? mobileDeliveryFeeFor(deliveryArea, subtotal)
    : null
  const total = subtotal + (delivery ?? 0)
  const freeDeliveryRemaining = deliveryArea?.free_delivery_minimum !== null
    && deliveryArea
    && deliveryArea.free_delivery_minimum > subtotal
    ? deliveryArea.free_delivery_minimum - subtotal
    : 0
  const allSelected = lines.length > 0 && lines.every((line) => line.selected)
  return (
    <section className="bag-page atelier-bag">
      <header className="bag-hero">
        <p className="hello">YOUR COZYCRAFT ORDER</p>
        <div>
          <h1>
            Your bag{" "}
            <em>({lines.reduce((sum, line) => sum + line.quantity, 0)})</em>
          </h1>
          {lines.length > 0 && <button onClick={clear}>Clear all</button>}
        </div>
        <p>Pieces selected for the life you’re making.</p>
      </header>
      {lines.length ? (
        <>
          <section className="bag-delivery">
            <span className="material-symbols-rounded" aria-hidden="true">local_shipping</span>
            <p>
              <b>{deliveryArea ? `Delivery to ${deliveryArea.name}` : "Delivery calculated from your address"}</b>
              <small>{deliveryArea
                ? `${deliveryArea.lead_time_min_days}–${deliveryArea.lead_time_max_days} business days · ${deliveryArea.assembly_available ? "Assembly available" : "Assembly not included"}`
                : "Choose or add your Philippine delivery address during checkout."}</small>
            </p>
            <strong>{delivery === null ? "AT CHECKOUT" : delivery === 0 ? "FREE" : `₱${delivery.toLocaleString()}`}</strong>
          </section>
          {freeDeliveryRemaining > 0 && selected.length > 0 && <section className="bag-free-delivery-progress" aria-label={`Add ₱${freeDeliveryRemaining.toLocaleString()} more for free delivery`}>
            <div><span>Free-delivery progress</span><b>Add ₱{freeDeliveryRemaining.toLocaleString()}</b></div>
            <i><span style={{ width: `${Math.min(100, Math.max(4, subtotal / Number(deliveryArea?.free_delivery_minimum || 1) * 100))}%` }}/></i>
            <small>Free delivery to {deliveryArea?.name} starts at ₱{Number(deliveryArea?.free_delivery_minimum || 0).toLocaleString()}.</small>
          </section>}
          <section className="bag-selection">
            <label>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  lines.forEach((line) =>
                    update(line.product.id, { selected: event.target.checked }),
                  )
                }
              />
              <span>Select all</span>
            </label>
            <small>{selected.length} selected for checkout</small>
          </section>
          <div className="atelier-bag-items">
            {lines.map(({ product: p, quantity, selected }) => (
              <article key={p.id} className={selected ? "selected" : ""}>
                <label
                  className="line-selector"
                  aria-label={`Select ${p.name}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) =>
                      update(p.id, { selected: event.target.checked })
                    }
                  />
                </label>
                <img
                  src={p.image}
                  alt={p.alt}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(p)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") open(p)
                  }}
                />
                <div className="bag-item-info">
                  <p>{p.category}</p>
                  <h3 role="button" tabIndex={0} onClick={() => open(p)} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") open(p)
                  }}>{p.name}</h3>
                  <strong>{p.price}</strong>
                  <div className="quantity">
                    <button
                      onClick={() =>
                        update(p.id, { quantity: Math.max(1, quantity - 1) })
                      }
                      aria-label={`Decrease quantity of ${p.name}`}
                    >
                      −
                    </button>
                    <span>{quantity}</span>
                    <button
                      onClick={() =>
                        update(p.id, {
                          quantity: Math.min(quantity + 1, p.stock ?? 99),
                        })
                      }
                      aria-label={`Increase quantity of ${p.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  className="remove-item"
                  onClick={() => remove(p.id)}
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </article>
            ))}
          </div>
          <section className="bag-summary">
            <p>
              <span>Subtotal</span>
              <b>₱{subtotal.toLocaleString()}</b>
            </p>
            <p>
              <span>Delivery{deliveryArea ? ` · ${deliveryArea.name}` : ""}</span>
              <b>{delivery === null ? "At checkout" : delivery === 0 ? "Free" : `₱${delivery.toLocaleString()}`}</b>
            </p>
            <div>
              <span>Total</span>
              <strong>₱{total.toLocaleString()}</strong>
            </div>
          </section>
          <button
            className="bag-checkout"
            onClick={checkout}
            disabled={!selected.length}
          >
            <span>
              {selected.length
                ? "Continue to checkout"
                : "Select an item to continue"}
              <small>{deliveryArea ? `Secure checkout · ${deliveryArea.name}` : "Secure checkout · final delivery at address"}</small>
            </span>
            <b>₱{total.toLocaleString()} →</b>
          </button>
        </>
      ) : (
        <div className="bag-empty premium-empty">
          <p>
            Your bag is ready
            <br />
            <em>when you are.</em>
          </p>
          <small>Discover considered pieces for your home.</small>
        </div>
      )}
    </section>
  )
}
function Account({
  userId,
  flash,
  name,
  email,
  image,
  orders,
  points,
  tier,
  lifetimeSpend,
  completedOrders,
  savedCount,
  bagCount,
  unreadNotificationCount,
  pushPermission,
  enableNotifications,
  edit,
  shop,
  openMembership,
  reviewPublished,
}: {
  userId: string
  flash: (s: string) => void
  name: string
  email: string
  image: string
  orders: CustomerOrder[]
  points: number
  tier: string
  lifetimeSpend: number
  completedOrders: number
  savedCount: number
  bagCount: number
  unreadNotificationCount: number
  pushPermission: "unknown" | "granted" | "denied" | "unsupported"
  enableNotifications: () => void
  edit: () => void
  shop: () => void
  openMembership: () => void
  reviewPublished: (orderItemId: number, review: any) => void
}) {
  const [view, setView] = useState<string | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [supportMessage, setSupportMessage] = useState("")
  const [supportSubject, setSupportSubject] = useState("Order and delivery help")
  const [supportCategory, setSupportCategory] = useState("general")
  const [supportSubmitting, setSupportSubmitting] = useState(false)
  const [tickets, setTickets] = useState<Record<string, any>[]>([])
  const [addresses, setAddresses] = useState<MobileAddress[]>([])
  const [addressDraft, setAddressDraft] = useState<MobileAddress | null>(null)
  const [addressSaving, setAddressSaving] = useState(false)
  const [paymentPreference, setPaymentPreference] = useState("cod")
  const [paymentPreferenceSaving, setPaymentPreferenceSaving] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null)
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [cancellingOrder, setCancellingOrder] = useState(false)
  const [cancellationSuccess, setCancellationSuccess] = useState<{ orderNumber: string } | null>(null)
  const [reviewLine, setReviewLine] = useState<CartLine | null>(null)
  const [orderReviewRating, setOrderReviewRating] = useState(5)
  const [orderReviewBody, setOrderReviewBody] = useState("")
  const [orderReviewImages, setOrderReviewImages] = useState<File[]>([])
  const [orderReviewPreparingImages, setOrderReviewPreparingImages] = useState(false)
  const [orderReviewSubmitting, setOrderReviewSubmitting] = useState(false)
  const [orderReviewMessage, setOrderReviewMessage] = useState("")
  const [orderReviewMessageKind, setOrderReviewMessageKind] = useState<"success" | "error">("success")
  const [reviewSuccess, setReviewSuccess] = useState<{ productName: string; rating: number; approved: boolean } | null>(null)
  const [returnRequests, setReturnRequests] = useState<MobileReturnRequest[]>([])
  const [returnOrderOpen, setReturnOrderOpen] = useState(false)
  const [returnReason, setReturnReason] = useState("Changed my mind")
  const [returnDetails, setReturnDetails] = useState("")
  const [returnEvidence, setReturnEvidence] = useState<File[]>([])
  const [returnSubmitting, setReturnSubmitting] = useState(false)
  const [returnMessage, setReturnMessage] = useState("")
  const [returnSuccess, setReturnSuccess] = useState<MobileReturnRequest | null>(null)
  const [faq, setFaq] = useState<MobileFaqPage | null>(null)
  const [faqLoading, setFaqLoading] = useState(false)
  const [faqQuery, setFaqQuery] = useState("")
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  useEffect(() => {
    const open = Boolean(reviewLine || reviewSuccess)
    document.documentElement.classList.toggle("review-dialog-open", open)
    document.body.classList.toggle("review-dialog-open", open)
    return () => {
      document.documentElement.classList.remove("review-dialog-open")
      document.body.classList.remove("review-dialog-open")
    }
  }, [reviewLine, reviewSuccess])
  useEffect(() => {
    const open = Boolean(selectedOrder)
    document.documentElement.classList.toggle("order-detail-open", open)
    document.body.classList.toggle("order-detail-open", open)
    return () => {
      document.documentElement.classList.remove("order-detail-open")
      document.body.classList.remove("order-detail-open")
    }
  }, [selectedOrder])
  const refreshAddresses = () => {
    if (!userId) return Promise.resolve()
    return loadAddresses(userId).then(setAddresses)
  }
  const refreshTickets = () => {
    if (!userId) return Promise.resolve()
    return loadSupportTickets(userId).then(setTickets)
  }
  const refreshPaymentPreference = () => {
    if (!userId) return Promise.resolve()
    return loadPaymentPreference(userId).then(setPaymentPreference)
  }
  const refreshReturns = () => {
    if (!userId) return Promise.resolve()
    return loadMobileReturnRequests(userId).then(setReturnRequests)
  }
  const refreshAccountData = () => {
    if (!userId) return
    void Promise.all([
      refreshAddresses(),
      refreshTickets(),
      refreshPaymentPreference(),
      refreshReturns(),
    ]).catch((error) => flash(error.message))
  }
  useEffect(() => {
    if (!userId) return
    refreshAccountData()
    const channel = supabase.channel(`mobile-account-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "addresses", filter: `user_id=eq.${userId}` }, () => void refreshAddresses().catch((error) => flash(error.message)))
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${userId}` }, () => void refreshTickets().catch((error) => flash(error.message)))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => void refreshPaymentPreference().catch((error) => flash(error.message)))
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests", filter: `user_id=eq.${userId}` }, () => void refreshReturns().catch((error) => flash(error.message)))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId])
  useEffect(() => {
    if (view !== "support" || faq) return
    let active = true
    setFaqLoading(true)
    void loadMobileFaq()
      .then((page) => { if (active) setFaq(page) })
      .finally(() => { if (active) setFaqLoading(false) })
    return () => { active = false }
  }, [faq, view])
  useEffect(() => {
    if (!selectedOrder) return
    const current = orders.find((order) => order.databaseId === selectedOrder.databaseId || order.id === selectedOrder.id)
    if (current) setSelectedOrder(current)
  }, [orders])
  useEffect(() => {
    const closeTopAccountLayer = (event: Event) => {
      if (returnSuccess) {
        setReturnSuccess(null)
        event.preventDefault()
      } else if (returnOrderOpen) {
        setReturnOrderOpen(false)
        event.preventDefault()
      } else if (cancellationSuccess) {
        setCancellationSuccess(null)
        event.preventDefault()
      } else if (reviewLine) {
        setReviewLine(null)
        setOrderReviewBody("")
        setOrderReviewImages([])
        setOrderReviewMessage("")
        event.preventDefault()
      } else if (cancelOrderOpen) {
        setCancelOrderOpen(false)
        event.preventDefault()
      } else if (addressDraft) {
        setAddressDraft(null)
        event.preventDefault()
      } else if (selectedOrder) {
        setSelectedOrder(null)
        event.preventDefault()
      } else if (confirmSignOut) {
        setConfirmSignOut(false)
        event.preventDefault()
      } else if (view) {
        setView(null)
        event.preventDefault()
      }
    }
    window.addEventListener("cozycraft-close-account-layer", closeTopAccountLayer)
    return () => window.removeEventListener("cozycraft-close-account-layer", closeTopAccountLayer)
  }, [returnSuccess, returnOrderOpen, cancellationSuccess, reviewLine, cancelOrderOpen, addressDraft, selectedOrder, confirmSignOut, view])
  const submitReturn = async () => {
    if (!selectedOrder?.databaseId || returnDetails.trim().length < 10 || returnSubmitting) return
    setReturnSubmitting(true)
    setReturnMessage("")
    try {
      const request = await submitMobileReturnRequest({
        userId,
        orderId: selectedOrder.databaseId,
        reason: returnReason,
        details: returnDetails,
        evidence: returnEvidence,
        reportProgress: setReturnMessage,
      })
      setReturnRequests((current) => [request, ...current.filter((item) => item.id !== request.id)])
      setReturnOrderOpen(false)
      setReturnDetails("")
      setReturnEvidence([])
      setReturnMessage("")
      setReturnSuccess(request)
    } catch (error) {
      setReturnMessage(error instanceof Error ? error.message : "The return request could not be sent.")
    } finally {
      setReturnSubmitting(false)
    }
  }
  const cancelSelectedOrder = async () => {
    if (!selectedOrder?.databaseId || !cancelReason.trim()) return
    setCancellingOrder(true)
    try {
      const { data, error } = await supabase.rpc("request_order_cancellation", {
        p_order_id: selectedOrder.databaseId,
        p_reason: cancelReason.trim(),
      })
      if (error) throw error
      setCancelOrderOpen(false)
      setCancelReason("")
      setCancellationSuccess({ orderNumber: String(data?.orderNumber || selectedOrder.id) })
    } catch (error) {
      const message = error instanceof Error ? error.message : "The cancellation request could not be sent."
      flash(message.replace(/^.*?message:\s*/i, ""))
    } finally {
      setCancellingOrder(false)
    }
  }
  const selectPaymentPreference = async (method: { id: string; title: string }) => {
    if (paymentPreferenceSaving || paymentPreference === method.id) return
    setPaymentPreferenceSaving(method.id)
    try {
      await savePaymentPreference(userId, method.id)
      setPaymentPreference(method.id)
      flash(`${method.title} is now preferred at checkout`)
    } catch (error) {
      flash(error instanceof Error ? error.message : "Payment preference could not be saved")
    } finally {
      setPaymentPreferenceSaving(null)
    }
  }
  const entries = [
    {
      id: "orders",
      label: "My orders",
      detail: orders.length
        ? `${orders.length} recent order${orders.length === 1 ? "" : "s"}`
        : "No orders yet",
      note: orders.length
        ? "Track every CozyCraft delivery in one place."
        : "Your order history will appear here.",
    },
    {
      id: "addresses",
      label: "Delivery addresses",
      detail: addresses.length ? `${addresses.length} saved address${addresses.length === 1 ? "" : "es"}` : "No delivery address yet",
      note: "Manage the delivery addresses used at checkout.",
    },
    {
      id: "payments",
      label: "Payment preferences",
      detail: paymentPreference === "cod" ? "Cash on delivery preferred" : `${paymentPreference.toUpperCase()} preferred`,
      note: "Choose the default option shown during checkout.",
    },
    {
      id: "support",
      label: "Care & support",
      detail: tickets.length ? `${tickets.filter((ticket) => ticket.status !== "resolved").length} active conversation${tickets.filter((ticket) => ticket.status !== "resolved").length === 1 ? "" : "s"}` : "We’re here to help",
      note: "Typical response time: under 2 hours.",
    },
  ]
  const active = entries.find((x) => x.id === view)
  const openContentDocument = (route: "about" | "contact" | "terms" | "privacy-policy") => {
    const scrollTop = document.querySelector<HTMLElement>(".lux-body")?.scrollTop || 0
    rememberStorefrontReturnState(scrollTop, unreadNotificationCount)
    window.location.hash = `#/${route}`
  }
  const selectedReturn = selectedOrder?.databaseId
    ? returnRequests.find((request) => request.order_id === selectedOrder.databaseId)
    : undefined
  const tierSteps = [
    { name: "Cozy Member", target: 0 },
    { name: "Cozy Plus", target: 15000 },
    { name: "Cozy Premium", target: 50000 },
    { name: "Cozy Elite", target: 120000 },
  ]
  const tierIndex = Math.max(0, tierSteps.findIndex((step) => step.name === tier))
  const nextTier = tierSteps[tierIndex + 1] || null
  const currentFloor = tierSteps[tierIndex].target
  const tierProgress = nextTier
    ? Math.min(100, ((lifetimeSpend - currentFloor) / (nextTier.target - currentFloor)) * 100)
    : 100

  if (!userId) {
    return (
      <section className="account-page atelier-account guest-account">
        <div className="guest-account-mark">
          <span className="material-symbols-rounded" aria-hidden="true">
            person
          </span>
        </div>
        <p className="hello">YOUR COZYCRAFT ACCOUNT</p>
        <h1>
          Make this space
          <br />
          <em>yours.</em>
        </h1>
        <p className="guest-account-intro">
          Sign in to keep your saved pieces, bag, orders, addresses, and
          support conversations available on every device.
        </p>
        <div className="guest-account-benefits">
          <span><i>♡</i> Sync saved pieces</span>
          <span><i>□</i> Track every order</span>
          <span><i>⌂</i> Save delivery details</span>
        </div>
        <div className="guest-account-actions">
          <button
            className="guest-account-primary"
            onClick={() => { window.location.hash = "#/sign-in" }}
          >
            <span>Sign in</span>
            <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </button>
          <button
            className="guest-account-secondary"
            onClick={() => { window.location.hash = "#/create-account" }}
          >
            <span>Create an account</span>
            <span className="material-symbols-rounded" aria-hidden="true">person_add</span>
          </button>
          <button className="guest-account-shop" onClick={shop}>
            <span>Continue browsing</span>
            <span className="material-symbols-rounded" aria-hidden="true">arrow_outward</span>
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="account-page atelier-account">
      <div className="account-page-heading">
        <p className="hello">MY COZYCRAFT</p>
        <h1>My profile</h1>
        <span>Everything for your home, in one place.</span>
      </div>
      <header className="account-profile">
        <div className="profile-avatar">
          {image ? (
            <img src={image} alt="" />
          ) : (
            name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
          )}
        </div>
        <div>
          <p className="hello">HOME CIRCLE / {tier.toUpperCase()}</p>
          <h1>{name}</h1>
          <small>{email}</small>
        </div>
        <button onClick={edit}>Edit</button>
      </header>
      <button className="rewards-card rewards-card-premium" type="button" onClick={openMembership} aria-label="Open Home Circle points and rewards">
        <span className="rewards-orbit" aria-hidden="true" />
        <span className="rewards-card-head">
          <span className="rewards-eyebrow">COZYCRAFT HOME CIRCLE</span>
          <span className="rewards-tier-badge">{tier.toUpperCase()} MEMBER</span>
        </span>
        <span className="rewards-card-body">
          <span className="rewards-card-copy">
            <span className="rewards-title">Good taste has <em>its rewards.</em></span>
            <span className="rewards-subtitle">Exclusive rewards for the home you’re creating.</span>
          </span>
          <span className="rewards-points-block">
            <strong>{points.toLocaleString()}</strong>
            <small>AVAILABLE POINTS</small>
          </span>
        </span>
        <span className="rewards-progress-row">
          <span>{completedOrders} delivered order{completedOrders === 1 ? "" : "s"}</span>
          <span>{Math.round(tierProgress)}%</span>
        </span>
        <span className="tier-progress" aria-label={`${Math.round(tierProgress)} percent progress to ${nextTier || "top tier"}`}>
          <i style={{ width: `${tierProgress}%` }} />
        </span>
        <span className="rewards-card-foot">
          <small className="tier-note">
            {nextTier
              ? `₱${Math.max(0, nextTier.target - lifetimeSpend).toLocaleString()} eligible spend to ${nextTier.name}`
              : "Highest membership tier unlocked"}
          </small>
          <span className="rewards-open">View rewards <b>→</b></span>
        </span>
      </button>
      <section className="account-stat-row">
        <article>
          <b>{String(savedCount).padStart(2, "0")}</b>
          <span>
            saved
            <br />
            pieces
          </span>
        </article>
        <article>
          <b>{String(completedOrders).padStart(2, "0")}</b>
          <span>
            successful
            <br />
            orders
          </span>
        </article>
        <article>
          <b>{String(bagCount).padStart(2, "0")}</b>
          <span>
            pieces in
            <br />
            your bag
          </span>
        </article>
      </section>
      <p className="account-label">YOUR HOME</p>
      <div className="account-actions">
        {entries.map((item) => (
          <button key={item.id} onClick={() => setView(item.id)}>
            <span className="account-action-icon material-symbols-rounded">
              {item.id === "orders"
                ? "package_2"
                : item.id === "addresses"
                  ? "location_on"
                  : item.id === "payments"
                    ? "payments"
                    : "support_agent"}
            </span>
            <div>
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </div>
            <i>→</i>
          </button>
        ))}
      </div>
      <section className="account-preferences-card" aria-label="App preferences">
        <header><span className="material-symbols-rounded" aria-hidden="true">notifications</span><div><b>Order notifications</b><small>{pushPermission === "granted" ? "Enabled for this device" : pushPermission === "denied" ? "Off in your phone settings" : pushPermission === "unsupported" ? "Available in the installed app" : "Get useful payment and delivery updates"}</small></div></header>
        {pushPermission === "unknown" && <button type="button" onClick={enableNotifications}>Enable notifications</button>}
      </section>
      <nav className="account-resource-links" aria-label="CozyCraft information">
        <button type="button" onClick={() => openContentDocument("about")}>About</button>
        <button type="button" onClick={() => openContentDocument("contact")}>Contact</button>
        <button type="button" onClick={() => openContentDocument("terms")}>Terms</button>
        <button type="button" onClick={() => openContentDocument("privacy-policy")}>Privacy</button>
      </nav>
      <button className="signout" onClick={() => setConfirmSignOut(true)}>
        <span className="material-symbols-rounded" aria-hidden="true">logout</span>
        <span className="signout-copy">
          <b>Sign out</b>
          <small>Securely leave this device</small>
        </span>
        <i aria-hidden="true">→</i>
      </button>
      {confirmSignOut && (
        <section
          className="signout-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sign out"
        >
          <div>
            <span className="material-symbols-rounded" aria-hidden="true">logout</span>
            <p className="hello">LEAVING COZYCRAFT</p>
            <h2>
              Sign out of your
              <br />
              <em>home circle?</em>
            </h2>
            <p>
              You can sign back in any time to access your saved pieces and
              account details.
            </p>
            <button
              onClick={async () => {
                const pushToken = window.localStorage.getItem("cozycraft-native-push-token") || ""
                if (pushToken) await unregisterPushToken(pushToken).catch(console.error)
                await supabase.auth.signOut({ scope: "local" })
                setConfirmSignOut(false)
                flash("You’ve been signed out safely")
                window.location.hash = "#/welcome"
              }}
            >
              Yes, sign out
            </button>
            <button onClick={() => setConfirmSignOut(false)}>
              Keep me signed in
            </button>
          </div>
        </section>
      )}
      {active && (
        <section
          className="account-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={active.label}
        >
          <button className="account-sheet-close" onClick={() => setView(null)} aria-label={`Close ${active.label}`}>
            <span className="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
          <span className="account-sheet-icon material-symbols-rounded" aria-hidden="true">
            {active.id === "orders"
              ? "package_2"
              : active.id === "addresses"
                ? "location_on"
                : active.id === "payments"
                  ? "payments"
                  : "support_agent"}
          </span>
          <p className="hello">{active.label.toUpperCase()}</p>
          <h2>{active.detail}</h2>
          <p>{active.note}</p>
          {active.id === "support" ? (
            <div className="mobile-account-workspace support-care-workspace">
              <section className="support-care-hero">
                <span className="material-symbols-rounded" aria-hidden="true">volunteer_activism</span>
                <div><small>COZYCRAFT CARE</small><h3>Here when your home needs us.</h3><p>From delivery questions to product care, our team will listen closely and help you find the next step.</p></div>
                <aside><i/><span><b>Care team online</b><small>Typical reply within 2 hours</small></span></aside>
              </section>
              <section className="support-faq" aria-labelledby="mobile-faq-title">
                <header>
                  <div><small>QUICK ANSWERS</small><h3 id="mobile-faq-title">Help, before you have to ask.</h3><p>{faq?.summary || "Straightforward answers for shopping, payment, delivery, orders, reviews, and your account."}</p></div>
                  <span className="material-symbols-rounded" aria-hidden="true">contact_support</span>
                </header>
                <label className="support-faq-search">
                  <span className="material-symbols-rounded" aria-hidden="true">search</span>
                  <input type="search" value={faqQuery} onChange={(event) => setFaqQuery(event.target.value)} placeholder="Search CozyCraft help" aria-label="Search frequently asked questions" />
                  {faqQuery && <button type="button" onClick={() => setFaqQuery("")} aria-label="Clear FAQ search"><span className="material-symbols-rounded" aria-hidden="true">close</span></button>}
                </label>
                {faqLoading ? <div className="support-faq-loading" role="status"><i/><span>Preparing helpful answers…</span></div> : (
                  <div className="support-faq-list">
                    {(faq?.items || []).filter((item) => {
                      const term = faqQuery.trim().toLocaleLowerCase("en-PH")
                      return !term || `${item.question} ${item.answer}`.toLocaleLowerCase("en-PH").includes(term)
                    }).map((item, index) => {
                      const expanded = openFaq === index
                      return <article key={`${item.question}-${index}`} className={expanded ? "expanded" : ""}>
                        <button type="button" onClick={() => setOpenFaq(expanded ? null : index)} aria-expanded={expanded}>
                          <span className="support-faq-category material-symbols-rounded" aria-hidden="true">{item.category === "payments" ? "payments" : item.category === "delivery" ? "local_shipping" : item.category === "orders" ? "package_2" : item.category === "reviews" ? "rate_review" : item.category === "account" ? "shield_person" : "chair"}</span>
                          <b>{item.question}</b>
                          <span className="material-symbols-rounded" aria-hidden="true">add</span>
                        </button>
                        {expanded && <p>{item.answer}</p>}
                      </article>
                    })}
                    {faq && !(faq.items || []).some((item) => {
                      const term = faqQuery.trim().toLocaleLowerCase("en-PH")
                      return !term || `${item.question} ${item.answer}`.toLocaleLowerCase("en-PH").includes(term)
                    }) && <div className="support-faq-empty"><span className="material-symbols-rounded" aria-hidden="true">search_off</span><b>No matching quick answer</b><p>Send a private care request below and our team will help.</p></div>}
                  </div>
                )}
                <footer><span className="material-symbols-rounded" aria-hidden="true">database</span><p>{faq?.source === "offline" ? "Core answers are available offline." : "Answers are cached on this device to reduce data use."}</p></footer>
              </section>
              <section className="support-guided-topics">
                <header><div><small>HOW CAN WE HELP?</small><b>Choose a starting point</b></div><span>Optional</span></header>
                <div className="support-topic-rail">{[
                  {id:"order",label:"Order & delivery",icon:"local_shipping",subject:"Order and delivery help"},
                  {id:"payment",label:"Payment",icon:"payments",subject:"Payment assistance"},
                  {id:"product",label:"Product care",icon:"chair",subject:"Product care question"},
                  {id:"return",label:"Return",icon:"assignment_return",subject:"Return or refund help"},
                ].map((topic) => <button type="button" className={supportCategory === topic.id ? "selected" : ""} key={topic.id} onClick={() => { setSupportCategory(topic.id); setSupportSubject(topic.subject) }}><span className="material-symbols-rounded" aria-hidden="true">{topic.icon}</span><b>{topic.label}</b></button>)}</div>
              </section>
              <form className="mobile-support-form support-compose-card" onSubmit={async (event) => {
                event.preventDefault()
                if (supportMessage.trim().length < 10 || !userId || supportSubmitting) return
                setSupportSubmitting(true)
                try {
                  const ticket = await createSupportTicket(userId, supportMessage.trim(), supportSubject.trim(), supportCategory)
                  flash(`Request ${ticket.ticket_number} was sent to CozyCraft Care`)
                  setSupportMessage("")
                  await Promise.all([loadSupportTickets(userId).then(setTickets)])
                } catch (error) {
                  flash(error instanceof Error ? error.message : "Your care request could not be sent")
                } finally {
                  setSupportSubmitting(false)
                }
              }}>
                <header><span className="material-symbols-rounded" aria-hidden="true">edit_note</span><div><small>NEW CARE REQUEST</small><h3>Tell us what happened.</h3><p>Share the details that will help us understand and respond with care.</p></div></header>
                <div className="support-form-grid">
                  <label><span>Topic</span><span className="support-select-wrap"><select value={supportCategory} disabled={supportSubmitting} onChange={(event) => setSupportCategory(event.target.value)}><option value="general">General care</option><option value="order">Order</option><option value="delivery">Delivery</option><option value="payment">Payment</option><option value="product">Product</option><option value="return">Return or refund</option><option value="account">Account</option></select><i className="material-symbols-rounded" aria-hidden="true">expand_more</i></span></label>
                  <label><span>Subject</span><input value={supportSubject} disabled={supportSubmitting} onChange={(event) => setSupportSubject(event.target.value)} required maxLength={120} placeholder="A short summary" /></label>
                </div>
                <label className="support-message-field"><span>Your message <small>Minimum 10 characters</small></span><textarea rows={5} minLength={10} maxLength={1200} value={supportMessage} disabled={supportSubmitting} onChange={(event) => setSupportMessage(event.target.value)} placeholder="Tell us what you need help with, including an order number when relevant…" required/><small>{supportMessage.trim().length} / 1200</small></label>
                <button type="submit" disabled={supportSubmitting || supportSubject.trim().length === 0 || supportMessage.trim().length < 10}>{supportSubmitting ? <><i/>Sending with care…</> : <>Send to CozyCraft Care <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span></>}</button>
                <p className="support-form-assurance"><span className="material-symbols-rounded" aria-hidden="true">lock</span>Your message is private and connected only to your CozyCraft account.</p>
              </form>
              <section className="support-conversations"><header><div><small>CARE HISTORY</small><b>Your conversations</b></div><span>{tickets.length} total</span></header>{tickets.length ? tickets.map((ticket) => { const status = String(ticket.status || "open").split("_").join(" "); return <article key={ticket.id} className={`support-ticket status-${String(ticket.status || "open")}`}><header><div><span className="material-symbols-rounded" aria-hidden="true">forum</span><p><small>{ticket.ticket_number || "SUPPORT REQUEST"}</small><strong>{ticket.subject}</strong></p></div><em>{status}</em></header><blockquote className="support-customer-message"><small>YOUR MESSAGE</small><p>{ticket.message}</p></blockquote>{ticket.admin_reply ? <blockquote className="support-care-reply"><span className="material-symbols-rounded" aria-hidden="true">support_agent</span><div><small>COZYCRAFT CARE</small><p>{ticket.admin_reply}</p></div></blockquote> : <aside className="support-awaiting-reply"><span className="material-symbols-rounded" aria-hidden="true">schedule</span><div><b>Our care team is reviewing this.</b><small>You’ll see the reply here automatically.</small></div></aside>}<footer><span className="material-symbols-rounded" aria-hidden="true">update</span><time>{new Date(ticket.updated_at || ticket.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time></footer></article>}) : <div className="support-empty"><span className="material-symbols-rounded" aria-hidden="true">mark_unread_chat_alt</span><h3>A quiet care history.</h3><p>When you send a request, the conversation and every realtime reply will appear here.</p></div>}</section>
            </div>
          ) : active.id === "orders" && orders.length > 0 ? (
            <div className="mobile-order-list">
              {orders.map((order) => (
                <article key={order.id} className="order-summary-card" onClick={() => setSelectedOrder(order)}>
                  <header>
                    <div>
                      <small>ORDER</small>
                      <b>#{order.id}</b>
                    </div>
                    <span>{order.status}</span>
                  </header>
                  {order.cancellationStatus && <p className={`order-cancellation-chip ${order.cancellationStatus}`}><span className="material-symbols-rounded" aria-hidden="true">{order.cancellationStatus === "pending" ? "schedule" : order.cancellationStatus === "approved" ? "check_circle" : "info"}</span>Cancellation {order.cancellationStatus}</p>}
                  <p>
                    {new Date(order.createdAt).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <div className="order-thumbs">
                    {order.items.slice(0, 3).map((line) => (
                      <img
                        key={line.product.id}
                        src={line.product.image}
                        alt=""
                      />
                    ))}
                  </div>
                  <strong>₱{order.total.toLocaleString()}</strong>
                  {Number(order.rewardDiscount) > 0 && <small className="order-reward-line">Home Circle saved ₱{Number(order.rewardDiscount).toLocaleString()}</small>}
                  {Number(order.pointsEarned) > 0 && <small className="order-points-line">+{order.pointsEarned} Home Circle points earned</small>}
                  <ol className="mini-tracking">
                    {["Processing", "Packed", "Shipped", "Delivered"].map(
                      (step) => (
                        <li
                          className={
                            step === order.status ||
                            [
                              "Processing",
                              "Packed",
                              "Shipped",
                              "Delivered",
                            ].indexOf(step) <
                              [
                                "Processing",
                                "Packed",
                                "Shipped",
                                "Delivered",
                              ].indexOf(order.status)
                              ? "done"
                              : ""
                          }
                          key={step}
                        >
                          {step}
                        </li>
                      ),
                    )}
                  </ol>
                  <button type="button">View complete order <b>→</b></button>
                </article>
              ))}
              {selectedOrder && createPortal(
                <div className="atelier-account order-detail-portal">
                <section className="order-detail-view" role="dialog" aria-modal="true" aria-label={`Order ${selectedOrder.id} details`}>
                  <header className="order-detail-header">
                    <button className="order-detail-close" onClick={() => setSelectedOrder(null)} aria-label="Return to all orders">
                      <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
                      All orders
                    </button>
                    <span className={`order-detail-status status-${selectedOrder.status.toLowerCase()}`}>{selectedOrder.status}</span>
                  </header>
                  <section className="order-detail-hero">
                    <span className="order-detail-hero-icon material-symbols-rounded" aria-hidden="true">{selectedOrder.status === "Delivered" ? "where_to_vote" : selectedOrder.status === "Shipped" ? "local_shipping" : selectedOrder.status === "Packed" ? "inventory_2" : selectedOrder.status === "Cancelled" ? "cancel" : "package_2"}</span>
                    <div>
                      <p className="hello">ORDER #{selectedOrder.id}</p>
                      <h2>{selectedOrder.status === "Delivered" ? "Delivered with care." : selectedOrder.status}</h2>
                      <p>Placed {new Date(selectedOrder.createdAt).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}</p>
                    </div>
                  </section>
                  {selectedOrder.refundStatus && <aside className="mobile-refund-status"><span className="material-symbols-rounded">currency_exchange</span><div><b>Refund {String(selectedOrder.refundStatus).split("_").join(" ")}</b><small>{selectedOrder.refundedAt ? `Updated ${new Date(selectedOrder.refundedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}` : "We’ll keep this status updated in real time."}</small></div></aside>}
                  {selectedOrder.cancellationStatus && <aside className={`mobile-cancellation-status ${selectedOrder.cancellationStatus}`}><span className="material-symbols-rounded" aria-hidden="true">{selectedOrder.cancellationStatus === "pending" ? "pending_actions" : selectedOrder.cancellationStatus === "approved" ? "task_alt" : "info"}</span><div><b>{selectedOrder.cancellationStatus === "pending" ? "Cancellation pending approval" : selectedOrder.cancellationStatus === "approved" ? "Cancellation approved" : "Cancellation request not approved"}</b><small>{selectedOrder.cancellationStatus === "pending" ? "Your order is paused before shipment while our team reviews your request." : selectedOrder.cancellationDecisionNote || (selectedOrder.cancellationStatus === "approved" ? "Cancellation and payment updates are shown here in real time." : "This order will continue through fulfillment.")}</small>{selectedOrder.cancellationRequestedAt && <time>Requested {new Date(selectedOrder.cancellationRequestedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time>}</div></aside>}
                  {selectedOrder.cancellationReason && <p className="mobile-cancellation-reason"><b>Cancellation reason</b>{selectedOrder.cancellationReason}</p>}
                  <section className="order-detail-section order-detail-items">
                    <header><div><small>YOUR PIECES</small><b>{selectedOrder.items.length} item{selectedOrder.items.length === 1 ? "" : "s"}</b></div><strong>₱{selectedOrder.total.toLocaleString()}</strong></header>
                    <div className="order-detail-products">
                    {selectedOrder.items.map((line) => (
                      <article className={selectedOrder.status === "Delivered" ? "reviewable" : ""} key={`${line.orderItemId || line.product.id}`}>
                        <img src={line.product.image} alt=""/>
                        <div>
                          <b>{line.product.name}</b>
                          <small>Quantity {line.quantity}</small>
                          {selectedOrder.status === "Delivered" && line.reviewId && (
                            <span className="order-review-complete"><span className="material-symbols-rounded" aria-hidden="true">verified</span><span><b>Reviewed</b><small>{line.reviewRating ? `${line.reviewRating} of 5 stars` : "Review submitted"}</small></span></span>
                          )}
                          {selectedOrder.status === "Delivered" && !line.reviewId && (
                            <button type="button" className="order-write-review" onClick={() => {
                              setReviewLine(line)
                              setOrderReviewRating(5)
                              setOrderReviewBody("")
                              setOrderReviewImages([])
                              setOrderReviewMessage("")
                            }}><span className="material-symbols-rounded" aria-hidden="true">rate_review</span>Write a review</button>
                          )}
                        </div>
                        <strong>{line.product.price}</strong>
                      </article>
                    ))}
                    </div>
                  </section>
                  <section className="order-detail-meta">
                    <p><span className="material-symbols-rounded" aria-hidden="true">payments</span><small>PAYMENT</small><b>{selectedOrder.payment.toUpperCase()}</b><em>{String(selectedOrder.paymentStatus || "pending").split("_").join(" ")}</em></p>
                    <p className="order-detail-address"><span className="material-symbols-rounded" aria-hidden="true">location_on</span><small>DELIVERY ADDRESS</small><b>{selectedOrder.address || "Address recorded with order"}</b></p>
                    <p className="order-detail-delivery-fee"><span className="material-symbols-rounded" aria-hidden="true">local_shipping</span><small>DELIVERY FEE</small><strong>{Number(selectedOrder.deliveryFee || 0) > 0 ? `₱${Number(selectedOrder.deliveryFee).toLocaleString()}` : "Free"}</strong>{selectedOrder.deliveryAreaName && <em>{selectedOrder.deliveryAreaName}</em>}</p>
                    <p><span className="material-symbols-rounded" aria-hidden="true">receipt_long</span><small>ORDER TOTAL</small><strong>₱{selectedOrder.total.toLocaleString()}</strong></p>
                  </section>
                  <section className="order-detail-section order-journey">
                    <header><div><small>ORDER JOURNEY</small><b>From our studio to your home</b></div></header>
                    <ol className="full-order-timeline">{visibleOrderTimeline(selectedOrder).map((event, index, events) => <li className={index === events.length - 1 ? "current" : "complete"} key={`${event.status}-${event.changedAt}-${index}`}><i><span className="material-symbols-rounded" aria-hidden="true">check</span></i><div><b>{event.status}</b><time>{new Date(event.changedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</time></div></li>)}</ol>
                  </section>
                  {selectedOrder.status === "Delivered" && selectedOrder.databaseId && (selectedReturn
                    ? <aside className={`mobile-return-status status-${selectedReturn.status}`}><span className="material-symbols-rounded" aria-hidden="true">assignment_return</span><div><small>RETURN {selectedReturn.return_number}</small><b>{selectedReturn.status.split("_").join(" ")}</b><p>{selectedReturn.admin_note || "Your request is safely recorded. Updates appear here in real time."}</p></div></aside>
                    : <button className="order-return-action" type="button" onClick={() => { setReturnMessage(""); setReturnOrderOpen(true) }}><span className="material-symbols-rounded" aria-hidden="true">assignment_return</span> Request a return</button>)}
                  {["Processing", "Packed"].includes(selectedOrder.status) && selectedOrder.databaseId && !selectedOrder.cancellationStatus && <button className="order-cancel-action" onClick={() => setCancelOrderOpen(true)}>Request cancellation</button>}
                  {selectedOrder.cancellationStatus === "pending" && <button className="order-cancel-action pending" disabled><span className="material-symbols-rounded" aria-hidden="true">schedule</span> Request pending approval</button>}
                  {["Shipped", "Delivered"].includes(selectedOrder.status) && <button className="order-cancel-action unavailable" disabled><span className="material-symbols-rounded" aria-hidden="true">local_shipping</span> {selectedOrder.status === "Shipped" ? "Already shipped · cancellation unavailable" : "Delivered · use returns or support"}</button>}
                  {reviewLine && (
                    <section className="order-review-dialog" role="dialog" aria-modal="true" aria-label={`Review ${reviewLine.product.name}`}>
                      <form onSubmit={async (event) => {
                        event.preventDefault()
                        const body = orderReviewBody.trim()
                        if (body.length < 5 || orderReviewSubmitting || orderReviewPreparingImages) return
                        setOrderReviewSubmitting(true)
                        setOrderReviewMessage("")
                        try {
                          if (!reviewLine.orderItemId) throw new Error("This purchase cannot be reviewed yet.")
                          setOrderReviewMessageKind("success")
                          const result = await submitReview(
                            userId,
                            reviewLine.orderItemId,
                            orderReviewRating,
                            body,
                            orderReviewImages,
                            (message) => setOrderReviewMessage(message),
                          )
                          reviewPublished(reviewLine.orderItemId, result)
                          setReviewSuccess({ productName: reviewLine.product.name, rating: Number(result?.rating || orderReviewRating), approved: Boolean(result?.approved) })
                          setReviewLine(null)
                          setOrderReviewRating(5)
                          setOrderReviewBody("")
                          setOrderReviewImages([])
                          setOrderReviewMessage("")
                        } catch (error) {
                          const message = error instanceof Error ? error.message : String(error)
                          setOrderReviewMessageKind("error")
                          setOrderReviewMessage(message.includes("Only delivered purchases")
                            ? "This product can only be reviewed after delivery."
                            : message.toLowerCase().includes("already reviewed")
                              ? "You have already reviewed this product."
                              : message.toLowerCase().includes("session expired")
                                ? "Your session expired. Please sign in again, then publish your review."
                                : message.toLowerCase().includes("photo") || message.toLowerCase().includes("image")
                                  ? message
                                  : message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network")
                                    ? "Supabase could not be reached. Your review is still here—please try publishing again."
                                    : message || "We couldn't save your review. Please try again.")
                        } finally {
                          setOrderReviewSubmitting(false)
                        }
                      }}>
                        <header className="order-review-header">
                          <img src={reviewLine.product.image} alt=""/>
                          <div><p className="hello"><span className="material-symbols-rounded" aria-hidden="true">verified</span>VERIFIED PURCHASE</p><h3>Review {reviewLine.product.name}</h3><small>Delivered piece · Quantity {reviewLine.quantity}</small></div>
                          <button type="button" className="order-review-close" aria-label="Close review" onClick={() => { setReviewLine(null); setOrderReviewImages([]); setOrderReviewMessage("") }}><span className="material-symbols-rounded" aria-hidden="true">close</span></button>
                        </header>
                        <section className="order-review-intro"><p className="hello">YOUR EXPERIENCE</p><h4>How does it live in your space?</h4><p>Your feedback helps another home choose with confidence.</p></section>
                        <fieldset className="rating-field"><legend>Overall rating</legend><div className="rating-input" aria-label={`${orderReviewRating} out of 5 stars`}>
                          {[1, 2, 3, 4, 5].map((rating) => <button type="button" key={rating} className={rating <= orderReviewRating ? "active" : ""} onClick={() => setOrderReviewRating(rating)} aria-label={`${rating} stars`}>★</button>)}
                        </div><small>{orderReviewRating === 5 ? "Exceptional" : orderReviewRating === 4 ? "Very good" : orderReviewRating === 3 ? "Good" : orderReviewRating === 2 ? "Could be better" : "Needs attention"}</small></fieldset>
                        <label className="order-review-copy"><span>Your review <small>Minimum 5 characters</small></span><textarea rows={5} minLength={5} maxLength={2000} value={orderReviewBody} onChange={(event) => setOrderReviewBody(event.target.value)} placeholder="Tell us about the comfort, quality, and how this piece feels in your space…" disabled={orderReviewSubmitting}/><small>{orderReviewBody.trim().length} / 2000</small></label>
                        <label className="order-review-photos">
                          <span className="material-symbols-rounded" aria-hidden="true">add_photo_alternate</span>
                          <span><b>Add photos</b><small>Optional · up to 2 images, 5 MB each</small></span>
                          <em>{orderReviewImages.length}/2</em>
                          <input type="file" accept="image/*" multiple disabled={orderReviewSubmitting || orderReviewPreparingImages || orderReviewImages.length >= 2} onChange={(event) => {
                            const input = event.currentTarget
                            const chosen = Array.from(event.target.files || [])
                            if (chosen.length === 0) {
                              input.value = ""
                              return
                            }
                            const supportedExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"])
                            const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/octet-stream"])
                            const invalid = chosen.find((file) => {
                              const extension = file.name.split(".").pop()?.toLowerCase() || ""
                              return file.size > 5 * 1024 * 1024 || (!supportedTypes.has(file.type.toLowerCase()) && !file.type.toLowerCase().startsWith("image/") && !supportedExtensions.has(extension))
                            })
                            const remainingSlots = Math.max(0, 2 - orderReviewImages.length)
                            if (invalid) {
                              setOrderReviewMessageKind("error")
                              setOrderReviewMessage("Choose JPG, PNG, WebP, HEIC, or HEIF images up to 5 MB each.")
                              input.value = ""
                            } else {
                              const accepted = chosen.slice(0, remainingSlots)
                              setOrderReviewPreparingImages(true)
                              setOrderReviewMessageKind("success")
                              setOrderReviewMessage(`Preparing ${accepted.length === 1 ? "photo" : `${accepted.length} photos`}…`)
                              // Start every FileReader before this input event returns. Android
                              // may issue separate short-lived content grants for a multi-select;
                              // waiting for photo one before opening photo two can lose grant two.
                              const staging = accepted.map((file) => stageReviewImage(file).then(
                                (staged) => ({ staged, error: null as Error | null }),
                                (error) => ({ staged: null, error: error instanceof Error ? error : new Error(String(error)) }),
                              ))
                              void (async () => {
                                let stagedCount = 0
                                try {
                                  const results = await Promise.all(staging)
                                  for (const result of results) {
                                    if (!result.staged) continue
                                    setOrderReviewImages((current) => [...current, result.staged!].slice(0, 2))
                                    stagedCount += 1
                                  }
                                  const failed = results.find((result) => result.error)?.error
                                  if (failed) {
                                    throw failed
                                  } else if (chosen.length > remainingSlots) {
                                    setOrderReviewMessageKind("error")
                                    setOrderReviewMessage("You can attach up to 2 photos to a review.")
                                  } else {
                                    setOrderReviewMessage("")
                                  }
                                } catch (error) {
                                  setOrderReviewMessageKind("error")
                                  const detail = error instanceof Error ? error.message : ""
                                  setOrderReviewMessage(detail.includes("JPG")
                                    ? detail
                                    : stagedCount > 0
                                      ? "One photo is ready. The gallery did not provide readable data for the other photo—choose only the remaining photo again."
                                      : "The gallery did not provide readable image data. Choose the photo again or select a different copy.")
                                } finally {
                                  // Reset only after every selected content URI has been copied.
                                  input.value = ""
                                  setOrderReviewPreparingImages(false)
                                }
                              })()
                            }
                          }}/>
                        </label>
                        {orderReviewImages.length > 0 && <div className="order-review-photo-list">{orderReviewImages.map((file, index) => <button type="button" key={`${file.name}-${file.lastModified}-${index}`} onClick={() => setOrderReviewImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}><span className="material-symbols-rounded" aria-hidden="true">image</span><span>{file.name}</span><b aria-label={`Remove ${file.name}`}>×</b></button>)}</div>}
                        {orderReviewMessage && <p className={`review-submit-message ${orderReviewMessageKind}`} role={orderReviewMessageKind === "error" ? "alert" : "status"}>{orderReviewMessage}</p>}
                        <footer className="order-review-footer"><small>By publishing, you confirm this reflects your genuine experience.</small><button type="submit" disabled={orderReviewSubmitting || orderReviewPreparingImages || orderReviewBody.trim().length < 5}>{orderReviewPreparingImages ? <><span className="review-submit-spinner"/>Preparing photos…</> : orderReviewSubmitting ? <><span className="review-submit-spinner"/>Publishing review…</> : <>Publish review <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span></>}</button></footer>
                      </form>
                    </section>
                  )}
                  {reviewSuccess && <section className="order-review-success" role="dialog" aria-modal="true" aria-label="Review submitted successfully"><div><span className="review-success-icon material-symbols-rounded" aria-hidden="true">verified</span><p className="hello">REVIEW RECEIVED</p><h3>Thank you for sharing.</h3><p>Your {reviewSuccess.rating}-star review of <b>{reviewSuccess.productName}</b> was saved successfully.{reviewSuccess.approved ? " It is now visible on the product page." : " It will appear on the product page after a quick moderation check."}</p><aside><span className="material-symbols-rounded" aria-hidden="true">check_circle</span><div><b>Marked as reviewed</b><small>This delivered product now shows a verified review check.</small></div></aside><button type="button" onClick={() => setReviewSuccess(null)}>Return to order <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button></div></section>}
                  {returnOrderOpen && <section className="order-return-dialog" role="dialog" aria-modal="true" aria-label="Request a return"><form onSubmit={(event) => { event.preventDefault(); void submitReturn() }}><header><span className="material-symbols-rounded" aria-hidden="true">assignment_return</span><div><p className="hello">RETURN REQUEST</p><h3>Let’s make this right.</h3><small>For delivered order #{selectedOrder.id}</small></div><button type="button" aria-label="Close return request" onClick={() => setReturnOrderOpen(false)}>×</button></header><label><span>Reason</span><select value={returnReason} disabled={returnSubmitting} onChange={(event) => setReturnReason(event.target.value)}><option>Changed my mind</option><option>Damaged on arrival</option><option>Wrong item delivered</option><option>Missing parts</option><option>Quality concern</option><option>Other</option></select></label><label><span>Tell us what happened <small>Minimum 10 characters</small></span><textarea rows={5} minLength={10} maxLength={1000} value={returnDetails} disabled={returnSubmitting} onChange={(event) => setReturnDetails(event.target.value)} placeholder="Describe the condition and how CozyCraft Care can help."/><small>{returnDetails.trim().length} / 1000</small></label><label className="return-photo-picker"><span className="material-symbols-rounded" aria-hidden="true">add_photo_alternate</span><span><b>Add evidence photos</b><small>Optional · up to 2 JPG, PNG, or WebP images</small></span><em>{returnEvidence.length}/2</em><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={returnSubmitting || returnEvidence.length >= 2} onChange={(event) => { const input = event.currentTarget; const files = Array.from(input.files || []).slice(0, Math.max(0, 2 - returnEvidence.length)); const staging = files.map((file) => stageReviewImage(file)); void Promise.all(staging).then((ready) => { setReturnEvidence((current) => [...current, ...ready].slice(0, 2)); setReturnMessage("") }).catch((error) => setReturnMessage(error instanceof Error ? error.message : "A photo could not be read.")).finally(() => { input.value = "" }) }}/></label>{returnEvidence.length > 0 && <div className="return-photo-list">{returnEvidence.map((file, index) => <button type="button" key={`${file.name}-${index}`} onClick={() => setReturnEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}><span className="material-symbols-rounded" aria-hidden="true">image</span>{file.name}<b>×</b></button>)}</div>}{returnMessage && <p className="return-message" role="status">{returnMessage}</p>}<footer><button type="button" disabled={returnSubmitting} onClick={() => setReturnOrderOpen(false)}>Not now</button><button type="submit" disabled={returnSubmitting || returnDetails.trim().length < 10}>{returnSubmitting ? "Sending request…" : "Submit return request"}</button></footer></form></section>}
                  {returnSuccess && <section className="order-return-success" role="dialog" aria-modal="true" aria-label="Return request submitted"><div><span className="material-symbols-rounded" aria-hidden="true">task_alt</span><p className="hello">REQUEST RECEIVED</p><h3>We’re on it.</h3><p>Return <b>{returnSuccess.return_number}</b> is pending review. Every status and care-team note will update here automatically.</p><button type="button" onClick={() => setReturnSuccess(null)}>Return to order <span aria-hidden="true">→</span></button></div></section>}
                  {cancelOrderOpen && <section className="order-cancel-dialog" role="dialog" aria-modal="true" aria-label="Request order cancellation"><div><span className="cancel-dialog-icon material-symbols-rounded" aria-hidden="true">pending_actions</span><p className="hello">CANCELLATION REQUEST</p><h3>Tell us why you’re cancelling.</h3><p>Your order stays active while our care team reviews the request. If approved, paid Card or GCash orders continue through the secure refund workflow.</p><label><span>Reason for cancellation</span><textarea rows={4} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Share a clear reason (minimum 5 characters)" minLength={5} maxLength={500}/><small>{cancelReason.trim().length} / 500</small></label><button disabled={cancelReason.trim().length < 5 || cancellingOrder} onClick={() => void cancelSelectedOrder()}>{cancellingOrder ? <><i/>Sending request…</> : <>Submit request <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span></>}</button><button className="text-button" disabled={cancellingOrder} onClick={() => setCancelOrderOpen(false)}>Keep my order</button></div></section>}
                  {cancellationSuccess && <section className="order-cancellation-success" role="dialog" aria-modal="true" aria-label="Cancellation request submitted"><div><span className="material-symbols-rounded" aria-hidden="true">schedule</span><p className="hello">REQUEST RECEIVED</p><h3>Pending approval.</h3><p>Your cancellation request for <b>#{cancellationSuccess.orderNumber}</b> is safely recorded. You’ll see the approval decision here and in My Orders as soon as our team reviews it.</p><aside><span className="material-symbols-rounded" aria-hidden="true">notifications_active</span><div><b>Realtime updates are on</b><small>No need to submit the request again.</small></div></aside><button type="button" onClick={() => setCancellationSuccess(null)}>Return to order <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button></div></section>}
                </section>
                </div>,
                document.body,
              )}
            </div>
          ) : active.id === "addresses" ? (
            <div className="mobile-address-workspace">
              <header className="address-workspace-header">
                <div>
                  <small>YOUR SAVED PLACES</small>
                  <b>{addresses.length} delivery address{addresses.length === 1 ? "" : "es"}</b>
                </div>
                {!addressDraft && <button type="button" onClick={() => setAddressDraft({ label: "Home", recipient_name: name, mobile: "", email, address_line: "", barangay: "", city: "", province: "", postal_code: "", delivery_note: "", is_primary: addresses.length === 0 })}>
                  <span className="material-symbols-rounded" aria-hidden="true">add</span>
                  Add address
                </button>}
              </header>

              {!addressDraft && addresses.length === 0 && <section className="address-workspace-empty">
                <span className="material-symbols-rounded" aria-hidden="true">home_pin</span>
                <h3>No delivery address yet.</h3>
                <p>Add a trusted delivery location for a smoother checkout.</p>
                <button type="button" onClick={() => setAddressDraft({ label: "Home", recipient_name: name, mobile: "", email, address_line: "", barangay: "", city: "", province: "", postal_code: "", delivery_note: "", is_primary: true })}>Add your first address</button>
              </section>}

              {!addressDraft && addresses.map((address) => <article className="mobile-address-card" key={address.id}>
                <header>
                  <span className="address-card-icon material-symbols-rounded" aria-hidden="true">{address.label.toLowerCase().includes("work") ? "business" : "home"}</span>
                  <div><b>{address.label || "Delivery address"}</b><small>{address.recipient_name} · {address.mobile}</small></div>
                  {address.is_primary && <em>DEFAULT</em>}
                </header>
                <p>{formatCheckoutAddress(address)}</p>
                {address.delivery_note && <aside><span className="material-symbols-rounded" aria-hidden="true">sticky_note_2</span><small>{address.delivery_note}</small></aside>}
                <footer>
                  <button type="button" className="address-card-edit" onClick={() => setAddressDraft(address)}><span className="material-symbols-rounded" aria-hidden="true">edit</span>Edit</button>
                  {!address.is_primary && <button type="button" onClick={() => void setPrimaryAddress(userId, address.id!).then(() => { refreshAccountData(); flash("Default delivery address updated") }).catch((error) => flash(error.message))}><span className="material-symbols-rounded" aria-hidden="true">check_circle</span>Make default</button>}
                  <button type="button" className="address-card-remove" onClick={() => void deleteAddress(userId, address.id!).then(() => { refreshAccountData(); flash("Delivery address removed") }).catch((error) => flash(error.message))}><span className="material-symbols-rounded" aria-hidden="true">delete</span>Remove</button>
                </footer>
              </article>)}

              {addressDraft && <form className="mobile-address-form" onSubmit={(event) => {
                event.preventDefault()
                if (addressSaving) return
                setAddressSaving(true)
                void saveAddress(userId, addressDraft)
                  .then(() => {
                    setAddressDraft(null)
                    refreshAccountData()
                    flash("Delivery address saved")
                  })
                  .catch((error) => flash(error.message))
                  .finally(() => setAddressSaving(false))
              }}>
                <header>
                  <div><small>{addressDraft.id ? "EDIT DELIVERY ADDRESS" : "NEW DELIVERY ADDRESS"}</small><b>{addressDraft.id ? "Refine your details." : "Where should we deliver?"}</b></div>
                  <button type="button" onClick={() => setAddressDraft(null)} aria-label="Close address editor"><span className="material-symbols-rounded" aria-hidden="true">close</span></button>
                </header>
                <p>Use complete Philippine delivery details so our care team can arrange your arrival without delay.</p>
                <div className="mobile-address-form-grid">
                  <label><span>Address label</span><input value={addressDraft.label} onChange={(event) => setAddressDraft({ ...addressDraft, label: event.target.value })} required placeholder="Home" /></label>
                  <label><span>Recipient name</span><input value={addressDraft.recipient_name} onChange={(event) => setAddressDraft({ ...addressDraft, recipient_name: event.target.value })} required /></label>
                  <label className="wide"><span>Mobile number</span><input inputMode="tel" value={addressDraft.mobile} onChange={(event) => setAddressDraft({ ...addressDraft, mobile: event.target.value })} required placeholder="09XXXXXXXXX" /></label>
                  <label className="wide"><span>House / unit / building / street</span><input value={addressDraft.address_line} onChange={(event) => setAddressDraft({ ...addressDraft, address_line: event.target.value })} required /></label>
                  <PhilippineLocationFields
                    key={addressDraft.id || "account-new-address"}
                    address={addressDraft}
                    update={(changes) => setAddressDraft((current) => current ? { ...current, ...changes } : current)}
                    reportError={flash}
                  />
                  <label><span>Postal code</span><input inputMode="numeric" value={addressDraft.postal_code} onChange={(event) => setAddressDraft({ ...addressDraft, postal_code: event.target.value })} required /></label>
                  <label className="wide"><span>Delivery instructions <small>Optional</small></span><input value={addressDraft.delivery_note} onChange={(event) => setAddressDraft({ ...addressDraft, delivery_note: event.target.value })} placeholder="Gate, landmark, or room preference" /></label>
                </div>
                <label className="address-default-check"><input type="checkbox" checked={addressDraft.is_primary} onChange={(event) => setAddressDraft({ ...addressDraft, is_primary: event.target.checked })}/> <span><b>Use as default address</b><small>We’ll preselect this location at checkout.</small></span></label>
                <div className="mobile-address-form-actions">
                  <button type="button" onClick={() => setAddressDraft(null)}>Cancel</button>
                  <button type="submit" disabled={addressSaving}>{addressSaving ? "Saving…" : "Save address"}<b>→</b></button>
                </div>
              </form>}
            </div>
          ) : active.id === "payments" ? (
            <div className="mobile-payment-workspace">
              <section className="payment-preference-hero">
                <span className="material-symbols-rounded" aria-hidden="true">verified_user</span>
                <div><small>SECURE CHECKOUT</small><h3>Checkout, your way.</h3><p>Choose what CozyCraft prepares first. You can still select another method for any order.</p></div>
              </section>
              <header className="payment-method-heading"><div><small>DEFAULT PAYMENT</small><b>Preferred at checkout</b></div><span><i/>Synced securely</span></header>
              <div className="payment-method-list">
                {[
                  {id:"cod",title:"Cash on delivery",note:"Pay only when your furniture arrives",meta:"PAY ON ARRIVAL",icon:"payments"},
                  {id:"gcash",title:"GCash",note:"Continue through encrypted PayMongo checkout",meta:"PAYMONGO SECURE",icon:"account_balance_wallet"},
                  {id:"card",title:"Credit or debit card",note:"Visa and Mastercard through PayMongo",meta:"PAYMONGO SECURE",icon:"credit_card"},
                ].map((method) => {
                  const selected = paymentPreference === method.id
                  const saving = paymentPreferenceSaving === method.id
                  return <button type="button" aria-pressed={selected} className={`payment-method-card ${selected ? "selected" : ""}`} key={method.id} disabled={Boolean(paymentPreferenceSaving)} onClick={() => void selectPaymentPreference(method)}>
                    <span className="payment-method-icon material-symbols-rounded" aria-hidden="true">{method.icon}</span>
                    <span className="payment-method-copy"><span><b>{method.title}</b>{selected && <em>Preferred</em>}</span><small>{method.note}</small><i>{method.meta}</i></span>
                    <span className={`payment-method-check material-symbols-rounded ${saving ? "saving" : ""}`} aria-hidden="true">{saving ? "progress_activity" : selected ? "check" : "circle"}</span>
                  </button>
                })}
              </div>
              <aside className="payment-privacy-note"><span className="material-symbols-rounded" aria-hidden="true">lock</span><div><b>Your payment details stay private.</b><small>CozyCraft never stores card numbers or GCash credentials. They are entered only on PayMongo’s secure checkout.</small></div></aside>
            </div>
          ) : (
            <button
              onClick={() => {
                if (active.id === "orders") shop()
                else
                  flash(
                    active.id === "support"
                      ? "Support request started"
                      : `${active.label} ready`,
                  )
                setView(null)
              }}
            >
              {active.id === "orders"
                ? "Start shopping"
                : active.id === "support"
                  ? "Start a support request"
                  : "Manage"}{" "}
              <b>→</b>
            </button>
          )}
        </section>
      )}
    </section>
  )
}
function ReviewerAvatar({ name, src }: { name: string; src: string }) {
  const [imageFailed, setImageFailed] = useState(false)
  const safeName = name?.trim() || "CozyCraft customer"

  useEffect(() => setImageFailed(false), [src])

  return (
    <span className={`reviewer-avatar${!imageFailed ? " has-photo" : ""}`} aria-hidden="true">
      {!imageFailed
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)}/>
        : safeName.charAt(0).toUpperCase()}
    </span>
  )
}

function CompareSheet({ products, close, remove, open }: {
  products: Product[]
  close: () => void
  remove: (id: string) => void
  open: (product: Product) => void
}) {
  return createPortal(
    <section className="compare-sheet" role="dialog" aria-modal="true" aria-label="Compare furniture">
      <header>
        <button type="button" onClick={close} aria-label="Close comparison"><span className="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
        <div><p className="hello">SIDE BY SIDE</p><h2>Compare your pieces.</h2></div>
        <span>{products.length}/3</span>
      </header>
      <main>
        <p className="compare-intro">See the essentials together, then open a piece for its complete story.</p>
        <div className="compare-grid">
          {products.map((product) => <article key={product.id}>
            <button className="compare-remove" type="button" onClick={() => remove(product.id)} aria-label={`Remove ${product.name}`}>×</button>
            <button className="compare-product" type="button" onClick={() => open(product)}>
              <img src={product.image} alt="" loading="lazy" decoding="async"/>
              <span><small>{product.category}</small><b>{product.name}</b><strong>{product.price}</strong></span>
            </button>
            <dl>
              <div><dt>Rating</dt><dd>{Number(product.rating || 0) > 0 ? `★ ${Number(product.rating).toFixed(1)}` : "New"}</dd></div>
              <div><dt>Availability</dt><dd>{Number(product.stock || 0) > 0 ? `${product.stock} available` : "Unavailable"}</dd></div>
              <div><dt>Material</dt><dd>{product.materials?.map((item) => item.type).filter(Boolean).slice(0, 2).join(", ") || "Details soon"}</dd></div>
              <div><dt>Size</dt><dd>{product.dimensions?.slice(0, 2).map((item) => `${item.label} ${item.value}${item.unit}`).join(" · ") || "Details soon"}</dd></div>
            </dl>
            <button type="button" className="compare-view" onClick={() => open(product)}>View piece <span aria-hidden="true">→</span></button>
          </article>)}
        </div>
        {products.length < 2 && <aside><span className="material-symbols-rounded" aria-hidden="true">add_circle</span><p><b>Add another piece</b><small>Open a product and tap Compare. You can compare up to three.</small></p></aside>}
      </main>
    </section>,
    document.body,
  )
}

function ProductDetail({
  p,
  saved,
  compared,
  userId,
  deliveryAreas,
  close,
  save,
  compare,
  add,
}: {
  p: Product
  saved: boolean
  compared: boolean
  userId: string
  deliveryAreas: MobileDeliveryServiceArea[]
  close: () => void
  save: () => void
  compare: () => void
  add: () => void
}) {
  const [slide, setSlide] = useState(0)
  const [touch, setTouch] = useState(0)
  const [customerReviews, setCustomerReviews] = useState<Array<{
    id: string
    rating: number
    body: string
    image_urls: string[]
    created_at: string
    approved: boolean
    reviewer_display_name: string
    reviewer_avatar_url: string
  }>>([])
  const [reviewFilter, setReviewFilter] = useState<number | null>(null)
  const [deliveryAddress, setDeliveryAddress] = useState<MobileAddress | null>(null)
  useEffect(() => {
    const refresh = () => void loadReviews(p.id).then((data) => setCustomerReviews(data as typeof customerReviews)).catch(console.error)
    refresh()
    const channel = supabase.channel(`mobile-reviews-${p.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `product_id=eq.${p.id}` }, refresh)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [p.id])
  const gallery = useMemo(
    () => [...new Set([...(p.images || []), p.image].filter((source) => Boolean(source?.trim())))],
    [p.image, p.images],
  )
  useEffect(() => {
    setSlide(0)
    setReviewFilter(null)
  }, [p.id])
  useEffect(() => {
    if (slide >= gallery.length) setSlide(0)
  }, [gallery.length, slide])
  useEffect(() => {
    if (gallery.length < 2) return
    const image = new Image()
    image.src = gallery[(slide + 1) % gallery.length]
  }, [gallery, slide])
  useEffect(() => {
    if (!userId) { setDeliveryAddress(null); return }
    void loadDefaultAddress(userId).then(setDeliveryAddress).catch(() => setDeliveryAddress(null))
  }, [userId])
  const materials = p.materials || []
  const dimensions = p.dimensions || []
  const publishedReviews = customerReviews.filter((review) => review.approved)
  const liveReviewCount = publishedReviews.length
  const liveRating = liveReviewCount
    ? publishedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / liveReviewCount
    : Number(p.rating || 0)
  const reviewCounts = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: customerReviews.filter((review) => Number(review.rating) === rating).length,
  }))
  const filteredReviews = reviewFilter
    ? customerReviews.filter((review) => Number(review.rating) === reviewFilter)
    : customerReviews
  const deliveryArea = deliveryAddress
    ? mobileDeliveryAreaForAddress(deliveryAreas, deliveryAddress)
    : null
  const deliveryWindow = deliveryArea ? mobileDeliveryDateRange(deliveryArea) : null
  const deliveryFee = deliveryArea
    ? mobileDeliveryFeeFor(deliveryArea, Number(p.price.replace(/[₱,]/g, "")))
    : null
  const shareProduct = async () => {
    const url = `https://cozycraftfurnitures.com/products/${encodeURIComponent(p.id)}`
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `See ${p.name} at CozyCraft`, url })
      else {
        await navigator.clipboard.writeText(url)
        window.alert("Product link copied.")
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") console.warn("Unable to share product", error)
    }
  }
  const move = (direction: number) => {
    if (gallery.length < 2) return
    setSlide((x) => (x + direction + gallery.length) % gallery.length)
  }
  return (
    <section
      className="detail-sheet atelier-detail"
      role="dialog"
      aria-modal="true"
      aria-label={`${p.name} details`}
    >
      <header className="atelier-header">
        <button onClick={close} aria-label="Return to collection">
          ←
        </button>
        <span>COZYCRAFT / OBJECTS</span>
        <button onClick={save} aria-label="Save this item">
          {saved ? "♥" : "♡"}
        </button>
      </header>
      <section
        className="atelier-gallery"
        onTouchStart={(e) => setTouch(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const d = e.changedTouches[0].clientX - touch
          if (Math.abs(d) > 35) move(d > 0 ? -1 : 1)
        }}
      >
        <div
          className="atelier-track"
          style={{ transform: `translateX(-${slide * 100}%)` }}
        >
          {gallery.map((src, i) => (
            <img
              src={src}
              key={`${src}-${i}`}
              alt={i === 0 ? p.alt : `${p.name}, gallery view ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
        </div>
        <div className="atelier-gallery-controls">
          <button onClick={() => move(-1)} aria-label="Previous image" disabled={gallery.length < 2}>
            ←
          </button>
          <span>
            {String(slide + 1).padStart(2, "0")} <i /> {String(gallery.length).padStart(2, "0")}
          </span>
          <button onClick={() => move(1)} aria-label="Next image" disabled={gallery.length < 2}>
            →
          </button>
        </div>
      </section>
      <section className="atelier-thumbs">
        {gallery.map((src, i) => (
          <button
            onClick={() => setSlide(i)}
            className={slide === i ? "active" : ""}
            aria-label={`Select image ${i + 1}`}
            key={`${src}-${i}`}
          >
            <img src={src} alt="" loading="lazy" decoding="async" />
          </button>
        ))}
      </section>
      <article className="atelier-content">
        <p className="atelier-kicker">{p.category} · made to order</p>
        <div className="atelier-title">
          <h1>{p.name}</h1>
          <p>
            {p.price} {p.old && <del>{p.old}</del>}
          </p>
        </div>
        <div className="product-rating">
          <span>★ {liveRating.toFixed(1)}</span>
          <button
            onClick={() =>
              document
                .getElementById(`reviews-${p.id}`)
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            {liveReviewCount || Number(p.reviews || 0)} review{(liveReviewCount || Number(p.reviews || 0)) === 1 ? "" : "s"}
          </button>
          <small>{p.stock} pieces available</small>
        </div>
        {p.description && <p className="atelier-intro">{p.description}</p>}
        <section className="product-utility-actions" aria-label="Product actions">
          <button type="button" className={compared ? "active" : ""} aria-pressed={compared} onClick={compare}><span className="material-symbols-rounded" aria-hidden="true">compare_arrows</span>{compared ? "Added to compare" : "Compare"}</button>
          <button type="button" onClick={() => void shareProduct()}><span className="material-symbols-rounded" aria-hidden="true">ios_share</span>Share</button>
        </section>
        <section className="product-purchase product-purchase-direct">
          <button onClick={add}>
            Add to bag <span>{p.price} →</span>
          </button>
        </section>
        <section className="atelier-specs">
          <article>
            <p>Materials</p>
            {materials.length ? <ul>{materials.map((item, index) => <li key={`${item.type}-${index}`}><b>{item.type || "Material"}</b>{item.description && <span>{item.description}</span>}</li>)}</ul> : <small>Material details will be added soon.</small>}
          </article>
          <article>
            <p>Dimensions</p>
            {dimensions.length ? <ul>{dimensions.map((item, index) => <li key={`${item.label}-${index}`}><b>{item.label || "Size"}</b><span>{[item.value, item.unit].filter(Boolean).join(" ")}</span></li>)}</ul> : <small>Dimension details will be added soon.</small>}
          </article>
        </section>
        <section className="product-reviews" id={`reviews-${p.id}`}>
          <header>
            <div>
              <p className="hello">CUSTOMER REVIEWS</p>
              <h2>Loved in real homes.</h2>
              <small>Verified experiences from delivered CozyCraft pieces.</small>
            </div>
          </header>
          <section className="review-overview" aria-label="Review summary">
            <div className="review-score">
              <strong>{liveRating.toFixed(1)}</strong>
              <span aria-label={`${liveRating.toFixed(1)} out of 5 stars`}>{"★".repeat(Math.max(0, Math.min(5, Math.round(liveRating))))}<i>{"★".repeat(5 - Math.max(0, Math.min(5, Math.round(liveRating))))}</i></span>
              <small>{liveReviewCount} published review{liveReviewCount === 1 ? "" : "s"}</small>
            </div>
            <div className="review-distribution">
              {reviewCounts.map(({ rating, count }) => (
                <div key={rating}>
                  <span>{rating} ★</span>
                  <i><b style={{ width: `${customerReviews.length ? (count / customerReviews.length) * 100 : 0}%` }}/></i>
                  <small>{count}</small>
                </div>
              ))}
            </div>
          </section>
          <nav className="review-filters" aria-label="Filter reviews by star rating">
            <button type="button" className={reviewFilter === null ? "active" : ""} aria-pressed={reviewFilter === null} onClick={() => setReviewFilter(null)}>All <span>{customerReviews.length}</span></button>
            {reviewCounts.map(({ rating, count }) => (
              <button type="button" key={rating} className={reviewFilter === rating ? "active" : ""} aria-pressed={reviewFilter === rating} onClick={() => setReviewFilter(rating)}>{rating} star <span>{count}</span></button>
            ))}
          </nav>
          <div className="review-list">
            {filteredReviews.map((review) => (
              <article key={review.id}>
                <header className="review-card-header">
                  <ReviewerAvatar name={review.reviewer_display_name} src={review.reviewer_avatar_url}/>
                  <span className="reviewer-identity"><b>{review.reviewer_display_name || "CozyCraft customer"}</b><small><span className="material-symbols-rounded" aria-hidden="true">verified</span> Verified purchase</small></span>
                  <time dateTime={review.created_at}>
                    {new Date(review.created_at).toLocaleDateString("en-PH", {
                      dateStyle: "medium",
                    })}
                  </time>
                </header>
                <div className="review-card-rating">
                  <b aria-label={`${review.rating} out of 5 stars`}>
                    {"★".repeat(review.rating)}
                    <i>{"★".repeat(5 - review.rating)}</i>
                  </b>
                  <small>{review.rating === 5 ? "Exceptional" : review.rating === 4 ? "Very good" : review.rating === 3 ? "Good" : review.rating === 2 ? "Could be better" : "Needs attention"}</small>
                </div>
                <p>{review.body}</p>
                {Array.isArray(review.image_urls) && review.image_urls.length > 0 && <div className="review-card-photos" aria-label="Customer review photos">{review.image_urls.map((imageUrl, index) => (
                  <a href={imageUrl} target="_blank" rel="noreferrer" key={`${review.id}-${index}`} aria-label={`Open review photo ${index + 1}`}><img src={imageUrl} alt={`${p.name} in ${review.reviewer_display_name || "a customer"}'s home, photo ${index + 1}`} loading="lazy"/></a>
                ))}</div>}
                <footer><span><span className="material-symbols-rounded" aria-hidden="true">home</span> Real home review</span>{!review.approved && <em>Pending moderation · visible to you</em>}</footer>
              </article>
            ))}
            {filteredReviews.length === 0 && <section className="review-empty"><span className="material-symbols-rounded" aria-hidden="true">reviews</span><h3>{reviewFilter ? `No ${reviewFilter}-star reviews yet` : "No reviews yet"}</h3><p>{reviewFilter ? "Try another rating or view all customer reviews." : "The first real-home story for this piece could be yours."}</p>{reviewFilter && <button type="button" onClick={() => setReviewFilter(null)}>View all reviews</button>}</section>}
          </div>
        </section>
        <section className="atelier-note">
          <span className="material-symbols-rounded" aria-hidden="true">local_shipping</span>
          <p>
            <b>{deliveryArea ? `Delivery to ${deliveryArea.name}` : "Delivery, calculated for your home"}</b>
            <small>
              {deliveryArea && deliveryWindow
                ? `${deliveryFee === 0 ? "Free delivery" : `Delivery ${peso(deliveryFee || 0)}`} · estimated ${deliveryWindow.earliest.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}–${deliveryWindow.latest.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}.`
                : userId
                  ? "Add or select a supported delivery address to see the exact fee and estimate."
                  : "Sign in and select an address to see the exact fee and delivery estimate."}
            </small>
          </p>
        </section>
      </article>
    </section>
  )
}

function formatCheckoutAddress(address: MobileAddress) {
  return [
    address.address_line,
    address.barangay,
    address.city,
    address.province,
    address.postal_code,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ")
}

const philippineRegionName = (region: PhilippineRegion) =>
  region.regCode === "13"
    ? "Metro Manila (National Capital Region — NCR)"
    : region.regionName

const normalizedLocation = (value: string) => value.trim().toLocaleLowerCase()

function PhilippineLocationFields({
  address,
  update,
  reportError,
}: {
  address: MobileAddress
  update: (changes: Partial<MobileAddress>) => void
  reportError: (message: string) => void
}) {
  const [regions, setRegions] = useState<PhilippineRegion[]>([])
  const [provinces, setProvinces] = useState<PhilippineProvince[]>([])
  const [municipalities, setMunicipalities] = useState<PhilippineMunicipality[]>([])
  const [barangays, setBarangays] = useState<PhilippineBarangay[]>([])
  const [provinceCode, setProvinceCode] = useState("")
  const [municipalityCode, setMunicipalityCode] = useState("")
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [barangaysLoading, setBarangaysLoading] = useState(false)

  const regionOptions = useMemo(
    () => [...regions].sort((a, b) => a.regionName.localeCompare(b.regionName)),
    [regions],
  )
  const provinceOptions = useMemo(
    () => provinces
      .filter((item) => !item.cityClass)
      .sort((a, b) => a.provName.localeCompare(b.provName)),
    [provinces],
  )
  const municipalityOptions = useMemo(() => {
    const [kind, code] = provinceCode.split(":")
    return municipalities
      .filter((item) => kind === "region"
        ? item.regCode === code
        : kind === "province" && item.provCode === code)
      .sort((a, b) => a.munCityName.localeCompare(b.munCityName))
  }, [municipalities, provinceCode])
  const barangayOptions = useMemo(
    () => [...barangays].sort((a, b) => a.brgyName.localeCompare(b.brgyName)),
    [barangays],
  )

  useEffect(() => {
    let active = true
    setLocationsLoading(true)
    void loadPhilippineLocations()
      .then((locations) => {
        if (!active) return
        setRegions(locations.regions)
        setProvinces(locations.provinces)
        setMunicipalities(locations.municipalities)
      })
      .catch((cause) => {
        if (active) reportError(cause instanceof Error ? cause.message : "Unable to load Philippine locations.")
      })
      .finally(() => {
        if (active) setLocationsLoading(false)
      })
    return () => { active = false }
  }, [])

  // Restore the PSGC codes for an existing saved address. Matching the city as
  // a fallback also supports older records that stored "Metro Manila" instead
  // of the website's longer National Capital Region display name.
  useEffect(() => {
    if (locationsLoading || provinceCode || !address.province || !address.city) return
    const provinceName = normalizedLocation(address.province)
    const cityName = normalizedLocation(address.city)
    const matchedProvince = provinceOptions.find((item) => normalizedLocation(item.provName) === provinceName)
    const matchedRegion = regionOptions.find((item) =>
      normalizedLocation(item.regionName) === provinceName ||
      normalizedLocation(philippineRegionName(item)) === provinceName,
    )
    const cityMatch = municipalities.find((item) =>
      normalizedLocation(item.munCityName) === cityName &&
      (!matchedProvince || item.provCode === matchedProvince.provCode) &&
      (!matchedRegion || item.regCode === matchedRegion.regCode),
    )
    if (!cityMatch) return
    const inferredProvince = matchedProvince || provinceOptions.find((item) => item.provCode === cityMatch.provCode)
    const inferredRegion = matchedRegion || regionOptions.find((item) => item.regCode === cityMatch.regCode)
    const selectorValue = inferredProvince
      ? `province:${inferredProvince.provCode}`
      : inferredRegion
        ? `region:${inferredRegion.regCode}`
        : ""
    if (selectorValue) {
      setProvinceCode(selectorValue)
      setMunicipalityCode(cityMatch.munCityCode)
    }
  }, [address.city, address.province, locationsLoading, municipalities, provinceCode, provinceOptions, regionOptions])

  useEffect(() => {
    if (!municipalityCode) {
      setBarangays([])
      return
    }
    let active = true
    setBarangaysLoading(true)
    setBarangays([])
    void loadPhilippineBarangays(municipalityCode)
      .then((items) => {
        if (active) setBarangays(items)
      })
      .catch((cause) => {
        if (active) reportError(cause instanceof Error ? cause.message : "Unable to load barangays.")
      })
      .finally(() => {
        if (active) setBarangaysLoading(false)
      })
    return () => { active = false }
  }, [municipalityCode])

  return <>
    <label>
      <span>Province / region</span>
      <select
        value={provinceCode}
        disabled={locationsLoading}
        required
        onChange={(event) => {
          const selectorValue = event.target.value
          const [kind, code] = selectorValue.split(":")
          const locationName = kind === "region"
            ? (() => {
                const region = regionOptions.find((item) => item.regCode === code)
                return region ? philippineRegionName(region) : ""
              })()
            : provinceOptions.find((item) => item.provCode === code)?.provName || ""
          setProvinceCode(selectorValue)
          setMunicipalityCode("")
          update({ province: locationName, city: "", barangay: "" })
        }}
      >
        <option value="">{locationsLoading ? "Loading locations…" : "Select province / region"}</option>
        <optgroup label="Regions">
          {regionOptions.map((item) => <option key={`region-${item.regCode}`} value={`region:${item.regCode}`}>{philippineRegionName(item)}</option>)}
        </optgroup>
        <optgroup label="Provinces">
          {provinceOptions.map((item) => <option key={`province-${item.provCode}`} value={`province:${item.provCode}`}>{item.provName}</option>)}
        </optgroup>
      </select>
    </label>
    <label>
      <span>City / municipality</span>
      <select
        value={municipalityCode}
        disabled={!provinceCode || locationsLoading}
        required
        onChange={(event) => {
          const code = event.target.value
          const municipality = municipalityOptions.find((item) => item.munCityCode === code)
          setMunicipalityCode(code)
          update({ city: municipality?.munCityName || "", barangay: "" })
        }}
      >
        <option value="">{provinceCode ? "Select city / municipality" : "Select province / region first"}</option>
        {municipalityOptions.map((item) => <option key={item.munCityCode} value={item.munCityCode}>{item.munCityName}</option>)}
      </select>
    </label>
    <label>
      <span>Barangay</span>
      <select
        value={address.barangay}
        disabled={!municipalityCode || barangaysLoading}
        required
        onChange={(event) => update({ barangay: event.target.value })}
      >
        <option value="">{barangaysLoading ? "Loading barangays…" : municipalityCode ? "Select barangay" : "Select city / municipality first"}</option>
        {barangayOptions.map((item) => <option key={item.brgyCode} value={item.brgyName.trim()}>{item.brgyName.trim()}</option>)}
      </select>
    </label>
  </>
}

function CheckoutPage({
  userId,
  lines,
  profile,
  storeSettings,
  deliveryAreas,
  redemptions,
  close,
  complete,
}: {
  userId: string
  lines: CartLine[]
  profile: { name: string; email: string; phone: string; image: string }
  storeSettings: MobileStoreSettings
  deliveryAreas: MobileDeliveryServiceArea[]
  redemptions: MobileRedemption[]
  close: () => void
  complete: (order: CustomerOrder) => void
}) {
  const [step, setStep] = useState(0)
  const [address, setAddress] = useState(
    "",
  )
  const [addresses, setAddresses] = useState<MobileAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState("")
  const [editingAddress, setEditingAddress] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressDraft, setAddressDraft] = useState<MobileAddress>({
    label: "Home",
    recipient_name: profile.name,
    mobile: profile.phone,
    email: profile.email,
    address_line: "",
    barangay: "",
    city: "",
    province: "",
    postal_code: "",
    delivery_note: "",
    is_primary: false,
  })
  const [payment, setPayment] = useState("Cash on delivery")
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState("")
  const [redemptionId, setRedemptionId] = useState("")
  useEffect(() => {
    if (!userId) return
    void Promise.all([loadAddresses(userId), loadPaymentPreference(userId)]).then(([savedAddresses, preferred]) => {
      setAddresses(savedAddresses)
      const savedAddress = savedAddresses.find((item) => item.is_primary) || savedAddresses[0]
      if (savedAddress) {
        setSelectedAddressId(savedAddress.id || "")
        setAddress(formatCheckoutAddress(savedAddress))
      } else {
        setEditingAddress(true)
      }
      setPayment(preferred === "gcash" ? "GCash" : preferred === "card" ? "Credit or debit card" : "Cash on delivery")
    }).catch(() => undefined)
  }, [userId])
  const selectAddress = (savedAddress: MobileAddress) => {
    setSelectedAddressId(savedAddress.id || "")
    setAddress(formatCheckoutAddress(savedAddress))
    setEditingAddress(false)
    setError("")
  }
  const beginAddress = (savedAddress?: MobileAddress) => {
    setAddressDraft(savedAddress ? { ...savedAddress } : {
      label: "Home",
      recipient_name: profile.name,
      mobile: profile.phone,
      email: profile.email,
      address_line: "",
      barangay: "",
      city: "",
      province: "",
      postal_code: "",
      delivery_note: "",
      is_primary: addresses.length === 0,
    })
    setEditingAddress(true)
    setError("")
  }
  const persistAddress = async () => {
    const required = [addressDraft.recipient_name, addressDraft.mobile, addressDraft.address_line, addressDraft.barangay, addressDraft.city, addressDraft.province, addressDraft.postal_code]
    if (required.some((value) => !value.trim())) {
      setError("Complete the recipient, mobile number, and full Philippine delivery address.")
      return
    }
    setSavingAddress(true)
    setError("")
    try {
      await saveAddress(userId, addressDraft)
      const updated = await loadAddresses(userId)
      setAddresses(updated)
      const saved = addressDraft.id
        ? updated.find((item) => item.id === addressDraft.id)
        : updated.find((item) => item.address_line === addressDraft.address_line && item.mobile === addressDraft.mobile) || updated[0]
      if (saved) selectAddress(saved)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The address could not be saved.")
    } finally {
      setSavingAddress(false)
    }
  }
  const steps = ["Delivery", "Payment", "Review"]
  const total = lines.reduce(
    (sum, line) =>
      sum + Number(line.product.price.replace(/[₱,]/g, "")) * line.quantity,
    0,
  )
  const checkoutSettings = storeSettings.checkout_settings || {}
  const selectedDeliveryAddress = addresses.find((item) => item.id === selectedAddressId) || null
  const deliveryArea = selectedDeliveryAddress
    ? mobileDeliveryAreaForAddress(deliveryAreas, selectedDeliveryAddress)
    : null
  const deliveryFee = deliveryArea ? mobileDeliveryFeeFor(deliveryArea, total) : 0
  const deliveryWindow = deliveryArea ? mobileDeliveryDateRange(deliveryArea) : null
  const freeDeliveryRemaining = deliveryArea?.free_delivery_minimum !== null
    && deliveryArea
    && deliveryArea.free_delivery_minimum > total
    ? deliveryArea.free_delivery_minimum - total
    : 0
  const checkoutError = mobileCheckoutAmountError(total, checkoutSettings)
  const selectedReward = redemptions.find((reward) => reward.id === redemptionId)
  const rewardDiscount = selectedReward ? Math.min(Number(selectedReward.discount_amount), Math.max(0, total + deliveryFee - 1)) : 0
  const grandTotal = total + deliveryFee - rewardDiscount
  const paymentMethods = [
    { id: "cod" as const, name: "Cash on delivery", icon: "payments", note: Number(checkoutSettings.cod_maximum_order || 0) > 0 ? `Available up to ₱${Number(checkoutSettings.cod_maximum_order).toLocaleString()}` : "Pay when your furniture arrives", enabled: mobilePaymentMethodAvailable("cod", total, checkoutSettings) },
    { id: "gcash" as const, name: "GCash", icon: "smartphone", note: "Secure PayMongo mobile payment", enabled: mobilePaymentMethodAvailable("gcash", total, checkoutSettings) },
    { id: "card" as const, name: "Credit or debit card", icon: "credit_card", note: "Secure PayMongo · Visa · Mastercard", enabled: mobilePaymentMethodAvailable("card", total, checkoutSettings) },
  ]
  useEffect(() => {
    if (paymentMethods.some((method) => method.name === payment && method.enabled)) return
    setPayment(paymentMethods.find((method) => method.enabled)?.name || "")
  }, [payment, total, checkoutSettings.cod_enabled, checkoutSettings.card_enabled, checkoutSettings.gcash_enabled, checkoutSettings.cod_maximum_order])
  const place = async () => {
    if (!selectedDeliveryAddress || !deliveryArea) {
      setError("Choose a serviceable Philippine delivery address before placing your order.")
      return
    }
    if (checkoutError) {
      setError(checkoutError)
      return
    }
    if (!payment) {
      setError("No payment method is currently available for this order.")
      return
    }
    setPlacing(true)
    setError("")
    try {
      const result = await placeOrder({ userId, payment, items: lines, redemptionId: redemptionId || undefined, addressId: selectedAddressId || undefined })
      const requiresPayMongo = payment !== "Cash on delivery"
      if (requiresPayMongo) {
        if (!result.checkoutUrl || !/^https:\/\//i.test(result.checkoutUrl)) {
          throw new Error("The secure PayMongo payment page could not be opened. Your order has not been completed; please try again.")
        }
        window.localStorage.setItem("cozycraft-pending-payment", JSON.stringify({
          orderId: result.order?.id,
          orderNumber: result.order?.order_number,
          startedAt: new Date().toISOString(),
          total: grandTotal,
          subtotal: total,
          deliveryFee,
          deliveryAreaName: deliveryArea.name,
          rewardDiscount,
          address,
          payment,
          items: lines,
        }))
        if (window.parent !== window) {
          window.parent.postMessage({ type: "cozycraft-open-paymongo", url: result.checkoutUrl }, "*")
        } else {
          window.location.assign(result.checkoutUrl)
        }
        return
      }
      const order: CustomerOrder = {
        id: result.order?.order_number || result.order?.id || `CC-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString(),
        total: grandTotal,
        subtotal: total,
        deliveryFee,
        deliveryAreaName: deliveryArea.name,
        rewardDiscount,
        status: "Processing",
        payment,
        paymentStatus: payment === "Cash on delivery" ? "pay_on_delivery" : "pending",
        address,
        items: lines,
      }
      complete(order)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be completed.")
    } finally {
      setPlacing(false)
    }
  }
  return (
    <section
      className="checkout-page"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <header className="checkout-header">
        <button onClick={close} aria-label="Close checkout">
          ←
        </button>
        <div>
          <small>SECURE CHECKOUT</small>
          <b>CozyCraft</b>
        </div>
        <span className="material-symbols-rounded">lock</span>
      </header>
      <main>
        <ol className="checkout-progress">
          {steps.map((label, index) => (
            <li key={label} className={index <= step ? "active" : ""}>
              <span>{index < step ? "✓" : index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>
        {step === 0 && (
          <section className="checkout-panel">
            <p className="hello">DELIVERY DETAILS</p>
            <h1>
              Where should we
              <br />
              <em>bring your pieces?</em>
            </h1>
            <div className="checkout-contact">
              <span className="material-symbols-rounded">person</span>
              <div>
                <b>{profile.name}</b>
                <small>
                  {profile.phone} · {profile.email}
                </small>
              </div>
            </div>
            {!editingAddress && addresses.length > 0 && <section className="checkout-addresses" aria-label="Saved delivery addresses">
              <div className="checkout-address-heading">
                <div>
                  <small>DELIVERY ADDRESS</small>
                  <b>Saved addresses</b>
                </div>
                <button type="button" onClick={() => beginAddress()}>
                  <span className="material-symbols-rounded" aria-hidden="true">add</span>
                  Add address
                </button>
              </div>
              {addresses.map((savedAddress) => <article key={savedAddress.id} className={selectedAddressId === savedAddress.id ? "selected" : ""}>
                <button type="button" className="checkout-address-select" aria-pressed={selectedAddressId === savedAddress.id} onClick={() => selectAddress(savedAddress)}>
                  <span className="checkout-address-icon material-symbols-rounded" aria-hidden="true">{savedAddress.label.toLowerCase().includes("work") ? "business" : "home"}</span>
                  <span className="checkout-address-copy">
                    <span className="checkout-address-title">
                      <b>{savedAddress.label || "Address"}</b>
                      {savedAddress.is_primary && <small>DEFAULT</small>}
                    </span>
                    <span className="checkout-address-recipient">{savedAddress.recipient_name} · {savedAddress.mobile}</span>
                    <span className="checkout-address-line">{formatCheckoutAddress(savedAddress)}</span>
                  </span>
                  <i className="material-symbols-rounded" aria-hidden="true">{selectedAddressId === savedAddress.id ? "check" : ""}</i>
                </button>
                <button type="button" className="checkout-address-edit" onClick={() => beginAddress(savedAddress)} aria-label={`Edit ${savedAddress.label || "delivery"} address`}>
                  <span className="material-symbols-rounded" aria-hidden="true">edit</span>
                  Edit
                </button>
              </article>)}
            </section>}
            {editingAddress && <section className="checkout-address-editor">
              <div className="checkout-address-heading">
                <div><small>DELIVERY ADDRESS</small><b>{addressDraft.id ? "Edit address" : "Add a new address"}</b></div>
                {addresses.length > 0 && <button type="button" onClick={() => setEditingAddress(false)}>Cancel</button>}
              </div>
              <div className="checkout-address-grid">
                <label><span>Label</span><input value={addressDraft.label} onChange={(event) => setAddressDraft({ ...addressDraft, label: event.target.value })} placeholder="Home" /></label>
                <label><span>Recipient</span><input value={addressDraft.recipient_name} onChange={(event) => setAddressDraft({ ...addressDraft, recipient_name: event.target.value })} /></label>
                <label><span>Mobile number</span><input inputMode="tel" value={addressDraft.mobile} onChange={(event) => setAddressDraft({ ...addressDraft, mobile: event.target.value })} placeholder="09XXXXXXXXX" /></label>
                <label className="wide"><span>House / unit / building / street</span><input value={addressDraft.address_line} onChange={(event) => setAddressDraft({ ...addressDraft, address_line: event.target.value })} /></label>
                <PhilippineLocationFields
                  key={addressDraft.id || "new-address"}
                  address={addressDraft}
                  update={(changes) => setAddressDraft((current) => ({ ...current, ...changes }))}
                  reportError={setError}
                />
                <label><span>Postal code</span><input inputMode="numeric" value={addressDraft.postal_code} onChange={(event) => setAddressDraft({ ...addressDraft, postal_code: event.target.value })} /></label>
                <label className="wide"><span>Delivery note (optional)</span><input value={addressDraft.delivery_note} onChange={(event) => setAddressDraft({ ...addressDraft, delivery_note: event.target.value })} /></label>
              </div>
              <label className="checkout-primary"><input type="checkbox" checked={addressDraft.is_primary} onChange={(event) => setAddressDraft({ ...addressDraft, is_primary: event.target.checked })} /> Use as default delivery address</label>
              <button type="button" className="checkout-save-address" disabled={savingAddress} onClick={() => void persistAddress()}>{savingAddress ? "Saving…" : "Save and use this address"}</button>
            </section>}
            {error && <p className="form-notice" role="alert">{error}</p>}
            <section className="checkout-delivery-promise">
              <span className="material-symbols-rounded">local_shipping</span>
              <div>
                <small>{deliveryArea ? `DELIVERY PROMISE · ${deliveryArea.name.toUpperCase()}` : "DELIVERY PROMISE"}</small>
                <b>{deliveryArea
                  ? `${deliveryArea.lead_time_min_days}–${deliveryArea.lead_time_max_days} business days`
                  : "Choose an address for timing and fees"}</b>
                <p>{deliveryArea
                  ? `${deliveryArea.assembly_available ? "Assembly available" : "Assembly not included"}${deliveryWindow ? ` · Estimated ${deliveryWindow.earliest.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}–${deliveryWindow.latest.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}` : ""}`
                  : "The final charge is calculated from your saved Philippine address."}</p>
              </div>
              <strong>{deliveryArea ? deliveryFee > 0 ? `₱${deliveryFee.toLocaleString()}` : "FREE" : "—"}</strong>
              {freeDeliveryRemaining > 0 && <aside>
                <span>Add ₱{freeDeliveryRemaining.toLocaleString()} more for free delivery.</span>
                <i><b style={{ width: `${Math.min(100, Math.max(4, total / Number(deliveryArea?.free_delivery_minimum || 1) * 100))}%` }}/></i>
              </aside>}
            </section>
          </section>
        )}
        {step === 1 && (
          <section className="checkout-panel">
            <p className="hello">PAYMENT METHOD</p>
            <h1>
              Choose what feels
              <br />
              <em>most convenient.</em>
            </h1>
            <div className="payment-options">
              {paymentMethods.map((method) => (
                <button
                  key={method.name}
                  disabled={!method.enabled}
                  className={payment === method.name ? "selected" : ""}
                  onClick={() => method.enabled && setPayment(method.name)}
                >
                  <span className="material-symbols-rounded">
                    {method.icon}
                  </span>
                  <div>
                    <b>{method.name}</b>
                    <small>{method.enabled ? method.note : "Unavailable for this order"}</small>
                  </div>
                  <i>{payment === method.name ? "✓" : method.enabled ? "" : "—"}</i>
                </button>
              ))}
            </div>
            {redemptions.length > 0 && <section className="checkout-rewards">
              <p className="hello">HOME CIRCLE REWARD</p>
              <button className={!redemptionId ? "selected" : ""} onClick={() => setRedemptionId("")}><span>No reward</span><b>Keep for later</b></button>
              {redemptions.map((reward) => <button key={reward.id} className={redemptionId === reward.id ? "selected" : ""} onClick={() => setRedemptionId(reward.id)}>
                <span>{reward.code}</span><b>Save ₱{Number(reward.discount_amount).toLocaleString()}</b><small>Expires {new Date(reward.expires_at).toLocaleDateString("en-PH")}</small>
              </button>)}
            </section>}
            <p className="secure-note">
              <span className="material-symbols-rounded">verified_user</span>
              Your payment information is encrypted and protected.
            </p>
          </section>
        )}
        {step === 2 && (
          <section className="checkout-panel checkout-review">
            <p className="hello">REVIEW YOUR ORDER</p>
            <h1>
              Everything,
              <br />
              <em>considered.</em>
            </h1>
            <div className="checkout-items">
              {lines.map((line) => (
                <article key={line.product.id}>
                  <img src={line.product.image} alt="" />
                  <div>
                    <b>{line.product.name}</b>
                    <small>
                      {line.product.category} · Qty {line.quantity}
                    </small>
                  </div>
                  <strong>{line.product.price}</strong>
                </article>
              ))}
            </div>
            <dl>
              <div>
                <dt>Delivery to</dt>
                <dd>{address}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{payment}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>{deliveryArea ? `${deliveryArea.name} · ${deliveryFee ? `₱${deliveryFee.toLocaleString()}` : "Free"}` : "Select an address"}</dd>
              </div>
              {deliveryArea && <div><dt>Estimated arrival</dt><dd>{deliveryArea.lead_time_min_days}–{deliveryArea.lead_time_max_days} business days · {deliveryArea.assembly_available ? "Assembly available" : "Assembly not included"}</dd></div>}
              {rewardDiscount > 0 && <div className="checkout-reward-total"><dt>Home Circle reward</dt><dd>−₱{rewardDiscount.toLocaleString()}</dd></div>}
            </dl>
            {checkoutError && <p className="form-notice" role="alert">{checkoutError}</p>}
          </section>
        )}
      </main>
      <footer className="checkout-footer">
        <div>
          <small>TOTAL</small>
          <strong>₱{grandTotal.toLocaleString()}</strong>
        </div>
        {step > 0 && (
          <button className="checkout-back" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button
          className="checkout-next"
          disabled={!address.trim() || !selectedAddressId || !deliveryArea || placing || editingAddress || (step === 2 && (Boolean(checkoutError) || !payment))}
          onClick={() => {
            if (step === 0 && !deliveryArea) {
              setError("Delivery is not currently available for this address.")
              return
            }
            if (step === 1 && !payment) {
              setError("No payment method is currently available for this order.")
              return
            }
            setError("")
            if (step < 2) setStep(step + 1)
            else void place()
          }}
        >
          {placing
            ? "Placing order…"
            : step < 2
              ? "Continue →"
              : checkoutError || "Place order →"}
        </button>
      </footer>
    </section>
  )
}

function OrderComplete({
  order,
  pushPermission,
  enableNotifications,
  close,
  goHome,
}: {
  order: CustomerOrder
  pushPermission: "unknown" | "granted" | "denied" | "unsupported"
  enableNotifications: () => void
  close: () => void
  goHome: () => void
}) {
  return (
    <section
      className="order-complete"
      role="dialog"
      aria-modal="true"
      aria-label="Order placed"
    >
      <div>
        <span>✓</span>
        <p className="hello">ORDER CONFIRMED</p>
        <h2>
          Your home is
          <br />
          <em>on its way.</em>
        </h2>
        <p>
          Order <b>#{order.id}</b> is confirmed. We’ll send your delivery
          details to your email shortly.
        </p>
        {pushPermission === "unknown" && <aside className="order-notification-optin"><span className="material-symbols-rounded" aria-hidden="true">notifications_active</span><div><b>Know when it moves.</b><small>Enable useful packing, shipping, and delivery updates for this device.</small></div><button type="button" onClick={enableNotifications}>Enable</button></aside>}
        <button onClick={goHome}>Back to home</button>
        <button className="text-button" onClick={close}>
          Continue browsing
        </button>
      </div>
    </section>
  )
}

function MembershipPage({ points, tier, lifetimeSpend, orderCount, activity, redemptions, close, shop, redeem }: {
  points: number
  tier: string
  lifetimeSpend: number
  orderCount: number
  activity: Array<Record<string, any>>
  redemptions: MobileRedemption[]
  close: () => void
  shop: () => void
  redeem: (points: 100 | 250 | 500) => Promise<void>
}) {
  const [redeeming, setRedeeming] = useState(0)
  const levels = [
    { name: "Cozy Member", target: 0, benefits: "1 point per ₱100 · synced wishlist · live order tracking" },
    { name: "Cozy Plus", target: 15000, benefits: "₱300 welcome reward · early collection access · priority support" },
    { name: "Cozy Premium", target: 50000, benefits: "1.5× order points · Metro Manila delivery benefit · birthday reward" },
    { name: "Cozy Elite", target: 120000, benefits: "2× order points · priority scheduling · assembly and annual care" },
  ]
  const index = Math.max(0, levels.findIndex((level) => level.name === tier))
  const next = levels[index + 1]
  const floor = levels[index].target
  const progress = next ? Math.min(100, ((lifetimeSpend - floor) / (next.target - floor)) * 100) : 100
  const availableRewards = redemptions.filter((reward) => reward.status === "available").length
  const earnedPoints = activity.reduce((total, entry) => total + Math.max(0, Number(entry.points) || 0), 0)
  const performRedemption = async (value: 100 | 250 | 500) => {
    setRedeeming(value)
    try { await redeem(value) } finally { setRedeeming(0) }
  }
  return (
    <section className="membership-page" role="dialog" aria-modal="true" aria-label="Home Circle membership">
      <header>
        <button onClick={close} aria-label="Close Home Circle">← <span>Back</span></button>
        <p>HOME CIRCLE</p>
        <span>{tier}</span>
      </header>
      <main>
        <section className="membership-hero-card">
          <div className="membership-hero-head">
            <p>COZYCRAFT MEMBER WALLET</p>
            <span>ESTD 2026</span>
          </div>
          <div className="membership-balance-row">
            <span><strong>{points.toLocaleString()}</strong><small>available points</small></span>
            <span className="membership-monogram">CC</span>
          </div>
          <div className="membership-progress-label"><span>{tier}</span><b>{Math.round(progress)}%</b></div>
          <div className="membership-hero-progress"><i style={{ width: `${progress}%` }} /></div>
          <span className="membership-next-note">{next ? `₱${Math.max(0, next.target - lifetimeSpend).toLocaleString()} eligible spend until ${next.name}` : "Highest Home Circle level unlocked"}</span>
        </section>
        <section className="membership-snapshot" aria-label="Membership summary">
          <article><strong>{orderCount}</strong><span>delivered<br/>orders</span></article>
          <article><strong>{earnedPoints.toLocaleString()}</strong><span>points<br/>earned</span></article>
          <article><strong>{availableRewards}</strong><span>active<br/>rewards</span></article>
        </section>
        <div className="membership-section-heading"><span>YOUR JOURNEY</span><small>Four levels of considered living</small></div>
        <section className="membership-levels">
          {levels.map((level, levelIndex) => <article key={level.name} className={`${level.name === tier ? "active" : ""} ${levelIndex < index ? "complete" : ""}`}>
            <span className="membership-level-number">{String(levelIndex + 1).padStart(2, "0")}</span>
            <span className="membership-level-copy"><b>{level.name}</b><small>{level.benefits}</small></span>
            <span className="membership-level-threshold">{level.name === tier ? "CURRENT" : levelIndex < index ? "UNLOCKED" : `₱${level.target.toLocaleString()}`}</span>
          </article>)}
        </section>
        <section className="membership-redeem">
          <div className="membership-redeem-title"><span><p className="hello">REWARD ATELIER</p><h2>Turn points into<br/><em>something special.</em></h2></span><small>{points.toLocaleString()} PTS</small></div>
          <div>{([[100,100],[250,300],[500,700]] as const).map(([cost, value]) =>
            <button key={cost} disabled={points < cost || Boolean(redeeming)} onClick={() => void performRedemption(cost)}>
              <small>HOME REWARD</small><b>₱{value}</b><span>{redeeming === cost ? "Creating…" : `${cost} points`} <i>→</i></span>
            </button>)}</div>
          <small className="membership-redeem-note">Rewards expire after 30 days and can cover up to the checkout limit shown in the app.</small>
        </section>
        <section className="membership-how">
          <p className="hello">HOW IT WORKS</p>
          <h2>Good taste has<br/><em>its rewards.</em></h2>
          <article><b>01</b><div><strong>Earn as you furnish</strong><span>Receive 1 point for every ₱100 from successfully delivered CozyCraft orders.</span></div></article>
          <article><b>02</b><div><strong>Keep everything in sync</strong><span>Your {orderCount} successful order{orderCount === 1 ? "" : "s"} and member balance follow your account across devices.</span></div></article>
          <article><b>03</b><div><strong>Enjoy member access</strong><span>Discover new collections, personal delivery updates, and member announcements first.</span></div></article>
        </section>
        {activity.length > 0 && <section className="membership-activity">
          <div className="membership-list-title"><p className="hello">POINTS LEDGER</p><small>Latest activity</small></div>
          {activity.slice(0, 6).map((entry) => <article key={entry.id}>
            <span>{entry.description}<small>{new Date(entry.created_at).toLocaleDateString("en-PH")}</small></span>
            <b className={Number(entry.points) > 0 ? "earned" : "used"}>{Number(entry.points) > 0 ? "+" : ""}{entry.points}</b>
          </article>)}
        </section>}
        {redemptions.length > 0 && <section className="membership-activity membership-rewards-list">
          <div className="membership-list-title"><p className="hello">MY REWARDS</p><small>{availableRewards} available</small></div>
          {redemptions.map((reward) => <article key={reward.id}>
            <span><strong>{reward.code}</strong><small>{reward.status === "available" ? `₱${Number(reward.discount_amount).toLocaleString()} off · expires ${new Date(reward.expires_at).toLocaleDateString("en-PH")}` : `₱${Number(reward.discount_amount).toLocaleString()} off · ${reward.status}`}</small></span>
            <b className={reward.status === "available" ? "earned" : "used"}>{reward.status}</b>
          </article>)}
        </section>}
        <button className="membership-shop" onClick={shop}>Discover the latest edit <b>→</b></button>
        <p className="membership-fineprint">Home Circle points are exclusive to the CozyCraft mobile app and are calculated from delivered-order totals. Cancelled, pending, refunded, or returned orders do not earn points.</p>
      </main>
    </section>
  )
}

const PROFILE_CROP_SIZE = 640

type ProfileCropOffset = { x: number; y: number }

function clampProfileCropOffset(
  image: HTMLImageElement,
  zoom: number,
  offset: ProfileCropOffset,
): ProfileCropOffset {
  const baseScale = Math.max(
    PROFILE_CROP_SIZE / image.naturalWidth,
    PROFILE_CROP_SIZE / image.naturalHeight,
  )
  const scale = baseScale * zoom
  const maxX = Math.max(0, (image.naturalWidth * scale - PROFILE_CROP_SIZE) / 2)
  const maxY = Math.max(0, (image.naturalHeight * scale - PROFILE_CROP_SIZE) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  }
}

function ProfilePhotoCropper({
  source,
  onCancel,
  onApply,
}: {
  source: string
  onCancel: () => void
  onApply: (croppedPhoto: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: ProfileCropOffset
  } | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<ProfileCropOffset>({ x: 0, y: 0 })
  const [error, setError] = useState("")

  useEffect(() => {
    document.documentElement.classList.add("profile-crop-open")
    document.body.classList.add("profile-crop-open")
    return () => {
      document.documentElement.classList.remove("profile-crop-open")
      document.body.classList.remove("profile-crop-open")
    }
  }, [])

  useEffect(() => {
    let active = true
    const selectedImage = new Image()
    selectedImage.decoding = "async"
    selectedImage.onload = () => {
      if (!active) return
      setImage(selectedImage)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setError("")
    }
    selectedImage.onerror = () => {
      if (!active) return
      setError("We couldn't open this photo. Please choose a JPG, PNG, WebP, HEIC, or HEIF image.")
    }
    selectedImage.src = source
    return () => { active = false }
  }, [source])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const context = canvas.getContext("2d")
    if (!context) return
    const safeOffset = clampProfileCropOffset(image, zoom, offset)
    const baseScale = Math.max(
      PROFILE_CROP_SIZE / image.naturalWidth,
      PROFILE_CROP_SIZE / image.naturalHeight,
    )
    const scale = baseScale * zoom
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    context.clearRect(0, 0, PROFILE_CROP_SIZE, PROFILE_CROP_SIZE)
    context.fillStyle = "#eee9e1"
    context.fillRect(0, 0, PROFILE_CROP_SIZE, PROFILE_CROP_SIZE)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(
      image,
      (PROFILE_CROP_SIZE - width) / 2 + safeOffset.x,
      (PROFILE_CROP_SIZE - height) / 2 + safeOffset.y,
      width,
      height,
    )
  }, [image, offset, zoom])

  const updateZoom = (nextZoom: number) => {
    const normalizedZoom = Math.max(1, Math.min(3, nextZoom))
    setZoom(normalizedZoom)
    if (image) setOffset((current) => clampProfileCropOffset(image, normalizedZoom, current))
  }

  const beginDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
    }
  }

  const moveCrop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!image || !drag || drag.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const displayScale = PROFILE_CROP_SIZE / bounds.width
    setOffset(clampProfileCropOffset(image, zoom, {
      x: drag.origin.x + (event.clientX - drag.startX) * displayScale,
      y: drag.origin.y + (event.clientY - drag.startY) * displayScale,
    }))
  }

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const applyCrop = () => {
    const canvas = canvasRef.current
    if (!canvas || !image || error) return
    try {
      onApply(canvas.toDataURL("image/jpeg", 0.9))
    } catch {
      setError("We couldn't prepare this crop. Please choose the photo again.")
    }
  }

  return createPortal(
    <section className="profile-crop-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-crop-title">
      <div className="profile-crop-dialog">
        <header>
          <div>
            <p>PROFILE PHOTO</p>
            <h2 id="profile-crop-title">Find your best frame.</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close photo cropper">×</button>
        </header>
        <main>
          <div className={`profile-crop-stage${image ? " ready" : ""}`}>
            <canvas
              ref={canvasRef}
              width={PROFILE_CROP_SIZE}
              height={PROFILE_CROP_SIZE}
              role="img"
              aria-label="Profile photo crop preview. Drag the photo to reposition it."
              onPointerDown={beginDrag}
              onPointerMove={moveCrop}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
            {!image && !error && <span className="profile-crop-loading" aria-live="polite">Preparing your photo…</span>}
            {image && <span className="profile-crop-guide" aria-hidden="true" />}
          </div>
          <p className="profile-crop-help"><span className="material-symbols-rounded" aria-hidden="true">open_with</span> Drag to reposition, then use the slider to zoom.</p>
          <label className="profile-crop-zoom">
            <span className="material-symbols-rounded" aria-hidden="true">remove</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={!image}
              onChange={(event) => updateZoom(Number(event.target.value))}
              aria-label="Photo zoom"
            />
            <span className="material-symbols-rounded" aria-hidden="true">add</span>
          </label>
          {error && <p className="profile-crop-error" role="alert">{error}</p>}
          <aside>
            <span className="material-symbols-rounded" aria-hidden="true">lock</span>
            <p><b>Private until you save</b><small>Your cropped photo is only uploaded after you save your profile changes.</small></p>
          </aside>
        </main>
        <footer>
          <button type="button" className="profile-crop-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="profile-crop-apply" disabled={!image || Boolean(error)} onClick={applyCrop}>
            Use this photo <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </button>
        </footer>
      </div>
    </section>,
    document.body,
  )
}

export function ProfilePage({
  userId,
  name,
  username,
  firstName,
  lastName,
  email,
  phone,
  phoneVerifiedAt,
  onPhoneVerified,
  image,
  gender,
  birth,
  points,
  tier,
  completedOrders,
  savedCount,
  openWishlist,
  close,
  save,
}: {
  userId: string
  name: string
  username: string
  firstName: string
  lastName: string
  email: string
  phone: string
  phoneVerifiedAt: string | null
  onPhoneVerified: (verified: VerifiedPhone) => void
  image: string
  gender: string
  birth: string
  points: number
  tier: string
  completedOrders: number
  savedCount: number
  openWishlist: () => void
  close: () => void
  save: (profile: MobileCustomerProfile) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftUsername, setDraftUsername] = useState(username)
  const [draftFirstName, setDraftFirstName] = useState(firstName)
  const [draftLastName, setDraftLastName] = useState(lastName)
  const [draftImage, setDraftImage] = useState(image)
  const [draftPhone, setDraftPhone] = useState(phone)
  const [draftGender, setDraftGender] = useState(gender)
  const [draftBirth, setDraftBirth] = useState(birth)
  const [cropSource, setCropSource] = useState("")
  const [delivery, setDelivery] = useState(true)
  const [circle, setCircle] = useState(false)
  const [preferenceReady, setPreferenceReady] = useState(false)
  const [notice, setNotice] = useState("")
  const [securityOpen, setSecurityOpen] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordNotice, setPasswordNotice] = useState("")
  const phoneVerification = usePhoneVerification({
    userId, savedPhone: phone, phoneVerifiedAt, draftPhone,
    onDraftChange: setDraftPhone,
    onVerified: (verified) => { setNotice(""); onPhoneVerified(verified) },
  })
  const lastSavedPhone = useRef(phone)
  useEffect(() => {
    if (!editing || normalizePhilippineMobile(draftPhone) === normalizePhilippineMobile(lastSavedPhone.current)) setDraftPhone(phone)
    lastSavedPhone.current = phone
  }, [phone, editing])
  useEffect(() => {
    if (editing) return
    setDraftUsername(username)
    setDraftFirstName(firstName)
    setDraftLastName(lastName)
    setDraftImage(image)
    setDraftGender(gender)
    setDraftBirth(birth)
  }, [editing, username, firstName, lastName, image, gender, birth])
  const todayInManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())
  const fullDraftName = `${draftFirstName.trim()} ${draftLastName.trim()}`.trim()
  const displayDraftName = draftUsername.trim() || fullDraftName || name
  const hasChanges = draftUsername !== username || draftFirstName !== firstName ||
    draftLastName !== lastName || draftImage !== image || draftPhone !== phone ||
    draftGender !== gender || draftBirth !== birth
  const resetDraft = () => {
    setDraftUsername(username)
    setDraftFirstName(firstName)
    setDraftLastName(lastName)
    setDraftImage(image)
    setDraftPhone(phone)
    setDraftGender(gender)
    setDraftBirth(birth)
    setCropSource("")
    setNotice("")
    phoneVerification.reset()
  }
  useEffect(() => {
    let live = true
    const refresh = () => void loadCommunicationPreferences(userId).then((value) => {
      if (!live) return
      setDelivery(value.delivery_updates)
      setCircle(value.home_circle_notes)
      setPreferenceReady(true)
    }).catch((error) => setNotice(error.message))
    refresh()
    const channel = supabase.channel(`mobile-preferences-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_preferences", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe()
    return () => { live = false; void supabase.removeChannel(channel) }
  }, [userId])
  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      const provider = String(data.user?.app_metadata?.provider ?? "")
      const providers = Array.isArray(data.user?.app_metadata?.providers)
        ? data.user?.app_metadata?.providers.map(String)
        : []
      setHasPasswordProvider(provider === "email" || providers.includes("email"))
    })
    return () => { active = false }
  }, [userId])
  const updatePreferences = (nextDelivery: boolean, nextCircle: boolean) => {
    setDelivery(nextDelivery)
    setCircle(nextCircle)
    void saveCommunicationPreferences(userId, {
      delivery_updates: nextDelivery,
      home_circle_notes: nextCircle,
    }).then(() => setNotice("Communication preferences updated.")).catch((error) => setNotice(error.message))
  }
  const submitProfile = async () => {
    if (!editing || !hasChanges || saving || phoneVerification.busy) return
    if (!/^[A-Za-z0-9._-]{3,24}$/.test(draftUsername.trim())) {
      setNotice("Username must be 3–24 characters using letters, numbers, dots, underscores, or hyphens.")
      return
    }
    if (!draftFirstName.trim()) { setNotice("First name is required."); return }
    if (draftPhone.trim() && !normalizePhilippineMobile(draftPhone)) {
      setNotice("Enter a valid Philippine mobile number, such as 0917 123 4567.")
      return
    }
    if (phoneVerification.changing && !draftPhone.trim()) {
      setNotice("Enter and verify a replacement number, or choose Keep current number.")
      return
    }
    if (draftPhone.trim() && !phoneVerification.verified) {
      setNotice("Verify your mobile number before saving your profile changes.")
      phoneVerification.start()
      return
    }
    if (draftBirth && draftBirth >= new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())) {
      setNotice("Please choose your actual date of birth in the past.")
      return
    }
    setSaving(true)
    setNotice("")
    try {
      await save({
        name: draftUsername.trim() || fullDraftName,
        username: draftUsername.trim(),
        firstName: draftFirstName.trim(),
        lastName: draftLastName.trim(),
        email,
        phone,
        phoneVerifiedAt,
        image: draftImage,
        gender: draftGender,
        birth: draftBirth,
      })
      setEditing(false)
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message : "Profile changes could not be saved."
      setNotice(message.includes("unique") || message.includes("duplicate") ? "That username is already taken." : message)
    } finally { setSaving(false) }
  }
  const resetPasswordForm = () => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setPasswordNotice("")
  }
  const submitPasswordChange = async () => {
    if (passwordLoading) return
    if (!hasPasswordProvider) {
      setPasswordLoading(true)
      setPasswordNotice("")
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setPasswordLoading(false)
      setPasswordNotice(error ? error.message : "A secure password setup link was sent to your email.")
      return
    }
    if (!currentPassword) { setPasswordNotice("Enter your current CozyCraft password."); return }
    if (newPassword.length < 8) { setPasswordNotice("Your new password must contain at least 8 characters."); return }
    if (newPassword !== confirmPassword) { setPasswordNotice("The new passwords do not match."); return }
    if (newPassword === currentPassword) { setPasswordNotice("Choose a password you have not used for this account."); return }
    setPasswordLoading(true)
    setPasswordNotice("")
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
      if (signInError) throw new Error("Your current password is incorrect.")
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      setPasswordNotice("Your CozyCraft password was changed securely.")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error) {
      setPasswordNotice(error instanceof Error ? error.message : "Your password could not be changed.")
    } finally { setPasswordLoading(false) }
  }
  return (
    <section
      className="profile-page deluxe-profile"
      role="dialog"
      aria-modal="true"
      aria-label="Edit profile"
    >
      <header>
        <button onClick={close} disabled={saving || Boolean(phoneVerification.busy)}>
          ← <span>Account</span>
        </button>
        <p>MY PROFILE</p>
        {editing ? (
          <button disabled={saving || Boolean(phoneVerification.busy)} onClick={() => { resetDraft(); setEditing(false) }}>Cancel</button>
        ) : (
          <button onClick={() => setEditing(true)}>Edit profile</button>
        )}
      </header>
      <main>
        <section className="profile-hero">
          <div className="profile-photo">
            {draftImage ? (
              <img src={draftImage} alt="Your selected profile" />
            ) : (
              <span>
                {displayDraftName
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            )}
          </div>
          <div>
            <p>HOME CIRCLE / {tier.toUpperCase()}</p>
            <h1>{displayDraftName}</h1>
            <small>{points.toLocaleString()} points · {completedOrders} successful order{completedOrders === 1 ? "" : "s"}</small>
          </div>
          {editing && <label className="portrait-action" aria-label="Change profile photo">
            Change photo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.currentTarget.value = ""
                if (!file) return
                setNotice("")
                if (!file.type.startsWith("image/")) {
                  setNotice("Choose a JPG, PNG, WebP, HEIC, or HEIF photo.")
                  return
                }
                if (file.size > 20 * 1024 * 1024) {
                  setNotice("Choose a photo smaller than 20 MB.")
                  return
                }
                const reader = new FileReader()
                reader.onload = () => setCropSource(String(reader.result ?? ""))
                reader.onerror = () => setNotice("We couldn't read that photo. Choose it again from your gallery.")
                reader.readAsDataURL(file)
              }}
            />
          </label>}
        </section>
        <button type="button" className="profile-status" onClick={openWishlist}>
          <span>✦</span>
          <p>
            <b>Your home is evolving</b>
            <small>{savedCount} saved piece{savedCount === 1 ? " is" : "s are"} waiting in your wishlist.</small>
          </p>
          <i>→</i>
        </button>
        <section className="profile-fields deluxe-fields">
          <div className="field-heading">
            <p className="hello">PERSONAL DETAILS</p>
            <small>Visible only to you</small>
          </div>
          <label className="profile-field-wide">
            <span>Username</span>
            <input
              value={draftUsername}
              onChange={(e) => setDraftUsername(e.target.value)}
              disabled={!editing}
              autoComplete="username"
            />
          </label>
          <label><span>First name</span><input value={draftFirstName} onChange={(e) => setDraftFirstName(e.target.value)} disabled={!editing} autoComplete="given-name" /></label>
          <label><span>Last name</span><input value={draftLastName} onChange={(e) => setDraftLastName(e.target.value)} disabled={!editing} autoComplete="family-name" /></label>
          <label className="profile-field-wide">
            <span>Email address</span>
            <input value={email} readOnly disabled aria-readonly="true" />
          </label>
          <PhoneVerificationField phone={draftPhone} savedPhone={phone} verifiedAt={phoneVerifiedAt}
            editing={editing} disabled={saving} onChange={setDraftPhone} verification={phoneVerification} />
          <label><span>Gender</span><select value={draftGender} onChange={(e) => setDraftGender(e.target.value)} disabled={!editing}><option value="">Choose an option</option><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other / prefer not to say</option></select></label>
          <label className="profile-birth-field">
            <span>Date of birth <small>Month / Day / Year</small></span>
            <span className="profile-date-control">
              <input type="date" lang="en-US" max={todayInManila} value={draftBirth} onChange={(e) => setDraftBirth(e.target.value)} disabled={!editing} autoComplete="bday" />
            </span>
          </label>
        </section>
        <section className="profile-preferences deluxe-preferences">
          <div className="field-heading">
            <p className="hello">COMMUNICATIONS</p>
            <small>Tap to update</small>
          </div>
          <button disabled={!preferenceReady} onClick={() => updatePreferences(!delivery, circle)}>
            <span>
              <b>Delivery updates</b>
              <small>SMS and email notifications</small>
            </span>
            <i className={delivery ? "on" : ""}>
              <em />
            </i>
          </button>
          <button disabled={!preferenceReady} onClick={() => updatePreferences(delivery, !circle)}>
            <span>
              <b>Home Circle notes</b>
              <small>New pieces and early access</small>
            </span>
            <i className={circle ? "on" : ""}>
              <em />
            </i>
          </button>
        </section>
        <section className="profile-security" aria-label="Account security">
          <div className="field-heading">
            <p className="hello">ACCOUNT SECURITY</p>
            <small>Private and encrypted</small>
          </div>
          {!securityOpen ? (
            <button className="security-summary" onClick={() => { resetPasswordForm(); setSecurityOpen(true) }}>
              <span className="security-lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="10" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M12 14.5v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
              <span>
                <b>{hasPasswordProvider ? "Change CozyCraft password" : "Set a CozyCraft password"}</b>
                <small>{hasPasswordProvider ? "Confirm your current password before choosing a new one." : "Your Google account can add a separate CozyCraft password."}</small>
              </span>
              <i>→</i>
            </button>
          ) : (
            <div className="security-panel">
              <div className="security-panel-heading">
                <div>
                  <b>{hasPasswordProvider ? "Choose a new password" : "Create your CozyCraft password"}</b>
                  <small>{hasPasswordProvider ? "Use at least 8 characters and a password you have not used before." : "We will email you a secure, single-use password setup link."}</small>
                </div>
                <button aria-label="Close password panel" onClick={() => { resetPasswordForm(); setSecurityOpen(false) }}>×</button>
              </div>
              {hasPasswordProvider && <div className="security-fields">
                <label><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
                <label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} /></label>
                <label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} /></label>
              </div>}
              {passwordNotice && <p className="security-notice" role="status">{passwordNotice}</p>}
              <button className="security-submit" disabled={passwordLoading} onClick={submitPasswordChange}>
                {passwordLoading ? "Please wait…" : hasPasswordProvider ? "Change password" : "Send secure setup link"}
                <b>→</b>
              </button>
            </div>
          )}
        </section>
        {notice && <p className="profile-notice" role="status">{notice}</p>}
        {editing && hasChanges && <button className="profile-save" disabled={saving || Boolean(phoneVerification.busy)} onClick={submitProfile}>{saving ? "Saving…" : "Save profile changes"} <b>→</b></button>}
        {editing && !hasChanges && <p className="profile-no-changes">Make a change and the save button will appear.</p>}
      </main>
      {cropSource && <ProfilePhotoCropper
        source={cropSource}
        onCancel={() => setCropSource("")}
        onApply={(croppedPhoto) => {
          setDraftImage(croppedPhoto)
          setCropSource("")
          setNotice("Your photo is cropped and ready. Save your profile changes to publish it.")
        }}
      />}
    </section>
  )
}

function CategoryPage({
  category,
  close,
  select,
}: {
  category: typeof categories[number]
  close: () => void
  select: (id: string, item: string) => void
}) {
  return (
    <section
      className="category-page"
      role="dialog"
      aria-modal="true"
      aria-label={`${category.title} categories`}
    >
      <header>
        <button onClick={close}>
          ← <span>Home</span>
        </button>
        <span>COZYCRAFT / ROOMS</span>
      </header>
      <section className="category-cover">
        <img
          src={category.image}
          alt={`${category.title} furniture interior`}
        />
        <div>
          <p>SHOP THE ROOM</p>
          <h1>
            {category.title}
            <br />
            <em>furniture.</em>
          </h1>
        </div>
      </section>
      <main>
        {category.groups.map((group, index) => (
          <section className="category-group" key={group.name}>
            <div>
              <span>0{index + 1}</span>
              <h2>{group.name}</h2>
            </div>
            {group.items.map((item) => (
              <button onClick={() => select(category.id, item)} key={item}>
                <span>{item}</span>
                <b>→</b>
              </button>
            ))}
          </section>
        ))}
      </main>
    </section>
  )
}

function NotificationsPage({ close, items, userId, refresh }: {
  close: () => void
  items: Array<Record<string, any>>
  userId: string
  refresh: () => Promise<unknown>
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const visibleItems =
    filter === "unread" ? items.filter((item) => !item.read_at) : items
  return (
    <section
      className="notifications-page"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
    >
      <header>
        <button onClick={close}>
          ← <span>Home</span>
        </button>
        <div>
          <p>NOTIFICATIONS</p>
          <h1>For you</h1>
        </div>
        <button
          onClick={() => void markNotification(userId).then(refresh)}
        >
          Read all
        </button>
      </header>
      <main>
        <div className="notification-tabs">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={filter === "unread" ? "active" : ""}
            onClick={() => setFilter("unread")}
          >
            Unread <span>{items.filter((item) => !item.read_at).length}</span>
          </button>
        </div>
        {visibleItems.map((item) => (
          <article
            key={item.id}
            data-kind={item.kind}
            className={!item.read_at ? "new" : ""}
            onClick={() => void markNotification(userId, String(item.id)).then(refresh)}
          >
            <span className="notification-mark">
              <span className="material-symbols-rounded" aria-hidden="true">
                {String(item.kind).includes("order")
                  ? item.kind === "order_confirmation" ? "task_alt" : "local_shipping"
                  : item.kind === "promotion"
                    ? "campaign"
                    : String(item.kind).includes("support")
                      ? "support_agent"
                      : "notifications"}
              </span>
            </span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.message}</p>
              <small>{new Date(item.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</small>
            </div>
            {!item.read_at && <i />}
          </article>
        ))}
        {!visibleItems.length && (
          <section className="notification-empty">
            <span className="material-symbols-rounded">
              notifications_active
            </span>
            <h2>You’re all caught up.</h2>
            <p>New delivery updates and saved-piece alerts will appear here.</p>
          </section>
        )}
      </main>
      <footer>
        <span>Stay in the know</span>
        <p>New arrivals and member notes, thoughtfully timed.</p>
      </footer>
    </section>
  )
}

function ShopPage({
  products,
  roomId,
  subcategory,
  setRoom,
  setSubcategory,
  openProduct,
  saved,
  bagQuantities,
  save,
  add,
}: {
  products: Product[]
  roomId: string
  subcategory: string
  setRoom: (id: string) => void
  setSubcategory: (s: string) => void
  openProduct: (p: Product) => void
  saved: string[]
  bagQuantities: Record<string, number>
  save: (id: string) => void
  add: (p: Product) => void
}) {
  const room = categories.find((x) => x.id === roomId) ?? categories[0]
  const [sort, setSort] = useState("Featured")
  const [compact, setCompact] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [maxPrice, setMaxPrice] = useState(500000)
  const normalizeTaxonomy = (value: string | undefined) =>
    String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en-PH")
  const selectedSubcategories = useMemo(() => {
    if (!subcategory) return []
    const selectedGroup = room.groups.find(
      (group) => normalizeTaxonomy(group.name) === normalizeTaxonomy(subcategory),
    )
    return (selectedGroup ? selectedGroup.items : [subcategory]).map(normalizeTaxonomy)
  }, [room, subcategory])
  const roomProducts = useMemo(() => {
    const selected = products.filter(
      (product) =>
        product.room === room.id &&
        (!selectedSubcategories.length ||
          selectedSubcategories.includes(normalizeTaxonomy(product.subcategory))) &&
        Number(product.price.replace(/[₱,]/g, "")) <= maxPrice,
    )
    return [...selected].sort((a, b) => {
      const priceA = Number(a.price.replace(/[₱,]/g, ""))
      const priceB = Number(b.price.replace(/[₱,]/g, ""))
      if (sort === "Price: low") return priceA - priceB
      if (sort === "Price: high") return priceB - priceA
      if (sort === "Top rated") return (b.rating ?? 0) - (a.rating ?? 0)
      return (b.reviews ?? 0) - (a.reviews ?? 0)
    })
  }, [maxPrice, products, room.id, selectedSubcategories, sort])
  return (
    <section className="room-shop">
      <header>
        <p className="hello">SHOP BY ROOM</p>
        <h1>
          Find your
          <br />
          <em>right room.</em>
        </h1>
      </header>
      <div className="room-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setRoom(c.id)}
            className={c.id === room.id ? "active" : ""}
          >
            {c.title.replace(" Room", "")}
          </button>
        ))}
      </div>
      <section className="room-banner">
        <img src={room.image} alt={`${room.title} furniture`} />
        <div>
          <p>THE {room.title.toUpperCase()} EDIT</p>
          <h2>{room.note}</h2>
          <span>{room.groups.length} furniture families</span>
        </div>
      </section>
      <section className="catalog-toolbar">
        <div>
          <b>{roomProducts.length} pieces</b>
          <small>{subcategory ? `Available in ${subcategory}` : `Designed for ${room.title.toLowerCase()}`}</small>
        </div>
        <button onClick={() => setFiltersOpen(!filtersOpen)}>
          <span className="material-symbols-rounded">tune</span>Filter
        </button>
        <button
          onClick={() => setCompact(!compact)}
          aria-label="Change product view"
        >
          <span className="material-symbols-rounded">
            {compact ? "grid_view" : "view_agenda"}
          </span>
        </button>
      </section>
      <div className="sort-chips" aria-label="Sort products">
        {["Featured", "Top rated", "Price: low", "Price: high"].map(
          (option) => (
            <button
              key={option}
              className={sort === option ? "active" : ""}
              onClick={() => setSort(option)}
            >
              {option}
            </button>
          ),
        )}
      </div>
      {filtersOpen && (
        <section className="catalog-filters">
          <header>
            <div>
              <p className="hello">REFINE THE EDIT</p>
              <h2>Find your fit.</h2>
            </div>
            <button
              onClick={() => {
                setMaxPrice(500000)
                setSubcategory("")
              }}
            >
              Reset
            </button>
          </header>
          <label>
            <span>
              Maximum price <b>₱{maxPrice.toLocaleString()}</b>
            </span>
            <input
              type="range"
              min="5000"
              max="500000"
              step="5000"
              value={maxPrice}
              onChange={(event) => setMaxPrice(Number(event.target.value))}
            />
          </label>
          <div>
            {room.groups.map((group) => (
              <button
                className={subcategory === group.name ? "active" : ""}
                key={group.name}
                onClick={() =>
                  setSubcategory(subcategory === group.name ? "" : group.name)
                }
              >
                {group.name}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className={`catalog-products ${compact ? "compact" : ""}`}>
        {roomProducts.map((p) => (
          <Card
            key={p.id}
            p={p}
            saved={saved.includes(p.id)}
            bagQuantity={bagQuantities[p.id] || 0}
            save={() => save(p.id)}
            add={() => add(p)}
            open={() => openProduct(p)}
          />
        ))}
      </section>
      {!roomProducts.length && (
        <section className="catalog-empty">
          <span className="material-symbols-rounded">weekend</span>
          <h2>No pieces in this edit yet.</h2>
          <p>{subcategory ? `There are currently no active products assigned to ${subcategory}.` : "Try raising your price range or exploring another room."}</p>
          <button onClick={() => { setMaxPrice(40000); setSubcategory("") }}>Reset filters</button>
        </section>
      )}
      <section className="room-family">
        <div className="room-subhead">
          <span>EXPLORE {room.title.toUpperCase()}</span>
          {subcategory && (
            <button onClick={() => setSubcategory("")}>Clear ×</button>
          )}
        </div>
        {room.groups.map((group, index) => (
          <article key={group.name}>
            <button
              className="family-title"
              onClick={() =>
                setSubcategory(subcategory === group.name ? "" : group.name)
              }
            >
              <span>0{index + 1}</span>
              <b>{group.name}</b>
              <i>{subcategory === group.name ? "−" : "+"}</i>
            </button>
            {(subcategory === group.name || !subcategory) && (
              <div className="family-items">
                {group.items.map((item) => (
                  <button
                    key={item}
                    onClick={() => setSubcategory(item)}
                    className={subcategory === item ? "chosen" : ""}
                  >
                    {item}
                    <span>→</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
      {subcategory && (
        <section className="shop-selection">
          <p>SELECTED CATEGORY</p>
          <h2>{subcategory}</h2>
          <span>Explore a considered edit from this family.</span>
          <div className="lux-grid">
            {roomProducts.map((p) => (
              <Card
                key={p.id}
                p={p}
                saved={saved.includes(p.id)}
                bagQuantity={bagQuantities[p.id] || 0}
                save={() => save(p.id)}
                add={() => add(p)}
                open={() => openProduct(p)}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
