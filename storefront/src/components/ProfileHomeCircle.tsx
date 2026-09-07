import { HOME_CIRCLE_TIERS, homeCircleTier } from "../lib/home-circle"
import "./profile-home-circle.css"

export default function ProfileHomeCircle({ points, tier, lifetimeSpend, open }: { points: number; tier: string; lifetimeSpend: number; open: () => void }) {
  const current = homeCircleTier(tier)
  const next = HOME_CIRCLE_TIERS[HOME_CIRCLE_TIERS.indexOf(current) + 1]
  return <button className="profile-circle-card" onClick={open} type="button" aria-label="Open Home Circle points and rewards">
    <span className="pc-heading"><span>Home Circle</span><span className="pc-tier">{current.name}</span></span>
    <span className="pc-balance-label">Available points</span>
    <span className="pc-balance"><strong>{points.toLocaleString("en-PH")}</strong></span>
    <span className="pc-note">{next ? `₱${Math.max(0, next.target - lifetimeSpend).toLocaleString("en-PH")} in eligible deliveries to ${next.name}.` : "Enjoy double points on eligible deliveries."}</span>
    <span className="pc-footer"><span>Explore your rewards</span><span className="pc-arrow"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></span></span>
  </button>
}
