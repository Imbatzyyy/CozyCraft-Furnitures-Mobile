type CartProductLine = { product: { id: string } }

/**
 * Supabase does not promise row order. Preserve the visible cart order when
 * a realtime or refresh response updates line state, and append new products.
 */
export function preserveMobileCartOrder<T extends CartProductLine>(current: T[], next: T[]) {
  if (!current.length || !next.length) return next
  const incoming = new Map(next.map((line) => [line.product.id, line]))
  const ordered = current.flatMap((line) => {
    const refreshed = incoming.get(line.product.id)
    if (!refreshed) return []
    incoming.delete(line.product.id)
    return [refreshed]
  })
  return [...ordered, ...incoming.values()]
}
