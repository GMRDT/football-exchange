'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly animates a number from its previous value to `target` using rAF.
 * Respects prefers-reduced-motion — snaps immediately when enabled.
 * ~20 lines max (DESIGN.md §4 spec for hero price count animation).
 */
export function useCountAnimation(target: number, ms = 300): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    const start = from.current
    if (start === target) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Async callback to avoid synchronous setState-in-effect cascade.
      const raf = requestAnimationFrame(() => {
        setValue(target)
        from.current = target
      })
      return () => cancelAnimationFrame(raf)
    }
    let t0: number | null = null
    let raf: number
    const step = (now: number) => {
      if (t0 === null) t0 = now
      const p = Math.min((now - t0) / ms, 1)
      setValue(start + (target - start) * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return value
}
