import Link from 'next/link'

/**
 * EmptyState (DESIGN.md §4): icon + one sentence + optional CTA.
 * An empty screen is an invitation to act, never a dead end.
 */
export function EmptyState({
  icon,
  message,
  ctaLabel,
  ctaHref,
}: {
  icon: string
  message: string
  ctaLabel?: string
  ctaHref?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span aria-hidden="true" className="text-[48px] leading-none">
        {icon}
      </span>
      <p className="text-[15px] leading-6 text-text-muted">{message}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-[15px] font-semibold text-white transition hover:bg-primary-pressed active:bg-primary-pressed"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
