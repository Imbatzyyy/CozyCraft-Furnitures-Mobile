import CozyLoader from "./CozyLoader"
import type { LaunchPace } from "./launch-handoff"

/**
 * The one loading surface used while the app is becoming interactive.
 *
 * Account checks, lazy route loading, and the first catalog request can finish
 * at different times. Keeping them on the same surface prevents the customer
 * from seeing a sequence of unrelated loading screens during launch.
 */
export default function CozyLaunchScreen({ label = "Preparing your home…", animated = false, exiting = false, handoff = false, pace = "full" }: { label?: string; animated?: boolean; exiting?: boolean; handoff?: boolean; pace?: LaunchPace }) {
  const className = `storefront-loading cozy-launch-screen${animated ? " cozy-launch-screen--animated" : ""}${animated && pace === "quick" ? " cozy-launch-screen--quick" : ""}${exiting ? " cozy-launch-screen--exiting" : ""}${handoff ? " cozy-launch-screen--handoff" : ""}`
  return (
    <main className={className} aria-live="polite" role={handoff ? "status" : undefined} aria-label={handoff ? label : undefined}>
      {!handoff && <CozyLoader label={label} />}
    </main>
  )
}
