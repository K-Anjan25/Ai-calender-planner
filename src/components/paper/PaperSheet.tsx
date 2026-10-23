import { clsx } from 'clsx'

/**
 * Paper surfaces (DESIGN.md §9).
 *
 * A sheet, the mat that peeks out beneath it, and the well it can be cut into. Depth comes from the
 * shadow between layers, never from a colour change alone — that is the whole material metaphor.
 */

export type PaperTone = 'ivory' | 'sand' | 'kraft' | 'cream'

const TONE_CLASS: Record<PaperTone, string> = {
  ivory: 'bg-paper-ivory',
  sand: 'bg-paper-sand',
  kraft: 'bg-paper-kraft',
  cream: 'bg-paper-cream',
}

export function PaperSheet({
  as: Tag = 'section',
  tone = 'ivory',
  elevation = 'sheet',
  mat = false,
  className,
  children,
  ...rest
}: {
  as?: React.ElementType
  tone?: PaperTone
  elevation?: 'mat' | 'sheet' | 'lift' | 'none'
  mat?: boolean
  className?: string
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLElement>) {
  const shadow =
    elevation === 'lift' ? 'shadow-[var(--shadow-lift)]' : elevation === 'mat' ? 'shadow-[var(--shadow-mat)]' : elevation === 'none' ? '' : 'shadow-[var(--shadow-sheet)]'
  return (
    <Tag
      className={clsx(
        'paper-fibre paper-tooth relative',
        TONE_CLASS[tone],
        shadow,
        'border border-[color:rgba(19,76,101,0.14)]',
        'rounded-[var(--radius-cut)]',
        mat && 'paper-mat',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** A recess: something cut *into* the board rather than laid on top. */
export function PaperWell({
  className,
  children,
  ...rest
}: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('paper-well paper-fibre relative', className)} {...rest}>
      {children}
    </div>
  )
}

export function PaperCard({
  eyebrow,
  title,
  actions,
  footer,
  tone = 'ivory',
  className,
  bodyClassName,
  children,
}: {
  eyebrow?: React.ReactNode
  title?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  tone?: PaperTone
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}) {
  return (
    <PaperSheet tone={tone} className={clsx('p-4 sm:p-5', className)}>
      {(eyebrow || title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-faint">{eyebrow}</p>
            ) : null}
            {title ? <h3 className="text-[17px] leading-tight text-ink">{title}</h3> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
      {footer ? <footer className="paper-perforation mt-4 pt-3 text-xs text-ink-faint">{footer}</footer> : null}
    </PaperSheet>
  )
}

/**
 * CutEdge — a scalloped or torn silhouette, as if the sheet was cut with a blade against a
 * straightedge. Used on section dividers and the hero scenery base.
 */
export function CutEdge({
  variant = 'scallop',
  flip = false,
  className,
  height = 18,
}: {
  variant?: 'scallop' | 'torn' | 'hill'
  flip?: boolean
  className?: string
  height?: number
}) {
  const width = 120
  const paths: Record<typeof variant, string> = {
    scallop: `M0,${height} ${Array.from({ length: 12 }, (_, i) => {
      const x = (i + 0.5) * (width / 12)
      const y = i % 2 === 0 ? height * 0.35 : height * 0.05
      return `Q${x},${y} ${(i + 1) * (width / 12)},${height}`
    }).join(' ')} L${width},${height} L0,${height} Z`,
    torn: `M0,${height} L0,${height * 0.5} ${Array.from({ length: 9 }, (_, i) => {
      const x = ((i + 1) * width) / 9
      const y = height * (0.1 + ((i * 7) % 5) / 12)
      return `L${x},${y}`
    }).join(' ')} L${width},${height} Z`,
    hill: `M0,${height} Q${width * 0.25},${height * 0.1} ${width * 0.5},${height * 0.55} T${width},${height * 0.2} L${width},${height} Z`,
  }
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={clsx('block w-full', flip && 'rotate-180', className)}
      style={{ height }}
    >
      <path d={paths[variant]} fill="currentColor" />
    </svg>
  )
}

/**
 * LayerStack — thin stacked edges that read as the glued layers of a diorama, used behind cards
 * and headers instead of a plain border.
 */
export function LayerStack({ layers = 3, className }: { layers?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx('pointer-events-none absolute inset-0', className)}>
      {Array.from({ length: layers }).map((_, index) => (
        <span
          key={index}
          className="absolute inset-0 rounded-[var(--radius-cut)] bg-paper-sand"
          style={{
            transform: `translate(${(index + 1) * 3}px, ${(index + 1) * 4}px)`,
            opacity: 0.55 - index * 0.13,
          }}
        />
      ))}
    </span>
  )
}
