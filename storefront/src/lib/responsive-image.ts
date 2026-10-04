const publicProducts = /^https:\/\/gwjsivqksyimuabbdyqq\.supabase\.co\/storage\/v1\/object\/public\/product-images\//
/** Never forward private avatars, signed URLs or user-controlled hosts to a public CDN. */
export function productImageSources(source?: string) {
  if (!source || !publicProducts.test(source)) return null
  try {
    const url = new URL(source)
    if (!publicProducts.test(url.href) || url.username || url.password || url.search || url.hash
      || /(?:^|\/)\.\.(?:\/|$)/.test(decodeURIComponent(url.pathname))) return null
    const variant = (width: number) => `https://www.cozycraftfurnitures.com/.netlify/images?${new URLSearchParams({ url: source, w: String(width), fit: "contain", q: "80" })}`
    return { src: variant(640), srcSet: [320, 640, 960, 1440].map(width => `${variant(width)} ${width}w`).join(", ") }
  } catch { return null }
}
