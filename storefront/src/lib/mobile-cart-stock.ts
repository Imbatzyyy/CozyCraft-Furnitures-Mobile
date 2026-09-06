export type MobileCartStockStatus = {
  availableStock: number | null
  maxReached: boolean
  outOfStock: boolean
  exceedsStock: boolean
  canIncrease: boolean
}

/**
 * Keep cart stock decisions in one place so the bag, add-to-cart actions, and
 * tests use the same boundary. A missing stock value is treated as unknown;
 * the existing client-side safety cap remains 99 until checkout revalidates.
 */
export function mobileCartStockStatus(stock: unknown, quantity: unknown): MobileCartStockStatus {
  const parsedStock = Number(stock)
  const availableStock = Number.isFinite(parsedStock)
    ? Math.max(0, Math.floor(parsedStock))
    : null
  const currentQuantity = Math.max(0, Math.floor(Number(quantity) || 0))
  const outOfStock = availableStock === 0
  const exceedsStock = availableStock !== null && currentQuantity > availableStock
  const maxReached = availableStock !== null
    && availableStock > 0
    && currentQuantity >= availableStock

  return {
    availableStock,
    maxReached,
    outOfStock,
    exceedsStock,
    canIncrease: availableStock === null
      ? currentQuantity < 99
      : currentQuantity < availableStock,
  }
}
