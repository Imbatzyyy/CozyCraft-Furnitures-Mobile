import { useEffect, useState } from "react"
import "./cozy-companion.css"

export type CompanionPose = "wave" | "heart" | "pillow" | "welcome" | "thumbs-up" | "celebrate" | "sleep" | "signup-name" | "signup-username" | "signup-email" | "signup-security" | "signup-verify" | "tour-guide" | "tour-bag" | "tour-account" | "tour-voucher"
const descriptions: Record<CompanionPose, string> = {
  "tour-guide": "CozyCraft companion showing you around",
  "tour-bag": "CozyCraft companion holding your shopping bag",
  "tour-account": "CozyCraft companion holding an account card",
  "tour-voucher": "CozyCraft companion presenting your welcome voucher",
  wave: "CozyCraft companion waving", heart: "CozyCraft companion holding a heart",
  pillow: "CozyCraft companion hugging a pillow", welcome: "CozyCraft companion welcoming you",
  "thumbs-up": "CozyCraft companion giving a thumbs-up", celebrate: "CozyCraft companion celebrating",
  sleep: "CozyCraft companion resting",
  "signup-name": "CozyCraft companion welcoming you",
  "signup-username": "CozyCraft companion holding your name plaque",
  "signup-email": "CozyCraft companion holding a sealed letter",
  "signup-security": "CozyCraft companion holding a security shield",
  "signup-verify": "CozyCraft companion opening your confirmation letter",
}
const upcoming: Partial<Record<CompanionPose, CompanionPose[]>> = {
  "signup-name": ["signup-username"], "signup-username": ["signup-email", "tour-guide"],
  "signup-email": ["signup-security"], "signup-security": ["signup-verify", "tour-guide"],
  "tour-guide": ["heart", "tour-voucher"], heart: ["tour-bag"],
  "tour-bag": ["tour-account", "tour-voucher"], "tour-account": ["tour-voucher"],
}
const warmed = new Set<string>()
export default function CozyCompanion({ pose, compact = false }: { pose: CompanionPose; compact?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    for (const next of upcoming[pose] || []) {
      const pixels = (next === "tour-voucher" ? 120 : 230) * window.devicePixelRatio
      const src = `./mascot/optimized/${next}-${pixels > 384 ? 768 : 384}.webp`
      if (warmed.has(src)) continue
      warmed.add(src)
      const image = new Image()
      image.src = src
      void image.decode?.().catch(() => warmed.delete(src))
    }
  }, [pose])
  if (failed) return null
  return <div className={`cozy-companion${compact ? " cozy-companion--compact" : ""}`}>
    <button type="button" className={`cozy-companion__touch${playing ? " is-playing" : ""}`} aria-label={`Say hello to the CozyCraft companion`} onClick={() => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true)
    }} onAnimationEnd={() => setPlaying(false)}>
      <picture>
        <source type="image/webp" srcSet={`./mascot/optimized/${pose}-384.webp 384w, ./mascot/optimized/${pose}-768.webp 768w`} sizes={compact ? "120px" : "230px"} />
        <img src={`./mascot/${pose}.png`} width="768" height="768" alt={descriptions[pose]} loading="eager" decoding="async" draggable={false} onError={() => setFailed(true)}/>
      </picture>
    </button>
  </div>
}
