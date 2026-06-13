import type { Metadata, Viewport } from 'next'
import { Inter, Manrope } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://golcap.io'),
  title: 'Golcap',
  description: 'Trade virtual football player shares. World Cup 2026.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Golcap',
    description: 'Trade virtual football player shares. World Cup 2026.',
    url: 'https://golcap.io',
    siteName: 'Golcap',
    type: 'website',
  },
}

// The app is request-dynamic by nature: locale comes from a cookie (src/i18n/request.ts
// reads cookies()/headers()) and auth is per-request. Forcing dynamic also keeps Next from
// statically prerendering client pages at build — the phase where the @serwist/next webpack
// plugin corrupts the server module graph on Next 15.5 (TypeError: a[d] is not a function).
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#FAFAF9',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${manrope.variable}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
