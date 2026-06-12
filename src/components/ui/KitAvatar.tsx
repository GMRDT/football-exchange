import type { Json } from '@/lib/supabase/types'

/**
 * KitAvatar — the product's visual signature (DESIGN.md §4): a vertical
 * rounded rectangle evoking a jersey, two side stripes in the team's
 * secondary color over the primary color, player initials in white.
 * The legal substitute for player photos — never replace with images.
 *
 * avatar_colors is jsonb seeded from teams.colors: { primary, secondary }
 * hex strings. Unknown/missing shape falls back to neutral tokens.
 */

type KitSize = 'sm' | 'md' | 'lg'

// height-driven jersey proportions (~3:4), per DESIGN.md sizes sm 32 / md 40 / lg 72
const SIZES: Record<KitSize, { w: number; h: number; text: string; radius: string }> = {
  sm: { w: 24, h: 32, text: 'text-[10px]', radius: 'rounded-md' },
  md: { w: 30, h: 40, text: 'text-[12px]', radius: 'rounded-lg' },
  lg: { w: 54, h: 72, text: 'text-[20px]', radius: 'rounded-xl' },
}

function parseColors(colors: Json | null | undefined): { primary: string; secondary: string } | null {
  if (
    colors !== null &&
    typeof colors === 'object' &&
    !Array.isArray(colors) &&
    typeof colors.primary === 'string' &&
    typeof colors.secondary === 'string'
  ) {
    return { primary: colors.primary, secondary: colors.secondary }
  }
  return null
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export function KitAvatar({
  colors,
  fullName,
  size = 'md',
}: {
  colors: Json | null | undefined
  fullName: string
  size?: KitSize
}) {
  const s = SIZES[size]
  const parsed = parseColors(colors)
  // Stripes: secondary | primary | secondary — the ▐█▌ jersey from DESIGN.md.
  // Fallback uses neutral tokens (no raw hex in components for design colors;
  // parsed values are data, not design tokens, so inline style is correct).
  const primary = parsed?.primary ?? 'var(--color-text-muted)'
  const secondary = parsed?.secondary ?? 'var(--color-border)'

  return (
    <span
      aria-hidden="true"
      className={`${s.radius} ${s.text} inline-flex shrink-0 items-center justify-center font-semibold text-white select-none`}
      style={{
        width: s.w,
        height: s.h,
        background: `linear-gradient(90deg, ${secondary} 0 18%, ${primary} 18% 82%, ${secondary} 82% 100%)`,
        textShadow: '0 1px 2px rgb(0 0 0 / 0.45)',
      }}
    >
      {initials(fullName)}
    </span>
  )
}
