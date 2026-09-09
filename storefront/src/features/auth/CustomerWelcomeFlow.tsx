import { useState } from "react"
import WelcomeTour from "../../components/WelcomeTour"
import GoogleCustomerOnboarding from "./GoogleCustomerOnboarding"
import type { MobileGoogleOnboardingStatus } from "./google-customer-onboarding"

// One owner controls the three surfaces. A voucher is never acknowledged by
// starting/skipping a tutorial, and two modal focus locks never overlap.
export default function CustomerWelcomeFlow({ userId, status, blocked, displayName, complete, dismissVoucher, startShopping }: {
  userId: string
  status: MobileGoogleOnboardingStatus | null
  blocked: boolean
  displayName: string
  complete: (username: string, name?: { firstName: string; lastName: string }) => Promise<void>
  dismissVoucher: () => Promise<void>
  startShopping: () => Promise<void>
}) {
  const [tourPending, setTourPending] = useState<boolean | null>(null)
  const needsSetup = Boolean(status?.needsUsername)
  const awaitingTour = tourPending !== false
  const visibleStatus = status ? { ...status, showVoucher: status.showVoucher && !needsSetup && !awaitingTour && !blocked } : null
  return <>
    <WelcomeTour userId={userId} newGoogleAccount={Boolean(status?.needsUsername || status?.showVoucher)} blocked={blocked || needsSetup} onResolved={setTourPending} />
    {visibleStatus && <GoogleCustomerOnboarding status={visibleStatus} displayName={displayName} complete={complete} dismissVoucher={dismissVoucher} startShopping={startShopping} />}
  </>
}
