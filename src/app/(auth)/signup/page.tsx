'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/

type Stage = 'form' | 'check-email'

export default function SignupPage() {
  const t = useTranslations('auth')

  const [stage, setStage] = useState<Stage>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validateUsername(value: string): boolean {
    return USERNAME_REGEX.test(value)
  }

  async function handleSignUp() {
    setError(null)

    if (!validateUsername(username)) {
      setError(t('errorInvalidUsername'))
      return
    }

    setLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)

    if (signUpError) {
      setError(t('errorGeneric'))
    } else {
      setStage('check-email')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignUp()
  }

  if (stage === 'check-email') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-sm text-center">
          <div className="text-4xl mb-4">✉️</div>
          <h1 className="font-display text-[28px] leading-8 font-bold text-text mb-3">
            {t('checkEmailTitle')}
          </h1>
          <p className="text-[15px] text-text-muted leading-6">
            {t('checkEmailBody', { email })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-sm">
        <h1 className="font-display text-[28px] leading-8 font-bold text-text mb-8">
          {t('signupTitle')}
        </h1>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <input
              type="text"
              autoComplete="username"
              placeholder={t('username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
              className="w-full h-11 px-4 rounded-xl border border-border bg-bg text-text placeholder:text-text-muted text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            />
            <p className="text-[12px] text-text-muted px-1">{t('usernameHint')}</p>
          </div>

          <input
            type="email"
            autoComplete="email"
            placeholder={t('email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-11 px-4 rounded-xl border border-border bg-bg text-text placeholder:text-text-muted text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
          />

          <input
            type="password"
            autoComplete="new-password"
            placeholder={t('password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-11 px-4 rounded-xl border border-border bg-bg text-text placeholder:text-text-muted text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
          />

          {error && (
            <p className="text-[13px] text-down bg-down-soft rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleSignUp}
            disabled={loading || !email || !password || !username}
            className="h-11 rounded-xl bg-primary text-white font-semibold text-[15px] hover:bg-primary-pressed active:bg-primary-pressed transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '…' : t('signupButton')}
          </button>
        </div>

        <p className="mt-6 text-center text-[13px] text-text-muted">
          {t('hasAccount')}{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            {t('loginLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
