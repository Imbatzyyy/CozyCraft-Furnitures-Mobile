import CozyLoader from "./CozyLoader"

/**
 * The one loading surface used while the app is becoming interactive.
 *
 * Account checks, lazy route loading, and the first catalog request can finish
 * at different times. Keeping them on the same surface prevents the customer
 * from seeing a sequence of unrelated loading screens during launch.
 */
export default function CozyLaunchScreen({ label = "Preparing your home…", animated = false, exiting = false }: { label?: string; animated?: boolean; exiting?: boolean }) {
  return (
    <main className={`storefront-loading cozy-launch-screen${animated ? " cozy-launch-screen--animated" : ""}${exiting ? " cozy-launch-screen--exiting" : ""}`} aria-live="polite">
      <CozyLoader label={label} />
    </main>
  )
}
