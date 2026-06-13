/**
 * Typed SWR key factories. Keys double as fetch URLs when a real API route
 * exists (marketKey); logical keys (playerKey) are used for cache
 * invalidation only.
 */
export const marketKey = () => '/api/market' as const

export const playerKey = (id: string) => `player:${id}` as const

export const portfolioKey = () => '/api/portfolio' as const

export const leaderboardKey = () => '/api/leaderboard' as const
