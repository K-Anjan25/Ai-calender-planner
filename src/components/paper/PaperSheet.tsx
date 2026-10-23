import { clsx } from 'clsx'

/** Shared flat application surfaces. */

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
  className,
  children,
  ...rest
}: {
  as?: React.ElementType
  tone?: PaperTone
  elevation?: 'mat' | 'sheet' | 'lift' | 'none'
  className?: string
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLElement>) {
  const shadow =
    elevation === 'lift' ? 'shadow-[var(--shadow-lift)]' : elevation === 'mat' ? 'shadow-[var(--shadow-mat)]' : elevation === 'none' ? '' : 'shadow-[var(--shadow-sheet)]'
  return (
    <Tag
      className={clsx(
        'relative',
        TONE_CLASS[tone],
        shadow,
        'border border-[color:rgba(0,95,115,0.14)]',
        'rounded-[var(--radius-cut)]',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Inset application panel. */
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
