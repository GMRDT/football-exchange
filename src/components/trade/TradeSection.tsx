'use client'

import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { TradeForm, type TradeFormProps } from '@/components/trade/TradeForm'
import { marketKey, playerKey, portfolioKey } from '@/lib/swr/keys'

/**
 * Client wrapper: a server page can't pass function props, so the SWR/router
 * invalidation after a successful trade lives here.
 */
export function TradeSection(props: Omit<TradeFormProps, 'onSuccess'>) {
  const router = useRouter()
  const { mutate } = useSWRConfig()

  function handleSuccess() {
    void mutate(marketKey())
    void mutate(playerKey(props.playerId))
    void mutate(portfolioKey())
    router.refresh() // refetch the server-rendered price/holding/stats blocks
  }

  return <TradeForm {...props} onSuccess={handleSuccess} />
}
