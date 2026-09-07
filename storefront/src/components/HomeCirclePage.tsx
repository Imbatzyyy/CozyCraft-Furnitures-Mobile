import { useEffect, useRef, useState } from "react"
import useVisibleInterval from "./useVisibleInterval"
import { HOME_CIRCLE_REWARDS, HOME_CIRCLE_TIERS, homeCircleTier, rewardState } from "../lib/home-circle"
import type { MobileRedemption } from "../lib/mobile-data"
import "./home-circle.css"

const amount = (value: number) => `₱${Number(value).toLocaleString("en-PH")}`
const date = (value: string) => new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })

export default function HomeCirclePage({ points, tier, lifetimeSpend, orderCount, activity, redemptions, close, shop, redeem, ready = true, loadError = "" }: {
  points: number; tier: string; lifetimeSpend: number; orderCount: number
  activity: Array<Record<string, any>>; redemptions: MobileRedemption[]
  close: () => void; shop: () => void; redeem: (points: 100 | 250 | 500) => Promise<void>
  ready?: boolean; loadError?: string
}) {
  const [now, setNow] = useState(Date.now)
  const [selected, setSelected] = useState<100 | 250 | 500 | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [history, setHistory] = useState(false)
  const [activityPage, setActivityPage] = useState(0)
  const activityPages = Math.max(1, Math.ceil(activity.length / 5))
  const currentActivityPage = Math.min(activityPage, activityPages - 1)
  const visibleActivity = activity.slice(currentActivityPage * 5, currentActivityPage * 5 + 5)
  useEffect(() => { setActivityPage(0) }, [activity[0]?.id])
  useVisibleInterval(() => setNow(Date.now()), 30_000, true)
  const current = homeCircleTier(tier)
  const index = HOME_CIRCLE_TIERS.indexOf(current)
  const next = HOME_CIRCLE_TIERS[index + 1]
  const progress = next ? Math.max(0, Math.min(100, (lifetimeSpend - current.target) / (next.target - current.target) * 100)) : 100
  const available = redemptions.filter(reward => rewardState(reward, now) === "available")
  const past = redemptions.filter(reward => rewardState(reward, now) !== "available")
  const chosen = HOME_CIRCLE_REWARDS.find(reward => reward.cost === selected)
  const confirm = async () => {
    if (!chosen || pending.current || points < chosen.cost || !ready) return
    pending.current = true; setBusy(true); setError(""); setNotice("")
    try {
      await redeem(chosen.cost)
      setNotice(`${amount(chosen.value)} reward added to your wallet. Select it at checkout.`)
      setSelected(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't create your reward. Please try again.")
    } finally { pending.current = false; setBusy(false) }
  }
  const rewardRow = (reward: MobileRedemption) => <article className="hc-voucher" key={reward.id}>
    <div><span className="hc-eyebrow">{reward.reward_source === "welcome" ? "Welcome reward" : "Points reward"}</span>
      <h3>{amount(reward.discount_amount)} off</h3>
      {reward.minimum_order_amount > 0 && <p>On orders from {amount(reward.minimum_order_amount)}</p>}
      <p>{rewardState(reward, now) === "available" ? `Use by ${date(reward.expires_at)}` : rewardState(reward, now) === "expired" ? `Expired ${date(reward.expires_at)}` : "Saved in your reward history"}</p>
    </div><span className={`hc-status hc-status--${rewardState(reward, now)}`}>{rewardState(reward, now) === "available" ? "Ready to use" : rewardState(reward, now)}</span>
  </article>
  return <section className="membership-page home-circle" role="dialog" aria-modal="true" aria-labelledby="hc-title">
    <header className="hc-header"><button onClick={close} aria-label="Close Home Circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg></button><div><span className="hc-eyebrow">CozyCraft Furnitures</span><p>Home Circle</p></div><span className="hc-seal" aria-hidden="true">C</span></header>
    <main className="hc-content">
      <div className="hc-intro"><span className="hc-eyebrow">A little more, for your home</span><h1 id="hc-title">Make yourself<br/><em>at home.</em></h1><p>Your points, rewards, and next chapter—all in one place.</p></div>
      {loadError && <p className="hc-feedback" role="alert">{loadError}</p>}
      <section className="hc-balance" aria-label="Your points and tier" aria-busy={!ready}>
        <div className="hc-balance-top"><span className="hc-eyebrow">Available points</span><span className="hc-tier">{current.name}</span></div>
        <strong className="hc-points">{ready ? points.toLocaleString("en-PH") : "—"}</strong>
        <p>{ready ? current.rate + " on eligible deliveries" : "Updating your Home Circle balance…"}</p>
        <div className="hc-progress-label"><span>{next ? `Next: ${next.name}` : "Your highest level"}</span><span>{ready ? `${Math.round(progress)}%` : "—"}</span></div>
        <div className="hc-progress" role="progressbar" aria-label={next ? `Progress to ${next.name}` : "Highest tier reached"} aria-valuenow={ready ? Math.round(progress) : undefined} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${ready ? progress : 0}%` }}/></div>
        <p className="hc-progress-note">{!ready ? "Your account is syncing." : next ? `${amount(Math.max(0, next.target - lifetimeSpend))} in eligible deliveries to your next level.` : "Welcome to the full Home Circle experience."}</p>
      </section>
      <dl className="hc-summary"><div><dt>Eligible spend</dt><dd>{ready ? amount(lifetimeSpend) : "—"}</dd></div><div><dt>Delivered orders</dt><dd>{orderCount.toLocaleString()}</dd></div></dl>
      <section className="hc-section" aria-labelledby="hc-wallet"><div className="hc-section-title"><div><span className="hc-eyebrow">Yours to enjoy</span><h2 id="hc-wallet">Your rewards</h2></div><span className="hc-count">{available.length} available</span></div>
        {available.length ? <><div className="hc-vouchers">{available.map(rewardRow)}</div><p className="hc-note">Choose an available reward in the payment step at checkout.</p></> : <p className="hc-empty">{ready ? "Your next reward starts here. Exchange points below, then use your reward at checkout." : "Loading your rewards…"}</p>}
        {past.length > 0 && <><button className="hc-text-button" onClick={() => setHistory(!history)} aria-expanded={history}>{history ? "Hide reward history" : `View reward history (${past.length})`}</button>{history && <div className="hc-vouchers">{past.map(rewardRow)}</div>}</>}
      </section>
      <section className="hc-section" aria-labelledby="hc-exchange"><div className="hc-section-title"><div><span className="hc-eyebrow">A thoughtful return</span><h2 id="hc-exchange">Put points to use.</h2></div></div>
        <div className="hc-exchange">{HOME_CIRCLE_REWARDS.map(reward => <button key={reward.cost} disabled={!ready || points < reward.cost || busy} onClick={() => { setSelected(reward.cost); setError(""); setNotice("") }} aria-label={`Exchange ${reward.cost} points for ${amount(reward.value)} reward`}>
          <span><strong>{amount(reward.value)}</strong><span>shopping reward</span></span><span className="hc-exchange-action"><b>{reward.cost} points</b><span>{!ready ? "Updating…" : points < reward.cost ? `${reward.cost - points} more to go` : "Choose reward →"}</span></span>
        </button>)}</div>
        {chosen && <div className="hc-confirm" aria-label="Confirm reward exchange"><h3>{amount(chosen.value)} for your home</h3><p>Exchange {chosen.cost} points for a reward valid for 30 days. Your remaining balance will be {Math.max(0, points - chosen.cost).toLocaleString()} points.</p><div><button disabled={busy || points < chosen.cost || !ready} onClick={() => void confirm()}>{busy ? "Creating reward…" : `Confirm · ${chosen.cost} points`}</button><button disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></div>}
        {error && <p className="hc-feedback" role="alert">{error}</p>}{notice && <p className="hc-success" role="status">{notice}</p>}
        <p className="hc-note">Points rewards last 30 days. The discount you can apply is shown before you place your order.</p>
      </section>
      <section className="hc-section" aria-labelledby="hc-journey"><div className="hc-section-title"><div><span className="hc-eyebrow">Room to grow</span><h2 id="hc-journey">Your Home Circle journey</h2></div></div>
        <ol className="hc-levels">{HOME_CIRCLE_TIERS.map((level, i) => <li key={level.key} className={i === index ? "is-current" : ""}><span className="hc-level-index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><div><div className="hc-level-title"><h3>{level.name}</h3>{i === index && <span className="hc-status">Your level</span>}</div><p className="hc-level-spend">{level.target ? `From ${amount(level.target)} in eligible deliveries` : "From your first day"}</p><p>{level.rate}</p><p>{level.description}</p></div></li>)}</ol>
      </section>
      <section className="hc-section" aria-labelledby="hc-activity"><div className="hc-section-title"><div><span className="hc-eyebrow">Every little addition</span><h2 id="hc-activity">Recent activity</h2></div></div>
        {activity.length ? <ul className="hc-ledger">{visibleActivity.map(entry => <li key={entry.id}><div><p>{entry.description}</p><time dateTime={entry.created_at}>{date(entry.created_at)}</time></div><strong className={Number(entry.points) > 0 ? "is-earned" : ""}>{Number(entry.points) > 0 ? "+" : ""}{Number(entry.points).toLocaleString()}<span>points</span></strong></li>)}</ul> : <p className="hc-empty">Your points history will appear here after an eligible delivery, review, or reward exchange.</p>}
        {activityPages > 1 && <nav className="hc-pagination" aria-label="Recent activity pages">
          <button disabled={currentActivityPage === 0} onClick={() => setActivityPage(currentActivityPage - 1)}>Previous</button>
          <span role="status" aria-live="polite">Page {currentActivityPage + 1} of {activityPages}</span>
          <button disabled={currentActivityPage === activityPages - 1} onClick={() => setActivityPage(currentActivityPage + 1)}>Next</button>
        </nav>}
      </section>
      <aside className="hc-details"><h2>Good to know</h2><p>Eligible delivered orders earn points. Premium and Elite multipliers apply based on your eligible spend before the order is delivered. Cancelled or refunded orders can reverse earned points.</p><p>Points and rewards follow your account across devices. Your reward’s expiry date and order minimum are shown in your wallet.</p></aside>
      <button className="hc-shop" onClick={shop}>Find your next piece <span aria-hidden="true">→</span></button>
      <p className="hc-footer">CozyCraft · Furniture for a life well lived.</p>
    </main>
  </section>
}
