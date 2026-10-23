import Link from 'next/link'
import { clsx } from 'clsx'

/**
 * Controls (DESIGN.md §9).
 *
 * Three button variants, each a physical behaviour: `raised` (a dyed sheet that lifts on hover and
 * is pushed in on press), `press` (already recessed — a toggle), `flat` (line work only).
 */

export type AccentTone = 'teal' | 'rose' | 'terracotta' | 'olive' | 'plum' | 'frost' | 'kraft' | 'ivory'

const ACCENT_SOLID: Record<AccentTone, string> = {
  teal: 'bg-teal text-paper-ivory border-[color:rgba(12,74,87,0.2)]',
  rose: 'bg-rose text-paper-ivory border-[color:rgba(12,74,87,0.2)]',
  terracotta: 'bg-terracotta text-ink border-[color:rgba(12,74,87,0.2)]',
  olive: 'bg-olive-light text-ink border-[color:rgba(12,74,87,0.2)]',
  plum: 'bg-plum text-paper-ivory border-[color:rgba(12,74,87,0.2)]',
  frost: 'bg-frost-light text-ink border-[color:rgba(12,74,87,0.2)]',
  kraft: 'bg-paper-kraft text-ink border-[color:rgba(12,74,87,0.22)]',
  ivory: 'bg-paper-ivory text-ink border-[color:rgba(12,74,87,0.18)]',
}

const CHIP_TONE: Record<AccentTone, string> = {
  teal: 'bg-teal-light text-teal-deep',
  rose: 'bg-rose-light text-rose-deep',
  terracotta: 'bg-terracotta-light text-terracotta-deep',
  olive: 'bg-olive-light text-olive-deep',
  plum: 'bg-plum-light text-plum-deep',
  frost: 'bg-frost-light text-frost-deep',
  kraft: 'bg-paper-kraft text-ink-soft',
  ivory: 'bg-paper-ivory text-ink-soft',
}

export function PaperButton({
  variant = 'raised',
  tone = 'ivory',
  size = 'md',
  active = false,
  className,
  children,
  ...rest
}: {
  variant?: 'raised' | 'press' | 'flat'
  tone?: AccentTone
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  className?: string
  children?: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3.5 py-1.5 text-sm gap-2',
    lg: 'px-5 py-2.5 text-[15px] gap-2',
  }[size]

  const base =
    'paper-fibre inline-flex select-none items-center justify-center rounded-[var(--radius-cut-sm)] border font-semibold transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-paper)] disabled:cursor-not-allowed disabled:opacity-45'

  const byVariant =
    variant === 'raised'
      ? clsx(
          ACCENT_SOLID[tone],
          'shadow-[var(--shadow-tile)] hover:-translate-y-px hover:shadow-[var(--shadow-lift)] active:translate-y-px active:shadow-[var(--shadow-press)]',
        )
      : variant === 'press'
        ? clsx(
            'shadow-[var(--shadow-press)] border-[color:rgba(12,74,87,0.18)]',
            active ? ACCENT_SOLID[tone] : 'bg-paper-sand text-ink-soft hover:bg-paper-kraft',
          )
        : clsx(
            'border-transparent bg-transparent text-ink-soft hover:bg-paper-sand/70 hover:text-ink',
            active && 'bg-paper-sand text-ink',
          )

  return (
    <button type="button" className={clsx(base, sizes, byVariant, className)} {...rest}>
      {children}
    </button>
  )
}

/**
 * A link that looks like a paper button.
 *
 * Rendered as a real `<a>` rather than a `<button>` inside a link: nesting interactive elements
 * breaks keyboard order and screen-reader semantics (RULES.md §10).
 */
export function PaperLink({
  href,
  variant = 'raised',
  tone = 'ivory',
  size = 'md',
  className,
  children,
  ...rest
}: {
  href: string
  variant?: 'raised' | 'press' | 'flat'
  tone?: AccentTone
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children?: React.ReactNode
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const sizes = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3.5 py-1.5 text-sm gap-2',
    lg: 'px-5 py-2.5 text-[15px] gap-2',
  }[size]
  const byVariant =
    variant === 'raised'
      ? clsx(
          ACCENT_SOLID[tone],
          'shadow-[var(--shadow-tile)] hover:-translate-y-px hover:shadow-[var(--shadow-lift)] active:translate-y-px active:shadow-[var(--shadow-press)]',
        )
      : variant === 'press'
        ? 'bg-paper-sand text-ink-soft shadow-[var(--shadow-press)] hover:bg-paper-kraft'
        : 'border-transparent bg-transparent text-ink-soft hover:bg-paper-sand/70 hover:text-ink'
  return (
    <Link
      href={href}
      className={clsx(
        'paper-fibre inline-flex select-none items-center justify-center rounded-[var(--radius-cut-sm)] border font-semibold transition-[transform,box-shadow,background-color] duration-150 ease-[var(--ease-paper)]',
        sizes,
        byVariant,
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  )
}

export function PaperChip({
  tone = 'kraft',
  icon,
  className,
  children,
  title,
}: {
  tone?: AccentTone
  icon?: React.ReactNode
  className?: string
  children?: React.ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={clsx(
        'paper-fibre inline-flex items-center gap-1 rounded-[var(--radius-cut-xs)] border border-[color:rgba(12,74,87,0.12)] px-1.5 py-[3px] text-[11px] font-bold leading-none tracking-[0.01em]',
        CHIP_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function PaperInput({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      className={clsx(
        // `paper-field`, not `w-full`: see the note in globals.css — `w-full` here makes every
        // caller's width override dead code.
        'paper-well paper-field rounded-[var(--radius-cut-xs)] px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint',
        'bg-paper-ivory focus:bg-paper-ivory transition-colors',
        'focus-visible:outline-2 focus-visible:outline-teal-deep',
        className,
      )}
      {...rest}
    />
  )
}

export function PaperTextarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  return (
    <textarea
      className={clsx(
        'paper-well paper-field resize-y rounded-[var(--radius-well)] px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint',
        'bg-paper-ivory',
        className,
      )}
      {...rest}
    />
  )
}

export function PaperLabel({ className, children, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={clsx('mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint', className)} {...rest}>
      {children}
    </label>
  )
}

export function PaperTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: React.ReactNode; badge?: number }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={clsx('paper-well flex items-end gap-1 p-1', className)}>
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={clsx(
              'paper-fibre relative flex items-center gap-1.5 rounded-[var(--radius-cut-xs)] px-2.5 py-1.5 text-xs font-bold transition-all duration-150 ease-[var(--ease-paper)]',
              active
                ? 'bg-paper-ivory text-ink shadow-[var(--shadow-tile)]'
                : 'text-ink-faint hover:bg-paper-ivory/50 hover:text-ink-soft',
            )}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 ? (
              <span className="tnum rounded-full bg-rose-light px-1.5 text-[10px] font-bold text-rose-deep">{tab.badge}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function PaperToggle({
  checked,
  onChange,
  label,
  tone = 'teal',
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  tone?: AccentTone
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'paper-fibre relative h-[22px] w-[42px] shrink-0 rounded-full border border-[color:rgba(12,74,87,0.2)] transition-colors duration-200',
        checked ? ACCENT_SOLID[tone] : 'bg-paper-kraft',
        checked ? 'shadow-[var(--shadow-press)]' : 'shadow-[var(--shadow-tile)]',
        disabled && 'opacity-45',
      )}
    >
      <span
        className={clsx(
          'absolute top-[2px] h-[16px] w-[16px] rounded-full bg-paper-ivory shadow-[var(--shadow-tile)] transition-all duration-200 ease-[var(--ease-paper)]',
          checked ? 'left-[23px]' : 'left-[2px]',
        )}
      />
    </button>
  )
}

export function PaperSelect({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <select
      className={clsx(
        'paper-well paper-field appearance-none rounded-[var(--radius-cut-xs)] bg-paper-ivory px-2.5 py-1.5 text-sm text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}
