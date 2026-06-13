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
