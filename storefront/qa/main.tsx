import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { ProfilePage } from "../src/Storefront"
import CustomerSecurityGate from "../src/features/auth/CustomerSecurityGate"
import type { MobileCustomerProfile } from "../src/lib/mobile-data"
import "../src/index.css"
import "../src/native-responsive.css"

const params = new URLSearchParams(window.location.search)
document.documentElement.classList.add(params.get("platform") === "android" ? "cozy-platform-android" : "cozy-platform-ios")

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

createRoot(document.getElementById("root")!).render(<React.StrictMode>
  {params.has("authenticator") ? <CustomerSecurityGate><ProfileFixture /></CustomerSecurityGate> : <ProfileFixture />}
</React.StrictMode>)
