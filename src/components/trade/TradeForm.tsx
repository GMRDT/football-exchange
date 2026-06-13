'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useLocale, useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatCoins } from '@/lib/format'

/**
 * TradeForm — the only client-side financial write path, via the trade() RPC
 * exclusively (invariant #1). Client math below is a DISPLAY ESTIMATE only:
 * the server recomputes everything inside the row lock (MARKET_ENGINE.md §3.4)
 * and is authoritative — including live-match spread, which the client cannot
 * detect (always estimates with spread_base).
 */

// Display copies of market_params defaults (MARKET_ENGINE.md §5/§6). The RPC
// enforces the live values; these only power the estimate + inline errors.
const SPREAD_BASE = 0.01
const MAX_ORDER_SIZE = 500
const MAX_POSITION_COST = 20_000

const tradeSuccessSchema = z.object({
  ok: z.literal(true),
  trade_id: z.string(),
  execution_price: z.string(),
  shares: z.string(),
  gross: z.string(),
  fee: z.string(),
  net: z.string(),
  new_balance: z.string(),
  new_price: z.string(),
})

const tradeErrorSchema = z.object({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
})

const tradeResultSchema = z.discriminatedUnion('ok', [tradeSuccessSchema, tradeErrorSchema])

type TradeResult = z.infer<typeof tradeResultSchema>
type Side = 'buy' | 'sell'

// RPC error codes (ARCHITECTURE.md) → errors.* dictionary keys.
const ERROR_KEYS: Record<string, string> = {
  unauthorized: 'unauthorized',
  invalid_input: 'invalidInput',
  trading_paused: 'tradingPaused',
  player_not_found: 'playerNotFound',
  rate_limited: 'rateLimited',
  insufficient_funds: 'insufficientFunds',
  insufficient_shares: 'insufficientShares',
  position_cap: 'positionCap',
  volume_cap: 'volumeCap',
}

export interface TradeFormProps {
  playerId: string
  /** NUMERIC-as-string mid price */
  currentPrice: string
  /** NUMERIC-as-string cash balance of the signed-in user */
  cashBalance: string
  sharesHeld: number
  liquidityTier: string
  /** Parent invalidates SWR caches / refreshes server data */
  onSuccess: () => void
}

export function TradeForm({
  playerId,
  currentPrice,
  cashBalance,
  sharesHeld,
  onSuccess,
}: TradeFormProps) {
  const t = useTranslations('market')
  const tErrors = useTranslations('errors')
  const tCommon = useTranslations('common')
  const ticker = useTranslations('currency')('ticker')
  const locale = useLocale()

  const [side, setSide] = useState<Side>('buy')
  const [shares, setShares] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<TradeResult | null>(null)

  // Stable ref so the success-reset effect doesn't restart when the parent
  // re-creates the callback.
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    if (result?.ok) {
      // Haptic feedback on trade success — runtime feature-detect (DESIGN.md §4e).
      if ('vibrate' in navigator) navigator.vibrate(10)
      const id = setTimeout(() => {
        setShares('')
        setResult(null)
        onSuccessRef.current()
      }, 2000)
      return () => clearTimeout(id)
    }
  }, [result])

  // ── Estimate (floats: display only, server is authoritative) ──────────────
  const mid = parseFloat(currentPrice)
  const cash = parseFloat(cashBalance)
  const isInteger = /^\d+$/.test(shares)
  const n = isInteger ? parseInt(shares, 10) : 0

  const gross = n * mid
  const fee = n * mid * (SPREAD_BASE / 2)
  const net = side === 'buy' ? gross + fee : gross - fee

  // ── Pre-validation (inline, before any RPC) ────────────────────────────────
  let validationError: string | null = null
  if (shares !== '') {
    if (!isInteger || n <= 0) validationError = tErrors('invalidInput')
    else if (n > MAX_ORDER_SIZE) validationError = t('errorMaxOrder', { max: MAX_ORDER_SIZE })
    else if (side === 'buy' && net > cash) validationError = tErrors('insufficientFunds')
    else if (side === 'buy' && net > MAX_POSITION_COST) validationError = tErrors('positionCap')
    else if (side === 'sell' && n > sharesHeld) validationError = tErrors('insufficientShares')
  }

  const errorMsg = validationError ?? (result && !result.ok ? result.message : null)
  const canSubmit = shares !== '' && validationError === null && !isSubmitting

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) return // re-entrancy guard: no double-submit
    setIsSubmitting(true)
    setResult(null)

    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc('trade', {
      p_player_id: playerId,
      p_side: side,
      p_shares: n,
    })

    if (error) {
      // Transport/permission failure (e.g. 42501 for anon) — RPC body unreached.
      setResult({
        ok: false,
        code: 'transport',
        message: error.code === '42501' ? tErrors('unauthorized') : tCommon('error'),
      })
      setIsSubmitting(false)
      return
    }

    const parsed = tradeResultSchema.safeParse(data)
    if (!parsed.success) {
      setResult({ ok: false, code: 'malformed', message: tCommon('error') })
    } else if (!parsed.data.ok) {
      const key = ERROR_KEYS[parsed.data.code]
      setResult({
        ...parsed.data,
        // Dictionary message; never surface the raw server string.
        message: key ? tErrors(key) : tCommon('error'),
      })
    } else {
      setResult(parsed.data)
    }
    setIsSubmitting(false)
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (result?.ok) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-2 flex h-10 w-10 animate-scale-in items-center justify-center rounded-full bg-up-soft text-xl text-up"
        >
          ✓
        </div>
        <p className="text-[16px] font-semibold text-text">
          {side === 'buy' ? t('bought') : t('sold')}
        </p>
        <p className="mt-1 text-[13px] text-text-muted">
          {t('executionPrice')}: {t('coins', { amount: formatCoins(result.execution_price, locale), ticker })}
        </p>
        <p className="text-[13px] text-text-muted">
          {t('newBalance')}: {t('coins', { amount: formatCoins(result.new_balance, locale), ticker })}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      {/* Sliding Buy/Sell toggle (DESIGN.md §4d): indicator slides via transform */}
      <div className="relative flex h-11 select-none rounded-xl bg-bg p-0.5" role="group">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-primary transition-transform duration-150"
          style={{ transform: side === 'sell' ? 'translateX(100%)' : 'translateX(0)' }}
        />
        <button
          type="button"
          onClick={() => setSide('buy')}
          aria-pressed={side === 'buy'}
          className={`relative z-10 h-full flex-1 rounded-lg text-[15px] font-semibold transition-colors duration-150 ${
            side === 'buy' ? 'text-white' : 'text-text-muted'
          }`}
        >
          {t('buy')}
        </button>
        <button
          type="button"
          onClick={() => setSide('sell')}
          aria-pressed={side === 'sell'}
          className={`relative z-10 h-full flex-1 rounded-lg text-[15px] font-semibold transition-colors duration-150 ${
            side === 'sell' ? 'text-white' : 'text-text-muted'
          }`}
        >
          {t('sell')}
        </button>
      </div>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={shares}
        onChange={(e) => setShares(e.target.value)}
        placeholder={t('shares')}
        className="mt-3 h-11 w-full rounded-xl border border-border bg-bg px-4 text-[15px] text-text tabular-nums placeholder:text-text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {/* Live estimate */}
      {n > 0 && (
        <dl className="mt-3 space-y-1 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-text-muted">
              {side === 'buy' ? t('estimatedCost') : t('estimatedProceeds')}
            </dt>
            <dd className="tnum font-semibold text-text">
              {t('coins', { amount: formatCoins(net, locale), ticker })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">{t('fee')}</dt>
            <dd className="tnum text-text-muted">
              {t('coins', { amount: formatCoins(fee, locale), ticker })}
            </dd>
          </div>
        </dl>
      )}

      {/* Error message: key restarts slide-down animation on each new error */}
      {errorMsg && (
        <p
          key={errorMsg}
          className="mt-3 animate-slide-down-in rounded-lg bg-down-soft px-3 py-2 text-[13px] text-down"
        >
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-4 h-11 w-full select-none rounded-xl bg-primary text-[15px] font-semibold text-white transition hover:bg-primary-pressed active:scale-[0.98] active:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '…' : side === 'buy' ? t('buy') : t('sell')}
      </button>
    </div>
  )
}
