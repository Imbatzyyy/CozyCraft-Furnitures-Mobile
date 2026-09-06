import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { CheckoutPage, ProfilePage } from "../src/Storefront"
import CustomerSecurityGate from "../src/features/auth/CustomerSecurityGate"
import PaymentEmailVerificationDialog from "../src/features/checkout/PaymentEmailVerificationDialog"
import GoogleCustomerOnboarding from "../src/features/auth/GoogleCustomerOnboarding"
import type { MobileCustomerProfile } from "../src/lib/mobile-data"
import type { PaymentEmailChallenge } from "../src/features/checkout/payment-email-verification"
import type { MobileGoogleOnboardingStatus } from "../src/features/auth/google-customer-onboarding"
import "../src/index.css"
import "../src/native-responsive.css"

const params = new URLSearchParams(window.location.search)
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

createRoot(document.getElementById("root")!).render(<React.StrictMode>
  {params.has("google-onboarding")
    ? <GoogleOnboardingFixture />
    : params.has("checkout")
      ? <CheckoutFixture />
    : params.has("payment")
    ? <PaymentFixture />
    : params.has("authenticator")
      ? <CustomerSecurityGate><ProfileFixture /></CustomerSecurityGate>
      : <ProfileFixture />}
</React.StrictMode>)
