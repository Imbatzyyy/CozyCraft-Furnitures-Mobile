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
  // A same-account refresh may temporarily have no snapshot. Keep the mounted
  // form (including its focus and in-flight submit lock) until a real status
  // arrives. A different identity never inherits the previous surface.
  const [snapshot, setSnapshot] = useState(status)
  if (status?.userId === userId && status !== snapshot) setSnapshot(status)
  const currentStatus = status?.userId === userId ? status : snapshot?.userId === userId ? snapshot : null
  const needsSetup = Boolean(currentStatus?.needsUsername)
  const awaitingTour = tourPending !== false
  const visibleStatus = currentStatus ? { ...currentStatus, showVoucher: currentStatus.showVoucher && !needsSetup && !awaitingTour && !blocked } : null
  return <>
    <WelcomeTour userId={userId} newGoogleAccount={Boolean(currentStatus?.needsUsername || currentStatus?.showVoucher)} blocked={blocked || needsSetup} onResolved={setTourPending} />
    {visibleStatus && <GoogleCustomerOnboarding key={userId} status={visibleStatus} displayName={displayName} complete={complete} dismissVoucher={dismissVoucher} startShopping={startShopping} />}
  </>
}
