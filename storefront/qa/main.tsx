import React, { useState } from "react"
import RequestOrderInvoice from "../src/components/RequestOrderInvoice"
import { invoiceEmail } from "../../supabase/functions/_shared/order-invoice"
import { invoiceLogoAttachment } from "../../supabase/functions/_shared/invoice-logo"
import ScrollBackButton from "../src/components/ScrollBackButton"
import SearchDiscoveries from "../src/components/SearchDiscoveries"
import { createRoot } from "react-dom/client"
import { Account, CheckoutPage, ProductDetail, ProfilePage, NotificationsPage, MobileCareChat, ShopPage } from "../src/Storefront"
import { readMobileTextSize, saveMobileTextSize } from "../src/lib/mobile-text-size"
import CustomerSecurityGate from "../src/features/auth/CustomerSecurityGate"
import PaymentEmailVerificationDialog from "../src/features/checkout/PaymentEmailVerificationDialog"
import GoogleCustomerOnboarding from "../src/features/auth/GoogleCustomerOnboarding"
import type { MobileCustomerProfile } from "../src/lib/mobile-data"
import type { PaymentEmailChallenge } from "../src/features/checkout/payment-email-verification"
import type { MobileGoogleOnboardingStatus } from "../src/features/auth/google-customer-onboarding"
import "../src/index.css"
import "../src/native-responsive.css"
import "../src/design-system.css"
import "../src/components/cozy-motion.css"
import CozyLaunchScreen from "../src/components/CozyLaunchScreen"
import DialogAccessibility from "../src/components/DialogAccessibility"
import HomeCirclePage from "../src/components/HomeCirclePage"
import { isMobileTextSize } from "../src/lib/mobile-text-size"

const params = new URLSearchParams(window.location.search)
const requestedTextSize = params.get("text")
if (isMobileTextSize(requestedTextSize)) saveMobileTextSize(requestedTextSize)
document.documentElement.classList.add(params.get("platform") === "android" ? "cozy-platform-android" : "cozy-platform-ios")
if (["standard", "comfortable", "large", "extra-large"].includes(params.get("text") || "")) {
  document.documentElement.dataset.cozyTextSize = params.get("text") || "comfortable"
}

function ProfileFixture() {
  const [profile, setProfile] = useState<MobileCustomerProfile>({
    name: "alex", username: "alex", firstName: "Alex", lastName: "Rivera", email: "alex@example.test",
    phone: "+639171234567", phoneVerifiedAt: null, image: "", gender: "", birth: "1995-01-02",
  })
  return <div className="lux-shell"><div className="lux-phone">
    <ProfilePage {...profile} phoneVerifiedAt={profile.phoneVerifiedAt ?? null} userId="8150a7d9-8f0c-49fd-8816-35b18a399a6a"
      points={120} tier="Member" completedOrders={2} savedCount={3} close={() => {}} openWishlist={() => {}}
      onPhoneVerified={(value) => setProfile((current) => ({ ...current, ...value }))}
      save={async (value) => { setProfile(value) }} />
  </div></div>
}

function PaymentFixture() {
  const [challenge, setChallenge] = useState<PaymentEmailChallenge>({
    id: "0f329e1a-e7fa-4fb1-aa4d-4f3f8d187309",
    maskedEmail: "al••••@e••••••.test",
    expiresAt: Date.now() + 300_000,
    resendAvailableAt: Date.now() - 1,
    intent: {
      addressId: "99bdb728-40a8-4575-ac91-31228449c349",
      checkoutKey: "30cfb521-9c92-4b8a-8dc7-b1cf8b663648",
      paymentMethod: "gcash",
      items: [{ product_id: "EKOLSUND", quantity: 1 }],
      redemptionId: null,
    },
  })
  return <div className="lux-shell"><div className="lux-phone payment-qa-background">
    <main><small>SECURE CHECKOUT</small><h1>Everything,<br/><em>considered.</em></h1></main>
    <PaymentEmailVerificationDialog
      challenge={challenge}
      subtotal={12_999}
      deliveryFee={650}
      rewardDiscount={500}
      total={13_149}
      onCancel={() => {}}
      onChallengeChange={setChallenge}
      onAuthorized={async () => {}}
    />
  </div></div>
}

function CheckoutFixture() {
  return <div className="lux-shell"><div className="lux-phone">
    <CheckoutPage
      userId="8150a7d9-8f0c-49fd-8816-35b18a399a6a"
      lines={[{
        product: {
          id: "EKOLSUND",
          name: "EKOLSUND",
          category: "Living room",
          price: "₱12,999",
          image: "/furniture/photo-1599696848652-f0ff23bc911f.jpg",
          alt: "CozyCraft armchair",
        },
        quantity: 2,
        selected: true,
      }]}
      profile={{ name: "Alex Rivera", email: "alex@example.test", phone: "+639171234567", image: "" }}
      storeSettings={{
        announcement_enabled: false,
        announcement_text: "",
        announcement_link: "",
        delivery_area: "Metro Manila",
        checkout_settings: { cod_enabled: true, card_enabled: true, gcash_enabled: true },
        fulfillment_settings: {},
      }}
      deliveryAreas={[{
        id: 1,
        area_code: "metro-manila",
        name: "Metro Manila",
        description: "NCR deliveries",
        delivery_fee: 650,
        free_delivery_minimum: 50_000,
        lead_time_min_days: 2,
        lead_time_max_days: 4,
        assembly_available: true,
        active: true,
        sort_order: 10,
      }]}
      redemptions={[{
        id: "local-welcome-reward",
        points_cost: 0,
        discount_amount: 500,
        reward_source: "welcome",
        minimum_order_amount: 5_000,
        status: "available",
        code: "WELCOME-COZY2026",
        created_at: "2026-09-04T00:00:00.000Z",
        expires_at: "2026-10-04T00:00:00.000Z",
        used_at: null,
      }]}
      close={() => {}}
      complete={() => {}}
    />
  </div></div>
}

function GoogleOnboardingFixture() {
  const voucherStep = params.get("google-onboarding") === "voucher"
  const [status, setStatus] = useState<MobileGoogleOnboardingStatus>({
    userId: "8150a7d9-8f0c-49fd-8816-35b18a399a6a",
    isGoogle: true,
    needsUsername: !voucherStep,
    username: voucherStep ? "alex.home" : "",
    showVoucher: voucherStep,
    voucher: voucherStep ? {
      id: "local-welcome-voucher",
      code: "WELCOME-COZY2026",
      discountAmount: 500,
      minimumOrderAmount: 5000,
      expiresAt: "2026-10-04T00:00:00.000Z",
    } : null,
  })
  return <div className="lux-shell"><div className="lux-phone payment-qa-background">
    <main><small>COZYCRAFT HOME</small><h1>A considered home,<br/><em>made personal.</em></h1></main>
    <GoogleCustomerOnboarding
      status={status}
      displayName="Alex Rivera"
      complete={async (username) => setStatus((current) => ({
        ...current,
        needsUsername: false,
        username,
        showVoucher: true,
        voucher: {
          id: "local-welcome-voucher",
          code: "WELCOME-COZY2026",
          discountAmount: 500,
          minimumOrderAmount: 5000,
          expiresAt: "2026-10-04T00:00:00.000Z",
        },
      }))}
      dismissVoucher={async () => setStatus((current) => ({ ...current, showVoucher: false }))}
      startShopping={async () => setStatus((current) => ({ ...current, showVoucher: false }))}
    />
  </div></div>
}

const fixtureProduct = { id: "EKOLSUND", name: "EKOLSUND reclining armchair", category: "Living room", price: "₱12,999", image: "/furniture/photo-1599696848652-f0ff23bc911f.jpg", alt: "Armchair", stock: 12, description: "A comfortable reclining armchair with a generous seat and a soft, easy-care cover.", materials: [{ type: "Seat and back", description: "High-resilience foam with polyester cushioning" }], dimensions: [{ label: "Width", value: "85", unit: "cm" }] }
function RangeFixture() {
  const [room, setRoom] = useState("living")
  const [subcategory, setSubcategory] = useState("")
  const products = ["living","bedroom","dining"].flatMap(room => [1000,15000,75000].map(price => ({ ...fixtureProduct, id: `${room}-${price}`, room, name: `${room} piece ${price}`, price: `₱${price.toLocaleString()}` })))
  return <div className="lux-shell"><div className="lux-phone"><ShopPage products={products} roomId={room} subcategory={subcategory} setRoom={setRoom} setSubcategory={setSubcategory} openProduct={()=>{}} saved={[]} bagQuantities={{}} save={()=>{}} add={()=>{}}/><section className="product-reviews"><article className="review-card"><div className="review-card-photos">{[0,1].map(i=><button key={i}><img src={fixtureProduct.image} alt={`Review photo ${i+1}`}/></button>)}</div></article></section></div></div>
}
function DesignFixture() {
  const [size, setSize] = useState(readMobileTextSize())
  const view = params.get("account") as "orders" | "addresses" | "payments" | "support" | null
  return <div className="lux-shell"><div className="lux-phone">
    {params.has("product") ? <ProductDetail p={fixtureProduct} saved={false} compared={false} userId="" deliveryAreas={[]} close={() => {}} save={() => {}} compare={() => {}} add={() => {}}/>
    : params.has("notifications") ? <NotificationsPage close={() => {}} userId="fixture" refresh={async () => {}} items={[{ id: "fixture-notification", kind: "order_confirmation", title: "Your order is confirmed", message: "Your furniture is being prepared. We will keep you updated on its delivery.", created_at: "2026-09-01T09:00:00Z" }]}/>
    : <Account userId="fixture" flash={() => {}} name="Alex Rivera" email="alex@example.test" image="" orders={[{ id: "CC-01041", databaseId: "fixture-order", status: "Processing", payment: "GCash", paymentStatus: "paid", total: 26648, subtotal: 25998, deliveryFee: 650, deliveryAreaName: "Metro Manila", address: "18 Narra Street, Bagong Pag-asa, Quezon City, Metro Manila 1105", createdAt: "2026-09-01T09:00:00Z", cancellationStatus: "pending", items: [{ product: fixtureProduct, quantity: 2, selected: true }] }]} points={8115} tier="Cozy Elite" lifetimeSpend={140000} completedOrders={2} savedCount={3} bagCount={2} unreadNotificationCount={1} textSize={size} changeTextSize={(next) => { saveMobileTextSize(next); setSize(next) }} pushPermission="granted" enableNotifications={() => {}} edit={() => {}} shop={() => {}} openMembership={() => {}} reviewPublished={() => {}} initialView={view} onInitialViewHandled={() => {}}/>}
  </div></div>
}

function HomeCircleFixture() {
  const [points, setPoints] = useState(650)
  return <div className="lux-shell"><div className="lux-phone"><HomeCirclePage points={points} tier="member" lifetimeSpend={12400} orderCount={2} activity={Array.from({ length: 12 }, (_, i) => ({ id: `earned-${i}`, description: `Points earned from delivered order ${i + 1}`, points: 124, created_at: "2026-09-01" }))} redemptions={[{ id: "welcome", points_cost: 0, discount_amount: 500, reward_source: "welcome", minimum_order_amount: 5000, status: "available", code: "QA", created_at: "2026-09-01", expires_at: "2030-10-04", used_at: null }]} close={() => {}} shop={() => {}} redeem={async cost => { setPoints(value => value - cost) }}/></div></div>
}

function DiscoveryFixture() {
  const [query, setQuery] = useState("")
  return <div className="lux-shell"><div className="lux-phone"><div className="search-overlay"><SearchDiscoveries products={[{name:"LYCKSELE LÖVÅS"},{name:"NÄMMARÖ"},{name:"EKOLSUND reclining armchair"},{name:"VIMLE"}]} select={setQuery}/><output aria-label="Selected query">{query}</output></div></div></div>
}

function CareFixture() {
  const [open,setOpen] = useState(true)
  const [destination,setDestination] = useState("")
  return <div className="lux-shell"><div className="lux-phone"><MobileCareChat open={open} userId="fixture" online={!params.has("offline")} accountDataReady products={[]} profileName="Alex" savedProductIds={[]} bag={[]} orders={[]} notifications={[]} loyalty={null} openProduct={() => {}} openDestination={value => setDestination(String(value))} onOpenChange={setOpen}/><output aria-label="Chat state">{open ? "open" : "closed"} {destination}</output></div></div>
}

const invoiceFixture = invoiceEmail({ id: "fixture", order_number: "CC-01131", status: "delivered", created_at: "2026-09-07T08:00:00Z", subtotal: 20000, delivery_fee: 650, reward_discount: 500, total: 20150, payment_method: "cod", payment_status: "paid", shipping_address: { name: "Ana Maria Rivera", line: "18 Narra Street", city: "Quezon City", province: "Metro Manila" }, order_items: [{ id: 1, product_name: "VIMLE two-seat sofa", quantity: 2, unit_price: 10000 }] })
if (params.has("invoice-template")) {
  const previewHtml = invoiceFixture.html.replace(`cid:${invoiceLogoAttachment.content_id}`, `data:image/png;base64,${invoiceLogoAttachment.content}`)
  const email = new DOMParser().parseFromString(previewHtml, "text/html")
  document.head.querySelectorAll("style,link[rel=stylesheet]").forEach(element => element.remove())
  document.documentElement.removeAttribute("class")
  document.documentElement.removeAttribute("style")
  document.body.style.cssText = email.body.style.cssText
  document.body.innerHTML = email.body.innerHTML
}
else createRoot(document.getElementById("root")!).render(<React.StrictMode>
  <DialogAccessibility />
  <ScrollBackButton />
  {params.has("range") && <div style={{position:"fixed",inset:0,zIndex:10000,overflowY:"auto",background:"#f7f5ef"}}><RangeFixture /></div>}
  {params.has("invoice") && <div style={{position:"fixed",inset:0,zIndex:10000,background:"#f7f5ef",padding:24}}><RequestOrderInvoice orderId="11111111-1111-4111-8111-111111111111" /></div>}
  {params.has("care") ? <CareFixture /> : params.has("discoveries") ? <DiscoveryFixture /> : params.has("membership") ? <HomeCircleFixture /> : params.has("motion") ? <CozyLaunchScreen animated /> : params.has("account") || params.has("product") || params.has("notifications") ? <DesignFixture /> : params.has("google-onboarding")
    ? <GoogleOnboardingFixture />
    : params.has("checkout")
      ? <CheckoutFixture />
    : params.has("payment")
    ? <PaymentFixture />
    : params.has("authenticator")
      ? <CustomerSecurityGate><ProfileFixture /></CustomerSecurityGate>
      : <ProfileFixture />}
</React.StrictMode>)
