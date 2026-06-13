import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
})

// Supabase origin derived from env so connect-src works for both the local stack
// (http://127.0.0.1:54321 → ws://…) and production (https://<ref>.supabase.co → wss://…).
// Without the explicit origin, local-dev browser→Supabase calls are CSP-blocked.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws') // http→ws, https→wss

const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseWsOrigin,
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://challenges.cloudflare.com',
]
  .filter(Boolean)
  .join(' ')

// CSP: 'unsafe-eval' intentionally omitted — Next.js 15 doesn't require it in
// production. If a dependency ever needs eval, the fix is nonces/hashes (F5).
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src ${connectSrc}`,
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default withSerwist(withNextIntl(nextConfig))
