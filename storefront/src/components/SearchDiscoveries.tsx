import "./search-discoveries.css"

export function discoveryNames(products: ReadonlyArray<{ name: string }>) {
  const seen = new Set<string>()
  return products.map(product => product.name.trim()).filter(name => {
    const key = name.toLocaleLowerCase()
    if (!name || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 4)
}

export default function SearchDiscoveries({ products, select }: { products: ReadonlyArray<{ name: string }>; select: (query: string) => void }) {
  const names = discoveryNames(products)
  if (!names.length) return null
  return <section className="search-discovery catalog-discoveries" aria-label="Discover pieces">
    <p>DISCOVER PIECES</p>
    <div>{names.map(name => <button type="button" key={name} onClick={() => select(name)} aria-label={`Search for ${name}`}>
      <span className="discovery-name">{name}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 18 18 6M7 6h11v11"/></svg>
    </button>)}</div>
  </section>
}
