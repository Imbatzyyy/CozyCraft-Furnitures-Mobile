import { useState } from "react"
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
export default function CozyCompanion({ pose, compact = false }: { pose: CompanionPose; compact?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <div className={`cozy-companion${compact ? " cozy-companion--compact" : ""}`}>
    <button type="button" className={`cozy-companion__touch${playing ? " is-playing" : ""}`} aria-label={`Say hello to the CozyCraft companion`} onClick={() => {
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true)
    }} onAnimationEnd={() => setPlaying(false)}>
      <img src={`./mascot/${pose}.png`} width="1280" height="1280" alt={descriptions[pose]} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)}/>
    </button>
  </div>
}
