import "./price-range.css"

export const PRICE_LIMIT = 200000
export const PRICE_STEP = 500
export function clampPriceRange(value: number, other: number, handle: "min" | "max") {
  const rounded = Math.round(value / PRICE_STEP) * PRICE_STEP
  return handle === "min" ? Math.max(0, Math.min(rounded, other - PRICE_STEP)) : Math.min(PRICE_LIMIT, Math.max(rounded, other + PRICE_STEP))
}
export default function PriceRange({ minimum, maximum, change }: { minimum: number; maximum: number; change: (min: number, max: number) => void }) {
  const peso = (value: number) => `₱${value.toLocaleString("en-PH")}`
  return <fieldset className="price-range">
    <legend>Price range</legend>
    <div className="price-range-values"><span>From <b>{peso(minimum)}</b></span><span>To <b>{peso(maximum)}</b></span></div>
    <div className="price-range-track">
      <div className="price-range-rail" aria-hidden="true"><span style={{ left: `${minimum / PRICE_LIMIT * 100}%`, right: `${100 - maximum / PRICE_LIMIT * 100}%` }} /></div>
      <input type="range" aria-label="Minimum price" aria-valuetext={peso(minimum)} min={0} max={PRICE_LIMIT} step={PRICE_STEP} value={minimum} onChange={event => change(clampPriceRange(Number(event.target.value), maximum, "min"), maximum)} />
      <input type="range" aria-label="Maximum price" aria-valuetext={peso(maximum)} min={0} max={PRICE_LIMIT} step={PRICE_STEP} value={maximum} onChange={event => change(minimum, clampPriceRange(Number(event.target.value), minimum, "max"))} />
    </div>
  </fieldset>
}
