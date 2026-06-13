import { useLocale } from 'next-intl'

/**
 * PriceChange — arrow + signed % with semantic color + soft background.
 * The ONLY component allowed to paint green/red (DESIGN.md §2 golden rule):
 * green and red belong to price movement exclusively.
 *
 * `pct` is a computed percentage (not a monetary NUMERIC), so number is fine;
 * formatting still goes through Intl with the active locale.
 */
export function PriceChange({ pct }: { pct: number }) {
  const locale = useLocale()

  const formatted = new Intl.NumberFormat(locale, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(pct)

  const tone =
    pct > 0
      ? 'text-up bg-up-soft'
      : pct < 0
        ? 'text-down bg-down-soft'
        : 'text-text-muted bg-bg'

  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : ''

  return (
    <span
      className={`${tone} inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[13px] leading-4 font-semibold tabular-nums`}
    >
      {arrow && <span aria-hidden="true" className="text-[10px]">{arrow}</span>}
      {formatted}%
    </span>
  )
}
