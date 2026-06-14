'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Reveal — scroll-triggered entrance (DESIGN.md §6 motion, ROBINHOOD_ANALYSIS §5).
 * Wraps content that should fade + slide up the first time it enters the viewport.
 * The `.reveal` base style lives in globals.css; this component only adds the
 * `is-visible` class once via IntersectionObserver, then disconnects.
 *
 * Safety: prefers-reduced-motion users are revealed immediately (no observer),
 * and a <noscript> rule in the root layout forces visibility without JS — content
 * is never permanently hidden.
 *
 * Stagger sibling reveals by passing increasing `delay` values (ms).
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-visible')
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-visible')
            io.disconnect()
          }
        }
      },
      // Fire a touch before fully in view so the motion reads as it scrolls up.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
