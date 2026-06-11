import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

const SUPPORTED_LOCALES = ['en', 'es'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

function resolveLocale(cookieLocale?: string, acceptLanguage?: string): Locale {
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale

  if (acceptLanguage) {
    // "es-CO,es;q=0.9,en;q=0.8" → "es"
    const primary = acceptLanguage.split(',')[0].split(';')[0].split('-')[0].toLowerCase()
    if (isLocale(primary)) return primary
  }

  return 'en'
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])

  const locale = resolveLocale(
    cookieStore.get('NEXT_LOCALE')?.value,
    headerStore.get('accept-language') ?? undefined
  )

  const messages =
    locale === 'es'
      ? (await import('../../messages/es.json')).default
      : (await import('../../messages/en.json')).default

  return { locale, messages }
})
