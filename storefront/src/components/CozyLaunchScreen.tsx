import CozyLoader from "./CozyLoader"

/**
 * The one loading surface used while the app is becoming interactive.
 *
 * Account checks, lazy route loading, and the first catalog request can finish
 * at different times. Keeping them on the same surface prevents the customer
 * from seeing a sequence of unrelated loading screens during launch.
 */
export default function CozyLaunchScreen({ label = "Preparing your home…" }: { label?: string }) {
  return (
    <main className="storefront-loading cozy-launch-screen" aria-live="polite">
      <CozyLoader label={label} />
    </main>
  )
}
