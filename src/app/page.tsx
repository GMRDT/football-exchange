import { getTranslations } from 'next-intl/server'

export default async function Home() {
  const t = await getTranslations('common')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">{t('appName')}</h1>
      <p className="text-lg text-gray-500">{t('tagline')}</p>
    </main>
  )
}
