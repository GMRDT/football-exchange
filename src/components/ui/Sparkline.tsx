import { useId } from 'react'

/**
 * Sparkline — minimal SVG line + soft gradient fill (DESIGN.md §5).
 * No axes, no labels. Line color = sign of the period (last vs first).
 * Flat dashed line when fewer than 2 price points (no error, no null).
 */
export function Sparkline({
  prices,
  width = 320,
  height = 120,
}: {
  prices: number[]
  width?: number
  height?: number
}) {
  const gradientId = useId()

  if (prices.length < 2) {
    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="presentation"
        aria-hidden="true"
      >
        <line
          x1={4}
          y1={height / 2}
          x2={width - 4}
          y2={height / 2}
          stroke="var(--color-border)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>
    )
  }

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pad = 4

  const points = prices.map((price, i) => {
    const x = pad + (i / (prices.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (price - min) / range) * (height - pad * 2)
    return { x, y }
  })

  const line = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPath =
    `M ${points[0].x} ${height - pad}` +
    points.map((p) => ` L ${p.x} ${p.y}`).join('') +
    ` L ${points[points.length - 1].x} ${height - pad} Z`

  const up = prices[prices.length - 1] >= prices[0]
  const color = up ? 'var(--color-up)' : 'var(--color-down)'

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
