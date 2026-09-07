import { useState } from "react"
import "./recipient-name-fields.css"

export function splitRecipientName(value: string) {
  const [first = "", ...rest] = value.trim().split(/\s+/)
  return { first, last: rest.join(" ") }
}

// Keep the existing database recipient_name contract shared with checkout/web.
// Local field state preserves spaces while editing compound names.
export default function RecipientNameFields({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [name, setName] = useState(() => splitRecipientName(value))
  const update = (field: "first" | "last", value: string) => {
    const next = { ...name, [field]: value }
    setName(next)
    onChange(next.first.trim() ? [next.first.trim(), next.last.trim()].filter(Boolean).join(" ") : "")
  }
  return <div className="recipient-name-fields wide">
    <label><span>First name</span><input autoComplete="given-name" value={name.first} onChange={event => update("first", event.target.value)} required /></label>
    <label><span>Last name</span><input autoComplete="family-name" value={name.last} onChange={event => update("last", event.target.value)} /></label>
  </div>
}
