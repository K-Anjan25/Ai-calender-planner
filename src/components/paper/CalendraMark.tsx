/**
 * The Calendra mark.
 *
 * Reads as a calendar first: a bound leaf with a spine, a header band and a month grid. Reads as
 * *this* calendar second: the leaf is cut from two offset paper layers with a soft shadow between
 * them, which is the product's material without being a picture of paper.
 *
 * Drawn as inline SVG rather than pulled from an icon set so the mark can carry the cut-paper
 * geometry (the offset backing sheet, the deckled edge) that no stock icon has. Sizing comes from the
 * `size` prop, colour from `currentColor`, so it works on cream, on dyed stock and in the footer.
 */
export function CalendraMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Calendra"
    >
      {/* the backing sheet, offset down-left: the second layer of the cut */}
      <path
        d="M6.5 7.5h17.2c1.3 0 2.3 1 2.3 2.3v15.4c0 1.3-1 2.3-2.3 2.3H8.8c-1.3 0-2.3-1-2.3-2.3V7.5Z"
        fill="currentColor"
        opacity="0.28"
      />
      {/* the bound leaf */}
      <path
        d="M4.5 5.5h17.2c1.3 0 2.3 1 2.3 2.3v15.4c0 1.3-1 2.3-2.3 2.3H6.8c-1.3 0-2.3-1-2.3-2.3V5.5Z"
        fill="var(--paper-ivory, #E6E1D5)"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* the header band, dyed — the "month" of the leaf */}
      <path d="M4.5 10.2h19.5v3.1H4.5z" fill="currentColor" opacity="0.55" />
      {/* the binding: two posts through the header */}
      <path d="M9 4.2v3.4M19.2 4.2v3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* the month grid — five columns of dots, one row struck through as "placed" */}
      <g fill="currentColor" opacity="0.75">
        <circle cx="8.4" cy="16.6" r="1.05" />
        <circle cx="12.2" cy="16.6" r="1.05" />
        <circle cx="16" cy="16.6" r="1.05" />
        <circle cx="19.8" cy="16.6" r="1.05" />
        <circle cx="8.4" cy="20.3" r="1.05" />
        <circle cx="12.2" cy="20.3" r="1.05" />
        <circle cx="16" cy="20.3" r="1.05" />
        <circle cx="19.8" cy="20.3" r="1.05" />
        <circle cx="8.4" cy="24" r="1.05" />
        <circle cx="12.2" cy="24" r="1.05" />
      </g>
      {/* the one block that owns the afternoon */}
      <rect x="15" y="22.4" width="6" height="3.2" rx="0.9" fill="currentColor" opacity="0.95" />
    </svg>
  )
}

/** Mark + wordmark, for headers and footers. */
export function CalendraLogo({
  size = 28,
  className,
  markClassName,
  showWordmark = true,
}: {
  size?: number
  className?: string
  markClassName?: string
  showWordmark?: boolean
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ''}`}>
      <CalendraMark size={size} className={markClassName} />
      {showWordmark ? (
        <span className="font-[family-name:var(--font-display)] text-[21px] font-semibold tracking-tight whitespace-nowrap">
          Calendra
        </span>
      ) : null}
    </span>
  )
}
