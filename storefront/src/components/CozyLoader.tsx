/** A bundled vector keeps the loading mark crisp without image requests. */
export default function CozyLoader({ label, compact = false }: { label?: string; compact?: boolean }) {
  return <span className={`cozy-loader${compact ? " cozy-loader--compact" : ""}`} role={label ? "status" : undefined} aria-hidden={label ? undefined : true}>
    <svg className="cozy-loader__sofa" viewBox="0 0 64 56" fill="none" aria-hidden="true">
      <ellipse className="cozy-loader__shadow" cx="32" cy="51" rx="23" ry="2" fill="currentColor" opacity=".12" />
      <g className="cozy-loader__body">
      <g className="cozy-loader__cushions" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M13 25V15a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v10"/>
        <rect className="cozy-loader__pillow cozy-loader__pillow--left" x="17" y="14" width="13" height="13" rx="3" fill="currentColor" fillOpacity=".14" strokeWidth="1.5" />
        <rect className="cozy-loader__pillow cozy-loader__pillow--right" x="34" y="14" width="13" height="13" rx="3" fill="currentColor" fillOpacity=".14" strokeWidth="1.5" />
      </g>
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 25v5h36v-5a5 5 0 0 1 10 0v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V25a5 5 0 0 1 10 0Z" fill="currentColor" fillOpacity=".12"/>
        <path d="M11 39v4m42-4v4"/>
      </g>
      </g>
    </svg>
    {label && <span className="cozy-loader__label">{label}</span>}
  </span>
}
