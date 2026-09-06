export const HOME_CIRCLE_TIERS = [
  { key: "member", name: "Cozy Nest", target: 0, rate: "1 point per ₱100", description: "Your first chapter. Earn points with every eligible delivery." },
  { key: "plus", name: "Cozy Plus", target: 15000, rate: "1 point per ₱100", description: "A new milestone in making your home your own." },
  { key: "premium", name: "Cozy Premium", target: 50000, rate: "1.5× order points", description: "More points on eligible orders after reaching this level." },
  { key: "elite", name: "Cozy Elite", target: 120000, rate: "2× order points", description: "Our highest level, with double points on eligible orders." },
] as const

export function homeCircleTier(value?: string | null) {
  const normalized = value?.trim().toLowerCase()
  return HOME_CIRCLE_TIERS.find(tier => tier.key === normalized || tier.name.toLowerCase() === normalized) || HOME_CIRCLE_TIERS[0]
}

export const HOME_CIRCLE_REWARDS = [{ cost: 100, value: 100 }, { cost: 250, value: 300 }, { cost: 500, value: 700 }] as const

export function rewardState(reward: { status: string; expires_at: string }, now = Date.now()) {
  return reward.status === "available" && Date.parse(reward.expires_at) <= now ? "expired" : reward.status
}
