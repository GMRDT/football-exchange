'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (signInError) {
      setError(t('errorInvalidCredentials'))
    } else {
      router.push('/market')
      router.refresh()
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    // navigation handled by OAuth redirect; no setLoading(false) needed
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignIn()
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-sm">
        <h1 className="font-display text-[28px] leading-8 font-bold text-text mb-8">
          {t('loginTitle')}
        </h1>

        <div className="flex flex-col gap-3">
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
            autoComplete="current-password"
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
            onClick={handleSignIn}
            disabled={loading || !email || !password}
            className="h-11 rounded-xl bg-primary text-white font-semibold text-[15px] hover:bg-primary-pressed active:bg-primary-pressed transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '…' : t('loginButton')}
          </button>
        </div>

        <div className="my-5 flex items-center gap-3">
          <hr className="flex-1 border-border" />
          <span className="text-[13px] text-text-muted">{t('orContinueWith')}</span>
          <hr className="flex-1 border-border" />
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full h-11 rounded-xl border border-border bg-surface text-text font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-bg transition disabled:opacity-50"
        >
          <GoogleIcon />
          {t('continueWithGoogle')}
        </button>

        <p className="mt-6 text-center text-[13px] text-text-muted">
          {t('noAccount')}{' '}
          <Link href="/signup" className="text-primary font-semibold hover:underline">
            {t('signUpLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  )
}
