import type { User } from "@supabase/supabase-js"
import { supabase, supabaseUrl } from "./supabase"
import type { MobileDeliveryServiceArea } from "./mobile-delivery"

export type MobileProduct = {
  id: string
  name: string
  category: string
  subcategory?: string
  price: string
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

export type MobileLoyaltyAccount = {
  user_id: string
  points_balance: number
  lifetime_eligible_spend: number
  tier: "member" | "plus" | "premium" | "elite"
  tier_valid_until: string | null
  last_activity_at: string | null
  updated_at: string
}

export async function loadMobileLoyalty(): Promise<MobileLoyaltyAccount> {
  const { data, error } = await supabase.rpc("get_mobile_loyalty")
  if (error) throw error
  return data as MobileLoyaltyAccount
}

export async function loadMobileLoyaltyActivity(userId: string) {
  const { data, error } = await supabase
    .from("mobile_loyalty_transactions")
    .select("id,order_id,kind,points,description,created_at,expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

export type MobileRedemption = {
  id: string
  points_cost: number
  discount_amount: number
  status: "available" | "applied" | "used" | "expired" | "cancelled"
  code: string
  created_at: string
  expires_at: string
  used_at: string | null
}

export async function loadMobileRedemptions(userId: string): Promise<MobileRedemption[]> {
  const { data, error } = await supabase
    .from("mobile_loyalty_redemptions")
    .select("id,points_cost,discount_amount,status,code,created_at,expires_at,used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []) as MobileRedemption[]
}

export async function redeemMobilePoints(points: 100 | 250 | 500) {
  const { data, error } = await supabase.rpc("redeem_mobile_points", { p_points: points })
  if (error) throw error
  return data
}

export async function markMobileOrder(orderId: string) {
  const { error } = await supabase.rpc("mark_mobile_order", { p_order_id: orderId })
  if (error) throw error
}

const parseRows = (value: unknown) => {
  if (Array.isArray(value)) return value
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed
  } catch { /* Legacy newline/bullet values are handled below. */ }
  return value.split(/\n|•/).map((line) => line.replace(/^[-–—]\s*/, "").trim()).filter(Boolean)
}

const parseMaterials = (value: unknown) => parseRows(value).map((item) => {
  if (item && typeof item === "object") {
    const row = item as Record<string, unknown>
    return { type: String(row.type || "").trim(), description: String(row.description || "").trim() }
  }
  const [type, ...description] = String(item).split(/\s*(?::|–|—)\s*/)
  return { type: type.trim(), description: description.join(" – ").trim() }
}).filter((row) => row.type || row.description)

const dimensionNames: Record<string, string> = { W: "Width", D: "Depth", H: "Height", L: "Length" }
const parseDimensions = (value: unknown) => parseRows(value).flatMap((item) => {
  if (item && typeof item === "object") {
    const row = item as Record<string, unknown>
    return [{ label: String(row.label || "").trim(), value: String(row.value || "").trim(), unit: String(row.unit || "").trim() }]
  }
  const line = String(item).trim()
  const compact = [...line.matchAll(/(\d+(?:\.\d+)?)\s*([WDHL])\b/gi)]
  if (compact.length) {
    const unit = line.match(/\b(mm|cm|m|in|ft)\b/i)?.[1] || "cm"
    return compact.map((match) => ({ label: dimensionNames[match[2].toUpperCase()] || match[2].toUpperCase(), value: match[1], unit }))
  }
  const labelled = line.match(/^([^:–—]+?)\s*(?::|–|—)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|ft)?$/i)
  return labelled
    ? [{ label: labelled[1].trim(), value: labelled[2], unit: labelled[3] || "cm" }]
    : [{ label: "Overall", value: line, unit: "" }]
}).filter((row) => row.label || row.value)

export const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value)

const roomFor = (category: string) => {
  const value = category.toLowerCase()
  if (value.includes("bed")) return "bedroom" as const
  if (value.includes("dining")) return "dining" as const
  return "living" as const
}

export const mapProduct = (row: Record<string, any>): MobileProduct => {
  const uploadedImages = Array.isArray(row.images)
    ? row.images
      .filter((source: unknown): source is string => typeof source === "string" && Boolean(source.trim()))
      .map((source: string) => source.trim())
    : []
  const requestedMainIndex = Number(row.main_image_index || 0)
  const mainIndex = Number.isInteger(requestedMainIndex)
    && requestedMainIndex >= 0
    && requestedMainIndex < uploadedImages.length
    ? requestedMainIndex
    : 0
  const images = uploadedImages.length
    ? [uploadedImages[mainIndex], ...uploadedImages.filter((_: string, index: number) => index !== mainIndex)]
    : []

  return {
    id: String(row.id),
    name: row.name,
    category: row.category || "Furniture",
    subcategory: String(row.subcategory || "").trim(),
    price: peso(Number(row.price || 0)),
    image: images[0] || "",
    images,
    alt: row.description || row.name,
    description: String(row.description || "").trim(),
    label: row.stock_quantity <= 5 ? "Low stock" : undefined,
    rating: Number(row.rating || 0),
    reviews: Number(row.review_count || 0),
    stock: Number(row.stock_quantity || 0),
    room: roomFor(row.category || ""),
    materials: parseMaterials(row.material),
    dimensions: parseDimensions(row.dimensions),
  }
}

export async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    // Keep the mobile catalog payload deliberate. Color and administrative
    // timestamps are not rendered by the app and do not need to cross the
    // network on every catalog refresh.
    .select("id,name,category,subcategory,price,stock_quantity,status,material,dimensions,description,images,main_image_index,rating,review_count")
    .eq("status", "active")
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map(mapProduct)
}

export async function loadProfile(user: User) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,full_name,email,phone,phone_verified_at,avatar_url,gender,date_of_birth")
    .eq("id", user.id)
    .single()
  if (error) throw error
  let avatar = data.avatar_url || user.user_metadata.avatar_url || ""
  if (avatar && !/^https?:|^data:/i.test(avatar)) {
    const signed = await supabase.storage.from("avatars").createSignedUrl(avatar, 3600)
    avatar = signed.data?.signedUrl || ""
  }
  return {
    name: data.username || data.full_name || user.user_metadata.full_name || "Member",
    username: data.username || "",
    firstName: String(data.full_name || user.user_metadata.full_name || "").trim().split(/\s+/)[0] || "",
    lastName: String(data.full_name || user.user_metadata.full_name || "").trim().split(/\s+/).slice(1).join(" "),
    email: data.email || user.email || "",
    phone: data.phone || "",
    phoneVerifiedAt: data.phone_verified_at || null,
    image: avatar,
    gender: data.gender || "",
    birth: data.date_of_birth || "",
  }
}

export type MobileCustomerProfile = {
  name: string
  username: string
  firstName: string
  lastName: string
  email: string
  phone: string
  phoneVerifiedAt?: string | null
  image: string
  gender: string
  birth: string
}

export async function saveProfile(userId: string, profile: MobileCustomerProfile) {
  let avatarPath: string | null | undefined = undefined
  if (profile.image.startsWith("data:image/")) {
    const blob = await (await fetch(profile.image)).blob()
    if (blob.size > 5 * 1024 * 1024) throw new Error("Choose a profile photo smaller than 5 MB.")
    const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"
    const path = `${userId}/mobile-${Date.now()}-${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { contentType: blob.type, upsert: false })
    if (uploadError) throw uploadError
    avatarPath = path
  }
  // The OTP endpoint owns phone and phone_verified_at. Including either in a
  // normal profile update would bypass the verification flow (and is rejected
  // by the database), even when another field is all the customer changed.
  const { error } = await supabase.from("profiles").update({
    username: profile.username.trim(),
    full_name: `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim(),
    gender: profile.gender || "",
    date_of_birth: profile.birth || null,
    ...(avatarPath !== undefined ? { avatar_url: avatarPath } : {}),
  }).eq("id", userId).select("id").single()
  if (error) throw error
}

export type MobileCommunicationPreferences = {
  delivery_updates: boolean
  home_circle_notes: boolean
}

export async function loadCommunicationPreferences(userId: string): Promise<MobileCommunicationPreferences> {
  const { data, error } = await supabase
    .from("customer_preferences")
    .select("delivery_updates,home_circle_notes")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return {
    delivery_updates: data?.delivery_updates !== false,
    // Promotional notes are opt-in. A missing preference row must never be
    // interpreted as marketing consent.
    home_circle_notes: data?.home_circle_notes === true,
  }
}

export async function saveCommunicationPreferences(userId: string, preferences: MobileCommunicationPreferences) {
  const { error } = await supabase.from("customer_preferences").upsert({
    user_id: userId,
    ...preferences,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" })
  if (error) throw error
}

export async function loadWishlist(userId: string) {
  const { data, error } = await supabase.from("wishlist_items").select("product_id").eq("user_id", userId)
  if (error) throw error
  return (data || []).map((row) => String(row.product_id))
}

export async function toggleWishlist(userId: string, productId: string, active: boolean) {
  const query = active
    ? supabase.from("wishlist_items").delete().eq("user_id", userId).eq("product_id", productId)
    : supabase.from("wishlist_items").upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id" })
  const { error } = await query
  if (error) throw error
}

export async function moveWishlistItemToCart(productId: string) {
  const { data, error } = await supabase.rpc("move_wishlist_item_to_cart", {
    p_product_id: productId,
  })
  if (error) throw error
  const result = data as { product_id?: string; quantity?: number } | null
  return {
    productId: String(result?.product_id || productId),
    quantity: Math.max(1, Number(result?.quantity || 1)),
  }
}

export async function loadCart(userId: string, catalog: MobileProduct[]) {
  const { data, error } = await supabase.from("cart_items").select("product_id,quantity,selected_for_checkout").eq("user_id", userId)
  if (error) throw error
  return (data || []).flatMap((row) => {
    const product = catalog.find((item) => item.id === String(row.product_id))
    return product ? [{ product, quantity: row.quantity, selected: row.selected_for_checkout !== false }] : []
  })
}

export async function upsertCart(userId: string, productId: string, quantity: number, selected = true) {
  const { error } = await supabase.from("cart_items").upsert({
    user_id: userId,
    product_id: productId,
    quantity,
    selected_for_checkout: selected,
  }, { onConflict: "user_id,product_id" })
  if (error) throw error
}

export async function removeCart(userId: string, productId: string) {
  const { error } = await supabase.from("cart_items").delete().eq("user_id", userId).eq("product_id", productId)
  if (error) throw error
}

export async function loadDefaultAddress(userId: string) {
  const { data, error } = await supabase.from("addresses").select("*").eq("user_id", userId).order("is_primary", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function placeOrder(input: {
  userId: string
  payment: string
  items: Array<{ product: MobileProduct; quantity: number }>
  redemptionId?: string
  addressId?: string
}) {
  const address = input.addressId
    ? (await supabase.from("addresses").select("*").eq("id", input.addressId).eq("user_id", input.userId).single()).data
    : await loadDefaultAddress(input.userId)
  if (!address) throw new Error("Add a delivery address to your CozyCraft profile before checking out.")
  const paymentMethod = input.payment === "GCash" ? "gcash" : input.payment.includes("card") ? "card" : "cod"
  const checkoutKey = crypto.randomUUID()
  const items = input.items.map(({ product, quantity }) => ({ product_id: product.id, quantity }))
  if (paymentMethod === "cod") {
    const { data, error } = await supabase.rpc("place_order", {
      p_address_id: address.id,
      p_payment_method: paymentMethod,
      p_items: items,
      p_checkout_key: checkoutKey,
    })
    if (error) throw error
    const orderId = typeof data === "string" ? data : data?.id
    if (orderId && input.redemptionId) {
      const { error: rewardError } = await supabase.rpc("apply_mobile_reward_to_order", {
        p_order_id: orderId,
        p_redemption_id: input.redemptionId,
      })
      if (rewardError) throw rewardError
    }
    if (orderId) await markMobileOrder(orderId)
    return { order: { id: orderId }, checkoutUrl: null }
  }
  const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
  // The packaged app renders the storefront inside the Capacitor shell's iframe.
  // Capacitor is therefore available on the parent window, not necessarily on
  // this storefront window. Treat an embedded storefront as a native checkout
  // so PayMongo returns through the app deep link instead of the public website.
  const embeddedInNativeShell = window.parent !== window
  const nativePlatform = Boolean(capacitor?.isNativePlatform?.()) || window.location.protocol === "capacitor:" || embeddedInNativeShell
  const { data, error } = await supabase.functions.invoke("create-paymongo-checkout", {
    body: {
      addressId: address.id,
      paymentMethod,
      checkoutKey,
      mobileReturn: nativePlatform,
      mobilePlatform: capacitor?.getPlatform?.() || (nativePlatform ? "native" : "web"),
      returnOrigin: window.location.origin,
      items,
      redemptionId: input.redemptionId || null,
    },
  })
  if (error || data?.error) throw new Error(data?.error || error?.message || "Unable to open secure checkout.")
  const checkoutUrl = data?.checkoutUrl
    || data?.checkout_url
    || data?.data?.attributes?.checkout_url
    || data?.data?.checkout_url
  if (typeof checkoutUrl !== "string" || !/^https:\/\//i.test(checkoutUrl)) {
    throw new Error("PayMongo did not return a secure payment page. Please try again.")
  }
  if (data?.orderId || data?.order?.id) await markMobileOrder(data?.orderId || data.order.id)
  return {
    order: data?.order || { id: data?.orderId, order_number: data?.orderNumber },
    checkoutUrl,
  }
}

export async function loadOrders(userId: string, catalog: MobileProduct[]) {
  const [{ data, error }, { data: customerReviews, error: reviewsError }] = await Promise.all([
    supabase.from("orders").select("*,order_items(*),order_status_history(status,changed_at)").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("reviews").select("id,order_item_id,product_id,rating,body,image_urls,approved,created_at").eq("user_id", userId),
  ])
  if (error) throw error
  if (reviewsError) throw reviewsError
  const reviewsByOrderItem = new Map((customerReviews || []).map((review) => [String(review.order_item_id), review]))
  const normalizedStatus = (value: string) => {
    if (value === "cancelled" || value === "canceled" || value === "refunded") return "Cancelled"
    if (value === "packed") return "Packed"
    if (value === "shipped") return "Shipped"
    if (value === "delivered") return "Delivered"
    return "Processing"
  }
  const orderIds = (data || []).map((order) => order.id)
  const { data: rewards } = orderIds.length ? await supabase
    .from("mobile_loyalty_transactions")
    .select("order_id,points,kind")
    .eq("user_id", userId)
    .in("order_id", orderIds) : { data: [] }
  return (data || []).map((order) => ({
    id: order.order_number || order.id,
    databaseId: order.id,
    createdAt: order.created_at,
    total: Number(order.total || 0),
    status: normalizedStatus(order.status),
    payment: order.payment_method || "cod",
    paymentStatus: order.payment_status || (order.payment_method === "cod" ? "pay_on_delivery" : "pending"),
    refundStatus: order.refund_status || null,
    refundedAt: order.refunded_at || null,
    cancellationReason: order.cancellation_reason || null,
    cancellationStatus: order.cancellation_status || null,
    cancellationRequestedAt: order.cancellation_requested_at || null,
    cancellationReviewedAt: order.cancellation_reviewed_at || null,
    cancellationDecisionNote: order.cancellation_decision_note || null,
    subtotal: Number(order.subtotal || order.total || 0),
    deliveryFee: Number(order.delivery_fee ?? order.shipping_address?.delivery_fee ?? Math.max(
      0,
      Number(order.total || 0) - Number(order.subtotal || order.total || 0) + Number(order.reward_discount || 0),
    )),
    deliveryAreaName: String(order.shipping_address?.delivery_area_name || ""),
    rewardDiscount: Number(order.reward_discount || 0),
    pointsEarned: (rewards || []).filter((row) => row.order_id === order.id && Number(row.points) > 0).reduce((sum, row) => sum + Number(row.points), 0),
    address: [order.shipping_address?.line, order.shipping_address?.barangay, order.shipping_address?.city, order.shipping_address?.province, order.shipping_address?.postal].filter(Boolean).join(", "),
    items: (order.order_items || []).flatMap((line: Record<string, any>) => {
      const product = catalog.find((item) => item.id === String(line.product_id)) || {
        id: String(line.product_id),
        name: line.product_name || "CozyCraft product",
        category: "Furniture",
        price: peso(Number(line.unit_price || 0)),
        image: line.product_image || "",
        alt: line.product_name || "CozyCraft product",
      }
      const review = reviewsByOrderItem.get(String(line.id))
      return [{
        product,
        quantity: Number(line.quantity || 1),
        selected: true,
        orderItemId: Number(line.id),
        reviewId: review?.id || undefined,
        reviewRating: review?.rating ? Number(review.rating) : undefined,
        reviewBody: review?.body || undefined,
        reviewImages: Array.isArray(review?.image_urls) ? review.image_urls : [],
      }]
    }),
    timeline: (order.order_status_history || []).map((entry: Record<string, any>) => ({
      status: normalizedStatus(entry.status),
      changedAt: entry.changed_at,
    })).sort((a: Record<string, any>, b: Record<string, any>) => String(a.changedAt).localeCompare(String(b.changedAt))),
  }))
}

export type MobileAddress = {
  id?: string
  label: string
  recipient_name: string
  mobile: string
  email: string
  address_line: string
  barangay: string
  city: string
  province: string
  postal_code: string
  delivery_note: string
  is_primary: boolean
}

export type PhilippineRegion = {
  regCode: string
  regionName: string
}

export type PhilippineProvince = {
  regCode: string
  provCode: string
  provName: string
  cityClass: string | null
}

export type PhilippineMunicipality = {
  regCode: string
  provCode: string
  munCityCode: string
  munCityName: string
}

export type PhilippineBarangay = {
  munCityCode: string
  brgyCode: string
  brgyName: string
}

export async function loadPhilippineLocations() {
  const { data, error } = await supabase.functions.invoke("philippine-barangays", {
    body: { scope: "locations" },
  })
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Unable to load Philippine locations.")
  }
  return {
    regions: (data?.regions || []) as PhilippineRegion[],
    provinces: (data?.provinces || []) as PhilippineProvince[],
    municipalities: (data?.municipalities || []) as PhilippineMunicipality[],
  }
}

export async function loadPhilippineBarangays(municipalityCode: string) {
  const { data, error } = await supabase.functions.invoke("philippine-barangays", {
    body: { municipalityCode },
  })
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Unable to load barangays.")
  }
  return (data?.barangays || []) as PhilippineBarangay[]
}

export async function loadAddresses(userId: string): Promise<MobileAddress[]> {
  const { data, error } = await supabase.from("addresses").select("*").eq("user_id", userId).order("is_primary", { ascending: false }).order("created_at", { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveAddress(userId: string, address: MobileAddress) {
  if (address.is_primary) {
    const { error } = await supabase.from("addresses").update({ is_primary: false }).eq("user_id", userId)
    if (error) throw error
  }
  const payload = { ...address, user_id: userId, updated_at: new Date().toISOString() }
  const query = address.id
    ? supabase.from("addresses").update(payload).eq("id", address.id).eq("user_id", userId)
    : supabase.from("addresses").insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function deleteAddress(userId: string, id: string) {
  const { error } = await supabase.from("addresses").delete().eq("id", id).eq("user_id", userId)
  if (error) throw error
}

export async function setPrimaryAddress(userId: string, id: string) {
  const { error: clearError } = await supabase.from("addresses").update({ is_primary: false }).eq("user_id", userId)
  if (clearError) throw clearError
  const { error } = await supabase.from("addresses").update({ is_primary: true, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId)
  if (error) throw error
}

export async function loadPaymentPreference(userId: string) {
  const { data, error } = await supabase.from("profiles").select("preferred_payment_method").eq("id", userId).single()
  if (error) throw error
  return data.preferred_payment_method || "cod"
}

export async function savePaymentPreference(userId: string, method: string) {
  const { error } = await supabase.from("profiles").update({ preferred_payment_method: method }).eq("id", userId)
  if (error) throw error
}

export async function loadSupportTickets(userId: string) {
  const { data, error } = await supabase.from("support_tickets").select("*").eq("user_id", userId).order("created_at", { ascending: false })
  if (error) throw error
  return data || []
}

export async function loadNotifications(userId: string) {
  const { data, error } = await supabase
    .from("customer_notifications")
    .select("id,kind,title,message,entity_type,entity_id,read_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export type MobileContentPage = {
  slug: string
  eyebrow: string
  title: string
  summary: string
  body: string
  updated_at: string
}

export type MobileHomepageBanner = {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  image_url: string
  cta_label: string
  cta_path: string
  sort_order: number
  updated_at: string
}

export type MobileSearchSynonym = {
  term: string
  synonyms: string[]
}

export type MobileReturnRequest = {
  id: string
  order_id: string
  return_number: string
  reason: string
  details: string
  status: string
  admin_note: string | null
  evidence_paths: string[]
  created_at: string
  updated_at?: string
}

const CONTENT_CACHE_MS = 30 * 60 * 1000
const contentCache = new Map<string, { at: number; page: MobileContentPage }>()
let bannerCache: { at: number; rows: MobileHomepageBanner[] } | null = null
let synonymCache: { at: number; rows: MobileSearchSynonym[] } | null = null

export async function loadMobileContentPage(slug: string, fresh = false) {
  const normalizedSlug = slug.trim().toLocaleLowerCase("en-PH")
  const cached = contentCache.get(normalizedSlug)
  if (!fresh && cached && Date.now() - cached.at < CONTENT_CACHE_MS) return cached.page
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug,eyebrow,title,summary,body,updated_at")
    .eq("slug", normalizedSlug)
    .eq("published", true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const page = data as MobileContentPage
  contentCache.set(normalizedSlug, { at: Date.now(), page })
  return page
}

export async function loadMobileHomepageBanners(fresh = false) {
  if (!fresh && bannerCache && Date.now() - bannerCache.at < CONTENT_CACHE_MS) return bannerCache.rows
  const { data, error } = await supabase
    .from("homepage_banners")
    .select("id,eyebrow,title,subtitle,image_url,cta_label,cta_path,sort_order,updated_at")
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .order("sort_order")
    .limit(6)
  if (error) throw error
  const rows = (data || []) as MobileHomepageBanner[]
  bannerCache = { at: Date.now(), rows }
  return rows
}

export async function loadMobileSearchSynonyms(fresh = false) {
  if (!fresh && synonymCache && Date.now() - synonymCache.at < CONTENT_CACHE_MS) return synonymCache.rows
  const { data, error } = await supabase
    .from("search_synonyms")
    .select("term,synonyms")
    .eq("active", true)
    .order("term")
    .limit(100)
  if (error) throw error
  const rows = (data || []) as MobileSearchSynonym[]
  synonymCache = { at: Date.now(), rows }
  return rows
}

export function expandMobileCatalogQuery(query: string, synonyms: MobileSearchSynonym[]) {
  const normalized = query.trim().toLocaleLowerCase("en-PH")
  if (!normalized) return []
  const alternatives = new Set([normalized])
  synonyms.forEach((entry) => {
    const values = [entry.term, ...(entry.synonyms || [])]
      .map((value) => String(value).trim().toLocaleLowerCase("en-PH"))
      .filter(Boolean)
    if (values.some((value) => value.includes(normalized) || normalized.includes(value))) {
      values.forEach((value) => alternatives.add(value))
    }
  })
  return [...alternatives]
}

export async function recordMobileCatalogSearch(query: string, resultCount: number, collection = "mobile") {
  const normalized = query.trim()
  if (normalized.length < 2) return
  const { error } = await supabase.rpc("record_catalog_search", {
    p_query: normalized,
    p_result_count: Math.max(0, Math.round(resultCount)),
    p_collection: collection,
  })
  if (error) throw error
}

export async function recordMobileProductView(userId: string, productId: string) {
  const { error } = await supabase.from("product_views").upsert({
    user_id: userId,
    product_id: productId,
    viewed_at: new Date().toISOString(),
  }, { onConflict: "user_id,product_id" })
  if (error) throw error
}

export async function loadMobileProductViews(userId: string) {
  const { data, error } = await supabase
    .from("product_views")
    .select("product_id")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(8)
  if (error) throw error
  return (data || []).map((row) => String(row.product_id))
}

export async function acceptCurrentMobilePolicies(source = "mobile_app") {
  const version = "2026-08-16"
  const { error } = await supabase.rpc("accept_current_customer_policies", {
    p_terms_version: version,
    p_privacy_version: version,
    p_source: source,
    p_context: {
      user_agent: window.navigator.userAgent.slice(0, 500),
      locale: window.navigator.language,
      platform: "capacitor",
    },
  })
  if (error) throw error
}

export async function loadMobileReturnRequests(userId: string): Promise<MobileReturnRequest[]> {
  const { data, error } = await supabase
    .from("return_requests")
    .select("id,order_id,return_number,reason,details,status,admin_note,evidence_paths,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30)
  if (error) throw error
  return (data || []) as MobileReturnRequest[]
}

export type MobileFaqItem = {
  question: string
  answer: string
  category: "shopping" | "payments" | "delivery" | "orders" | "reviews" | "account"
}

export type MobileFaqPage = {
  title: string
  summary: string
  items: MobileFaqItem[]
  updatedAt: string
  source: "live" | "cache" | "offline"
}

const MOBILE_FAQ_CACHE_KEY = "cozycraft-mobile-faq-v1"
const MOBILE_FAQ_CACHE_MS = 24 * 60 * 60 * 1000

const FAQ_FALLBACK: MobileFaqItem[] = [
  { question: "How do I know if a product is available?", answer: "Product pages show the latest CozyCraft stock. An unavailable piece stays viewable, but the app will not let you add more than the available quantity.", category: "shopping" },
  { question: "What payment methods are available?", answer: "Eligible orders can use cash on delivery, card, or GCash. Card and GCash use PayMongo hosted checkout, so CozyCraft never stores your card or wallet credentials.", category: "payments" },
  { question: "How much is delivery?", answer: "Your delivery fee and any free-delivery threshold are calculated from the selected address and subtotal. The app shows the exact amount in your bag, at checkout, and in the completed order.", category: "delivery" },
  { question: "How long does delivery take?", answer: "The current estimate appears before checkout. After ordering, open Account and My orders to follow each status and timestamp.", category: "delivery" },
  { question: "Can I cancel or return an order?", answer: "You can request cancellation while an order is still eligible and has not shipped. Eligible delivered pieces can use the return and customer-care workflow.", category: "orders" },
  { question: "How do reviews work?", answer: "Delivered purchases can be reviewed from My orders. Reviews are linked to the purchased item and may be moderated before public display.", category: "reviews" },
  { question: "How do I get help?", answer: "Send a private request from Care & support. Your conversation and every reply stay connected to your CozyCraft account and update in realtime.", category: "account" },
]

const faqCategory = (question: string): MobileFaqItem["category"] => {
  const value = question.toLowerCase()
  if (/pay|card|gcash/.test(value)) return "payments"
  if (/deliver|shipping|fee|how long/.test(value)) return "delivery"
  if (/cancel|return|order/.test(value)) return "orders"
  if (/review/.test(value)) return "reviews"
  if (/account|help|support|password|sign/.test(value)) return "account"
  return "shopping"
}

const parseFaqBody = (body: string): MobileFaqItem[] => {
  const sections = String(body || "")
    .split(/\n\s*\n/g)
    .map((section) => section.trim())
    .filter(Boolean)
  const items: MobileFaqItem[] = []
  for (let index = 0; index < sections.length; index += 2) {
    const rawQuestion = sections[index]
    const answer = sections[index + 1]
    if (!rawQuestion || !answer) continue
    const question = rawQuestion
      .toLocaleLowerCase("en-PH")
      .replace(/(^|[.!?]\s+)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
    items.push({ question, answer, category: faqCategory(question) })
  }
  return items.length ? items : FAQ_FALLBACK
}

const readFaqCache = (): (MobileFaqPage & { cachedAt: number }) | null => {
  try {
    const cached = JSON.parse(window.localStorage.getItem(MOBILE_FAQ_CACHE_KEY) || "null")
    return cached && Array.isArray(cached.items) ? cached : null
  } catch {
    return null
  }
}

/**
 * FAQ content is fetched only when Care & support is opened and then reused
 * for 24 hours. This keeps the help center current without adding a catalog-
 * page query or a permanent Realtime subscription to every app session.
 */
export async function loadMobileFaq(): Promise<MobileFaqPage> {
  const cached = readFaqCache()
  if (cached && Date.now() - Number(cached.cachedAt || 0) < MOBILE_FAQ_CACHE_MS) {
    return { ...cached, source: "cache" }
  }

  try {
    const { data, error } = await supabase
      .from("content_pages")
      .select("title,summary,body,updated_at")
      .eq("slug", "faq")
      .eq("published", true)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error("FAQ content is not published")
    const page: MobileFaqPage & { cachedAt: number } = {
      title: String(data.title || "Frequently asked questions."),
      summary: String(data.summary || "Quick answers from CozyCraft Care."),
      items: parseFaqBody(String(data.body || "")),
      updatedAt: String(data.updated_at || ""),
      source: "live",
      cachedAt: Date.now(),
    }
    try { window.localStorage.setItem(MOBILE_FAQ_CACHE_KEY, JSON.stringify(page)) } catch { /* private browsing can deny storage */ }
    return page
  } catch {
    if (cached) return { ...cached, source: "cache" }
    return {
      title: "Frequently asked questions.",
      summary: "Quick answers for shopping, payment, delivery, orders, reviews, and account care.",
      items: FAQ_FALLBACK,
      updatedAt: "",
      source: "offline",
    }
  }
}

export type MobileStoreSettings = {
  announcement_enabled: boolean
  announcement_text: string
  announcement_link: string
  delivery_area: string
  checkout_settings: Record<string, any>
  fulfillment_settings: Record<string, any>
}

export async function loadMobileDeliveryServiceAreas(): Promise<MobileDeliveryServiceArea[]> {
  const { data, error } = await supabase
    .from("delivery_service_areas")
    .select("id,area_code,name,description,delivery_fee,free_delivery_minimum,lead_time_min_days,lead_time_max_days,assembly_available,active,sort_order")
    .eq("active", true)
    .order("sort_order")
    .limit(20)
  if (error) throw error
  return (data || []).map((row) => ({
    ...row,
    delivery_fee: Number(row.delivery_fee),
    free_delivery_minimum: row.free_delivery_minimum === null
      ? null
      : Number(row.free_delivery_minimum),
  })) as MobileDeliveryServiceArea[]
}

export async function loadMobileStoreSettings(): Promise<MobileStoreSettings> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("announcement_enabled,announcement_text,announcement_link,delivery_area,checkout_settings,fulfillment_settings")
    .eq("id", true)
    .single()
  if (error) throw error
  return {
    announcement_enabled: Boolean(data.announcement_enabled),
    announcement_text: String(data.announcement_text || ""),
    announcement_link: String(data.announcement_link || ""),
    delivery_area: String(data.delivery_area || "Metro Manila"),
    checkout_settings: data.checkout_settings || {},
    fulfillment_settings: data.fulfillment_settings || {},
  }
}

export async function markNotification(userId: string, id?: string) {
  let query = supabase.from("customer_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId)
  if (id) query = query.eq("id", id)
  const { error } = await query
  if (error) throw error
}

export async function registerPushToken(token: string, platform: string) {
  const { error } = await supabase.rpc("register_mobile_push_token", {
    p_token: token,
    p_platform: platform,
  })
  if (error) throw error
}

export async function unregisterPushToken(token: string) {
  const { error } = await supabase.rpc("unregister_mobile_push_token", {
    p_token: token,
  })
  if (error) throw error
}

export async function loadReviews(productId: string) {
  // RLS returns approved reviews to everyone and also lets a signed-in author
  // see their own pending review. The public-safe name is denormalized by a
  // database trigger, so no private profile row needs to be exposed here.
  const { data, error } = await supabase.from("reviews").select("id,rating,body,image_urls,created_at,approved,reviewer_display_name").eq("product_id", productId).order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map((review) => ({
    ...review,
    // The endpoint only serves photos belonging to approved reviews. It keeps
    // the private avatars bucket private and returns 404 when no photo exists.
    reviewer_avatar_url: `${supabaseUrl}/functions/v1/review-avatar?review_id=${encodeURIComponent(review.id)}`,
  }))
}

type ReviewImageFormat = { contentType: string; extension: string }

function readReviewImageBytes(image: Blob) {
  // FileReader starts reading during the file-input change event. This is more
  // reliable than deferring Blob.arrayBuffer() for Android content:// handles,
  // whose temporary gallery permission may disappear after the event returns.
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error("The selected photo did not contain readable image data."))
    reader.onerror = () => reject(reader.error || new Error("The selected photo could not be read."))
    reader.onabort = () => reject(new Error("Reading the selected photo was cancelled."))
    reader.readAsArrayBuffer(image)
  })
}

function detectReviewImageFormat(bytes: ArrayBuffer, declaredType = "", fileName = ""): ReviewImageFormat | null {
  const data = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 32))
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { contentType: "image/jpeg", extension: "jpg" }
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return { contentType: "image/png", extension: "png" }
  if (String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" }
  }
  const boxType = String.fromCharCode(...data.slice(4, 8))
  const brand = String.fromCharCode(...data.slice(8, 12)).toLowerCase()
  if (boxType === "ftyp" && (brand.includes("heic") || brand.includes("heix") || brand.includes("hevc") || brand.includes("hevx") || brand.includes("mif1") || brand.includes("msf1"))) {
    return { contentType: brand.includes("he") ? "image/heic" : "image/heif", extension: brand.includes("he") ? "heic" : "heif" }
  }
  const extension = fileName.split(".").pop()?.toLowerCase() || ""
  const byType: Record<string, ReviewImageFormat> = {
    "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
    "image/png": { contentType: "image/png", extension: "png" },
    "image/webp": { contentType: "image/webp", extension: "webp" },
    "image/heic": { contentType: "image/heic", extension: "heic" },
    "image/heif": { contentType: "image/heif", extension: "heif" },
  }
  const byExtension: Record<string, ReviewImageFormat> = {
    jpg: byType["image/jpeg"], jpeg: byType["image/jpeg"], png: byType["image/png"],
    webp: byType["image/webp"], heic: byType["image/heic"], heif: byType["image/heif"],
  }
  return byType[declaredType.toLowerCase()] || byExtension[extension] || null
}

async function prepareReviewImage(image: File) {
  // Always copy first. Decoding a picker-backed File directly can consume or
  // invalidate Android's one-shot content stream before a fallback can read it.
  const originalBytes = await readReviewImageBytes(image)
  const format = detectReviewImageFormat(originalBytes, image.type, image.name)
  if (!format) throw new Error("Choose a JPG, PNG, WebP, HEIC, or HEIF photo.")
  const originalBlob = new Blob([originalBytes], { type: format.contentType })

  // HEIC/HEIF decoding is not consistently available in Android WebView.
  // Those formats still use the stable ArrayBuffer upload path unchanged.
  if (format.contentType === "image/heic" || format.contentType === "image/heif" || typeof createImageBitmap !== "function") {
    return { bytes: originalBytes, ...format }
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(originalBlob, { imageOrientation: "from-image" })
    const maximumSide = 1600
    const scale = Math.min(1, maximumSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { alpha: false })
    if (!context) throw new Error("Image preparation is unavailable.")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const optimized = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image preparation failed.")), "image/jpeg", 0.84)
    })
    return { bytes: await optimized.arrayBuffer(), contentType: "image/jpeg", extension: "jpg" }
  } catch {
    // The bytes have already been validated and detached from the picker, so a
    // WebView decode failure must not prevent the original image from uploading.
    return { bytes: originalBytes, ...format }
  } finally {
    bitmap?.close()
  }
}

export async function stageReviewImage(image: File) {
  // Copy only; optimization happens at publish time from this durable File.
  // Keeping selection lightweight also lets two FileReaders start while the
  // Android picker grant is still active.
  const bytes = await readReviewImageBytes(image)
  const format = detectReviewImageFormat(bytes, image.type, image.name)
  if (!format) throw new Error("Choose a JPG, PNG, WebP, HEIC, or HEIF photo.")
  const baseName = image.name.replace(/\.[^.]+$/, "") || "review-photo"
  return new File([bytes], `${baseName}.${format.extension}`, {
    type: format.contentType,
    lastModified: image.lastModified,
  })
}

export async function submitReview(
  userId: string,
  orderItemId: number,
  rating: number,
  body: string,
  images: File[] = [],
  reportProgress?: (message: string) => void,
) {
  if (images.length > 2) throw new Error("You can attach up to 2 review photos.")
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session || sessionData.session.user.id !== userId) {
    throw new Error("Your sign-in session expired. Please sign in again before publishing your review.")
  }
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
  const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"])
  const imageUrls: string[] = []
  for (const [index, image] of images.entries()) {
    const extension = image.name.split(".").pop()?.toLowerCase() || "jpg"
    if (image.size > 5 * 1024 * 1024 || (!allowedTypes.has(image.type) && !(image.type === "" && allowedExtensions.has(extension)))) {
      throw new Error("Review photos must be JPG, PNG, WebP, HEIC, or HEIF files up to 5 MB each.")
    }
    reportProgress?.(`Preparing photo ${index + 1} of ${images.length}…`)
    let prepared: Awaited<ReturnType<typeof prepareReviewImage>>
    try {
      // Resize ordinary camera photos before reading their upload buffer. This
      // keeps a two-photo batch below Android WebView's practical memory
      // pressure threshold while preserving ample review-image resolution.
      prepared = await prepareReviewImage(image)
    } catch {
      throw new Error(`We couldn't read ${image.name}. Remove it and choose the photo again.`)
    }
    const path = `${userId}/${orderItemId}/${crypto.randomUUID()}-${index}.${prepared.extension}`
    reportProgress?.(`Uploading photo ${index + 1} of ${images.length}…`)
    const { error: uploadError } = await supabase.storage.from("review-images").upload(path, prepared.bytes, {
      cacheControl: "3600",
      contentType: prepared.contentType,
      upsert: false,
    })
    if (uploadError) {
      const detail = uploadError.message?.trim()
      throw new Error(`Photo ${index + 1} couldn't be uploaded${detail ? `: ${detail}` : ". Please try that photo again."}`)
    }
    const { data: publicUrl } = supabase.storage.from("review-images").getPublicUrl(path)
    imageUrls.push(publicUrl.publicUrl)
    // Yield between files so the WebView can release the completed request and
    // decoded image before allocating the next photo in a two-image batch.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 40))
  }
  reportProgress?.("Saving your verified review…")
  const { data, error } = await supabase.rpc("submit_order_item_review", {
    p_order_item_id: orderItemId,
    p_rating: rating,
    p_title: "",
    p_body: body,
    p_image_urls: imageUrls,
  })
  if (error) throw new Error(error.message || "The review could not be saved.")
  return Array.isArray(data) ? data[0] : data
}

export async function submitMobileReturnRequest(input: {
  userId: string
  orderId: string
  reason: string
  details: string
  evidence?: File[]
  reportProgress?: (message: string) => void
}) {
  const reason = input.reason.trim()
  const details = input.details.trim()
  if (!reason) throw new Error("Choose a reason for the return.")
  if (details.length < 10) throw new Error("Please describe the return in at least 10 characters.")
  const files = (input.evidence || []).slice(0, 2)
  if ((input.evidence || []).length > 2) throw new Error("You can attach up to 2 return photos.")
  const evidencePaths: string[] = []
  try {
    for (const [index, file] of files.entries()) {
      if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Return photos must be JPG, PNG, or WebP files up to 5 MB each.")
      }
      input.reportProgress?.(`Preparing photo ${index + 1} of ${files.length}…`)
      const prepared = await prepareReviewImage(file)
      if (!["image/jpeg", "image/png", "image/webp"].includes(prepared.contentType)) {
        throw new Error("Return photos must be JPG, PNG, or WebP files up to 5 MB each.")
      }
      const path = `${input.userId}/${crypto.randomUUID()}-${index}.${prepared.extension}`
      input.reportProgress?.(`Uploading photo ${index + 1} of ${files.length}…`)
      const { error: uploadError } = await supabase.storage.from("return-evidence").upload(path, prepared.bytes, {
        cacheControl: "3600",
        contentType: prepared.contentType,
        upsert: false,
      })
      if (uploadError) throw new Error(`Photo ${index + 1} could not be uploaded: ${uploadError.message}`)
      evidencePaths.push(path)
    }
    input.reportProgress?.("Submitting your return request…")
    const { data, error } = await supabase.from("return_requests").insert({
      user_id: input.userId,
      order_id: input.orderId,
      reason,
      details,
      evidence_paths: evidencePaths,
    }).select("id,order_id,return_number,reason,details,status,admin_note,evidence_paths,created_at,updated_at").single()
    if (error) throw error
    return data as MobileReturnRequest
  } catch (error) {
    if (evidencePaths.length) {
      void supabase.storage.from("return-evidence").remove(evidencePaths).catch(() => undefined)
    }
    throw error
  }
}

const reportedClientErrors = new Map<string, number>()

export async function reportMobileClientError(error: unknown, context: string) {
  const normalized = error instanceof Error ? error : new Error(String(error || "Unknown mobile error"))
  const key = `${context}:${normalized.message}`.slice(0, 500)
  const lastReported = reportedClientErrors.get(key) || 0
  // Deduplicate repeating WebView/network errors so monitoring is useful and
  // cannot become an egress loop during an outage.
  if (Date.now() - lastReported < 5 * 60 * 1000 || !navigator.onLine) return
  reportedClientErrors.set(key, Date.now())
  try {
    const { error: reportError } = await supabase.rpc("report_client_error", {
      p_message: normalized.message.slice(0, 1000),
      p_stack: String(normalized.stack || "").slice(0, 4000),
      p_path: `${window.location.hash || window.location.pathname}`.slice(0, 1000),
      p_context: `mobile_${context}`.slice(0, 120),
      p_user_agent: window.navigator.userAgent.slice(0, 500),
    })
    if (reportError) console.warn("Unable to report mobile client error", reportError.message)
  } catch (reportError) {
    // Monitoring must never create its own unhandled-rejection loop while the
    // customer is offline or the error endpoint is temporarily unavailable.
    console.warn("Unable to report mobile client error", reportError)
  }
}

export async function createSupportTicket(userId: string, message: string, subject = "Mobile app support request", category = "general") {
  const { data, error } = await supabase.from("support_tickets").insert({
    user_id: userId,
    subject,
    message,
    category,
  }).select("ticket_number").single()
  if (error) throw error
  return data
}
