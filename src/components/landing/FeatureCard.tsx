import type { ReactNode } from 'react'

/**
 * FeatureCard — landing "why it's fun" card (ROBINHOOD_ANALYSIS §6): icon badge +
 * Manrope title + one supporting line. Hover lifts slightly for life on desktop
 * (DESIGN.md §6 spirit). Icon badge uses the brand primary — never green/red,
 * which belong to price movement only (DESIGN.md §2 golden rule).
 */
export function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode
  title: string
  body: string
}) {
  return (
    <div className="group h-full rounded-2xl border border-border bg-surface p-5 shadow-sm shadow-black/[0.03] transition duration-200 hover:-translate-y-0.5 hover:border-text-muted/30 hover:shadow-lg hover:shadow-black/[0.05]">
      <div
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105"
      >
        {icon}
      </div>
      <h3 className="mt-4 font-display text-[18px] leading-6 font-bold tracking-tight text-text">
        {title}
      </h3>
      <p className="mt-1.5 text-[14px] leading-5 text-pretty text-text-muted">{body}</p>
    </div>
  )
}
