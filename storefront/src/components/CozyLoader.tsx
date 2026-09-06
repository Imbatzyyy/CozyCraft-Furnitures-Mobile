/** A bundled vector keeps the loading mark crisp without image requests. */
export default function CozyLoader({ label, compact = false }: { label?: string; compact?: boolean }) {
  return <span className={`cozy-loader${compact ? " cozy-loader--compact" : ""}`} role={label ? "status" : undefined} aria-hidden={label ? undefined : true}>
    <svg className="cozy-loader__sofa" viewBox="0 0 64 48" fill="none" aria-hidden="true">
      <g className="cozy-loader__cushions" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M13 25V15a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v10"/>
        <path d="M32 11v14"/>
      </g>
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 25v5h36v-5a5 5 0 0 1 10 0v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V25a5 5 0 0 1 10 0Z" fill="currentColor" fillOpacity=".12"/>
        <path d="M11 39v4m42-4v4"/>
      </g>
    </svg>
    {label && <span className="cozy-loader__label">{label}</span>}
  </span>
}
