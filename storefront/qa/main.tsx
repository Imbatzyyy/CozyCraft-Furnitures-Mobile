import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { ProfilePage } from "../src/Storefront"
import CustomerSecurityGate from "../src/features/auth/CustomerSecurityGate"
import PaymentEmailVerificationDialog from "../src/features/checkout/PaymentEmailVerificationDialog"
import type { MobileCustomerProfile } from "../src/lib/mobile-data"
import type { PaymentEmailChallenge } from "../src/features/checkout/payment-email-verification"
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
    <PaymentEmailVerificationDialog challenge={challenge} total={12_999} onCancel={() => {}} onChallengeChange={setChallenge} onAuthorized={async () => {}} />
  </div></div>
}

createRoot(document.getElementById("root")!).render(<React.StrictMode>
  {params.has("payment")
    ? <PaymentFixture />
    : params.has("authenticator")
      ? <CustomerSecurityGate><ProfileFixture /></CustomerSecurityGate>
      : <ProfileFixture />}
</React.StrictMode>)
