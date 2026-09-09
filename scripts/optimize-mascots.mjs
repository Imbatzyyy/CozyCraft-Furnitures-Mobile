import { createRequire } from "node:module"
import { readdir, mkdir, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP_MODULE || "sharp")
const root = fileURLToPath(new URL("../storefront/public/mascot/", import.meta.url))
await mkdir(`${root}optimized`, { recursive: true })
let original = 0, optimized = 0
for (const name of await readdir(root)) {
  if (!name.endsWith(".png")) continue
  original += (await stat(`${root}${name}`)).size
  for (const size of [384, 768]) {
    const target = `${root}optimized/${name.slice(0, -4)}-${size}.webp`
    await sharp(`${root}${name}`).resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90 }).toFile(target)
    if (size === 768) optimized += (await stat(target)).size
  }
}
console.log(JSON.stringify({ originalBytes: original, webp768Bytes: optimized, reductionPercent: Math.round((1 - optimized / original) * 100) }))
