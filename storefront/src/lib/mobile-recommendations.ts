type RecommendationProduct = {
  id: string
  name: string
  category: string
  subcategory?: string
  room?: string
  rating?: number
  reviews?: number
  stock?: number
}

type RecommendationOrder<T extends RecommendationProduct> = {
  items: Array<{ product: T }>
}

export type MobileRecommendation<T extends RecommendationProduct = RecommendationProduct> = {
  product: T
  reason: string
  score: number
}

type RecommendationInput<T extends RecommendationProduct> = {
  products: T[]
  savedIds: string[]
  bagProductIds: string[]
  recentlyViewedIds: string[]
  orders: RecommendationOrder<T>[]
  limit?: number
}

const normalized = (value: unknown) => String(value || "").trim().toLowerCase()

/**
 * Ranks the catalog already held by the mobile storefront. This deliberately
 * performs no additional database request: wishlist, bag, orders, ratings,
 * and recent views are all part of the existing initial sync/offline cache.
 */
export function buildMobileRecommendations<T extends RecommendationProduct>({
  products,
  savedIds,
  bagProductIds,
  recentlyViewedIds,
  orders,
  limit = 4,
}: RecommendationInput<T>): MobileRecommendation<T>[] {
  const saved = new Set(savedIds)
  const inBag = new Set(bagProductIds)
  const recentRank = new Map(recentlyViewedIds.map((id, index) => [id, index]))
  const purchased = new Set(orders.flatMap((order) => order.items.map((line) => line.product.id)))
  const sourceProducts = [
    ...products.filter((product) => saved.has(product.id)),
    ...recentlyViewedIds.flatMap((id) => products.find((product) => product.id === id) || []),
    ...orders.flatMap((order) => order.items.map((line) => line.product)),
  ]

  const categoryAffinity = new Map<string, number>()
  const subcategoryAffinity = new Map<string, number>()
  const roomAffinity = new Map<string, number>()
  sourceProducts.forEach((product, index) => {
    const weight = Math.max(1, 6 - Math.min(index, 5))
    const category = normalized(product.category)
    const subcategory = normalized(product.subcategory)
    const room = normalized(product.room)
    if (category) categoryAffinity.set(category, (categoryAffinity.get(category) || 0) + weight)
    if (subcategory) subcategoryAffinity.set(subcategory, (subcategoryAffinity.get(subcategory) || 0) + weight + 2)
    if (room) roomAffinity.set(room, (roomAffinity.get(room) || 0) + weight)
  })

  return products
    .filter((product) => Number(product.stock ?? 0) > 0 && !inBag.has(product.id))
    .map((product, catalogIndex) => {
      const category = normalized(product.category)
      const subcategory = normalized(product.subcategory)
      const room = normalized(product.room)
      const categoryScore = categoryAffinity.get(category) || 0
      const subcategoryScore = subcategoryAffinity.get(subcategory) || 0
      const roomScore = roomAffinity.get(room) || 0
      const ratingScore = Math.max(0, Number(product.rating || 0)) * 2.2
      const reviewScore = Math.log10(Math.max(1, Number(product.reviews || 0) + 1)) * 1.8
      const savedScore = saved.has(product.id) ? 2.5 : 0
      const recentPosition = recentRank.get(product.id)
      const recentPenalty = recentPosition === undefined ? 0 : Math.max(0, 2.5 - recentPosition * .45)
      const purchasedPenalty = purchased.has(product.id) ? 3 : 0
      const freshnessScore = Math.max(0, 1.8 - catalogIndex * .08)
      const score = subcategoryScore * 1.45 + categoryScore + roomScore * .8 +
        ratingScore + reviewScore + savedScore + freshnessScore - recentPenalty - purchasedPenalty

      const reason = subcategoryScore > 0
        ? `Inspired by your ${product.subcategory || product.category} edit`
        : categoryScore > 0
          ? `More to love in ${product.category}`
          : roomScore > 0
            ? `Considered for your ${product.room} room`
            : Number(product.rating || 0) >= 4.5
              ? "A highly rated CozyCraft favourite"
              : "A fresh piece from the latest edit"

      return { product, reason, score }
    })
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, Math.max(0, limit))
}
