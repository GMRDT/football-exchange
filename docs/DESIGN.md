# Football Exchange — Design System & UX Direction

**Status:** approved by founder (Jun 12). This document is mandatory reading for every
F4 session, alongside CLAUDE.md. If a UI decision is not covered here, derive it from
the thesis and rules below — do not invent a parallel style.

**Thesis:** *Robinhood's clarity with football's heart — a market that is understood
in 5 seconds and feels like a game, not a casino and not a trading terminal.*

---

## 1. The 5 confusion risks (every UI decision defends against these)

1. **"Is this a betting site?"** → light mode, zero countdowns, zero odds-speak, the
   words **free** and **virtual** visible from the landing. Red only ever means
   "price went down", never urgency.
2. **"Is this fantasy football?"** → strict vocabulary: **Portfolio** never "team",
   **players** never "squad/lineup". No gameweeks, no deadlines, no captains anywhere.
3. **"Is this crypto?"** → simple line charts only (candlesticks prohibited), light
   mode, subtle price transitions — no neon flicker.
4. **"Why did the price move? Looks random."** → Activity Feed lines always connect
   cause → effect ("⚽ Mbappé scored → +6.2%"). Player Detail has a "Why it moved
   today" section.
5. **"I have 100,000 coins and 200 players… now what?"** → Market opens sorted by
   Top Movers; empty portfolio shows 3 hot players + CTA; onboarding ends in an
   action, not a paragraph.

---

## 2. Color tokens

Define in `globals.css` / Tailwind theme. **Never use raw hex in components.**

| Token | HEX | Usage |
|---|---|---|
| `primary` | `#2D5BFF` | Primary buttons, links, active nav, brand accents |
| `primary-pressed` | `#1E44D9` | Hover/pressed states of primary |
| `up` | `#16A34A` | Price up, positive P&L, trade confirmations |
| `up-soft` | `#F0FDF4` | Background of positive badges/chips |
| `down` | `#DC2626` | Price down, negative P&L, errors |
| `down-soft` | `#FEF2F2` | Background of negative badges/chips |
| `gold` | `#F59E0B` | Leaderboard top-3, badges, celebration accents |
| `warning` | `#D97706` | Notices (e.g. "live match — spread 2.5%") |
| `bg` | `#FAFAF9` | App background (warm stone, not clinical white) |
| `surface` | `#FFFFFF` | Cards, sheets, modals |
| `border` | `#E7E5E4` | Borders and dividers |
| `text` | `#1C1917` | Primary text |
| `text-muted` | `#78716C` | Secondary text, labels |

**Golden rule:** green and red belong to price movement exclusively. If a green
element does not represent a price going up (or a confirmed trade), it is wrong.

**Mode:** light only in MVP. Dark mode is 🟡 post-launch. Do not add dark: variants.

## 3. Typography

**Manrope** (display) + **Inter** (UI/body/data). Load via `next/font/google`,
variable, `latin` subset.

| Role | Face/weight | Size/line | Usage |
|---|---|---|---|
| Display XL | Manrope 800 | 40/44 | Hero price in Player Detail |
| Display | Manrope 700 | 28/32 | Screen h1 |
| Title | Manrope 700 | 20/28 | h2, player name in detail |
| Body | Inter 400 | 16/24 | General text |
| Body strong | Inter 600 | 16/24 | Names in lists, emphasis |
| Data | Inter 600 | 15/20 + `tabular-nums` | Prices in lists/tables |
| Caption | Inter 500 | 13/16 | Labels, metadata |

Manrope appears **only** in headings and the hero price. Everything else is Inter.
All price columns use `tabular-nums` (digits must not jitter on update).

## 4. Signature components (build before any screen)

These are the atoms. Build them first in `src/components/ui/`, then compose screens.

- **`KitAvatar`** — vertical rounded rectangle evoking a jersey: two stripes using the
  team's `avatar_colors` + player initials in white. Sizes: sm 32px (lists), md 40px
  (cards), lg 72px (detail). This is the legal substitute for photos and the product's
  visual signature.
- **`PlayerCard`** — the product's atom (Market list, Portfolio, Top Movers):
  ```
  ┌──────────────────────────────────────────┐
  │ ▐█▌  Kylian Mbappé          12,450  ▲4.2%│
  │ ▐█▌  France · FWD                        │
  └──────────────────────────────────────────┘
  ```
- **`PriceChange`** — renders arrow + signed % + semantic color + soft background.
  Accepts a NUMERIC string; never `parseFloat` for display. Used everywhere a change
  is shown — the only component allowed to paint green/red.
- **`TradeSheet`** — bottom sheet (mobile) / sticky right panel (desktop ≥1024px).
  Quantity input + quick amounts [1][5][10][Max], exec price incl. spread, total,
  remaining cash, single confirm button. All typed RPC error codes map to friendly
  dictionary messages inside the sheet.
- **`EmptyState`** — icon + one sentence + one CTA. An empty screen is an invitation
  to act, never a dead end.
- **`SkeletonRow`** — skeletons for every list load. Full-screen spinners prohibited;
  button-level spinners only for actions.

## 5. Charts

Line + soft gradient fill underneath. **Line color = sign of the selected period**
(green if up, red if down). Periods: `24H · 7D · Tournament`. Minimal axes: start/end
price, high/low as discrete points. Candlesticks are prohibited.

**Fair value is progressive disclosure:** hidden by default; a "Show fair value" chip
overlays a dotted gray line. Do not surface it in onboarding or default views.

## 6. Microinteractions (exactly these three)

1. **Price pulse:** on polling update, number transitions smoothly and its background
   flashes 400ms in `up-soft`/`down-soft`.
2. **Trade confirmed:** simple animated check + the new position appears. No confetti.
3. **Skeletons** on every list load.

Respect `prefers-reduced-motion` in all animation.

## 7. Voice & microcopy

Tone: a friend who knows football — not a bank, not a croupier. Plain verbs, sentence
case, no unexplained financial jargon. All strings live in `messages/en.json` +
`messages/es.json` (key parity enforced by test).

| Concept | EN | ES | Never |
|---|---|---|---|
| Buy action | Buy | Comprar | Trade, Stake, Bet |
| Player set | Portfolio | Portafolio | Team, Squad, Lineup |
| Currency | FX Coins | FX Coins | $, USD, money |
| Movement | +4.2% today | +4.2% hoy | "WIN NOW!" |
| Balance | Cash | Efectivo | Available to bet |

Errors explain what happened and how to fix it; they don't apologize and are never
vague. Button label = resulting toast verb ("Buy" → "Bought").

## 8. Navigation & responsive

- **Mobile (<768):** bottom nav, 3 tabs — Market · Portfolio · Leaderboard (per spec).
  Activity = bell icon in header with unread badge. Header: logo left, `Cash: 87,550 FX`
  center-right, bell right.
- **Desktop (≥1024):** bottom nav dies; horizontal top nav: logo · Market · Portfolio ·
  Leaderboard · [spacer] · Cash · bell · avatar. Content `max-width: 1120px` centered.
  Market table gains columns (7D, sparkline). Player Detail becomes 2 columns:
  left 60% (header/chart/events/stats), right 40% sticky TradeSheet.
- **Tablet (768–1023):** mobile layout, lists in 2-col grid. No special work.

**Public vs. authed (product decision, approved):** RLS already allows anonymous reads
of players, prices, leaderboard. Therefore:

- **Public (read-only):** `/`, `/login`, `/signup`, `/auth/callback`, `/market`,
  `/player/*`, `/leaderboard`
- **Auth required:** `/portfolio`, `/activity`
- Tapping **Buy/Sell** (or the bell) without a session opens a contextual signup sheet:
  "Create your free account and get 100,000 FX Coins". Trade protection lives in the
  component + RPC (server enforces auth regardless), not in middleware.

The landing's Top Movers block uses **live anonymous reads** — the best possible demo.

## 9. Onboarding: 60 seconds to first buy

```
0s   Landing: headline + live market block
10s  "Start free" → Google OAuth 1-tap (or email)
20s  2 explainer cards (skippable):
     Card 1 "100,000 FX Coins for you" — virtual coins, not real money,
            buy & sell anytime — no lineups, no gameweeks.
     Card 2 "The pitch moves the prices" — goals, cards and eliminations
            move value; so do buyers and sellers. Buy low, sell high.
35s  Lands on Market sorted by Top Movers + single tooltip:
     "Tap a player to buy"
45s  Player Detail → [Buy] → sheet: quantity → confirm
60s  ✓ Position created. Hint: "Track it in your Portfolio"
```

Each step has exactly one primary action. Nothing requires reading more than two
sentences.

## 10. Screen wireframes (reference)

### Landing (public, minimal)
What a user must grasp in 5 seconds: *a World Cup player market, virtual money, free,
and I can see it right now.*
```
┌─────────────────────────────────────────────┐
│  ⚽ Football Exchange          [Sign in]     │
├─────────────────────────────────────────────┤
│   The World Cup 2026 player market          │
│   Buy and sell the stars with 100,000       │
│   fully virtual coins. Prices live the      │
│   matches in real time.                     │
│   [ Start free ]   [ See the market ]       │
│   ┌─────────────────────────────────┐       │
│   │  TOP MOVERS NOW (live data)     │       │
│   │  ▐█▌ Mbappé      12,450  ▲4.2%  │       │
│   │  ▐█▌ Bellingham   9,800  ▲2.8%  │       │
│   │  ▐█▌ Son          5,100  ▼3.1%  │       │
│   └─────────────────────────────────┘       │
│   How it works: 1 Get 100,000 FX →          │
│   2 Buy players → 3 Climb the ranking       │
└─────────────────────────────────────────────┘
```

### Market — mobile
```
┌─────────────────────────────────┐
│ ⚽ FX        Cash: 100,000   🔔  │
│ 🔍 Search player or team        │
│ TOP MOVERS TODAY                │
│ [▐█▌Mbp ▲4.2%][▐█▌Bel ▲2.8%] →  │
│ ALL · [Team ▾] [Pos ▾]          │
│ ▐█▌ K. Mbappé     12,450 ▲4.2%  │
│     France · FWD                │
│ ▐█▌ J. Bellingham  9,800 ▲2.8%  │
│     England · MID               │
│        (infinite scroll)        │
│  Market   Portfolio   Ranking   │
└─────────────────────────────────┘
```

### Market — desktop (≥1024)
```
│ ⚽ FX  Market Portfolio Ranking      Cash: 100,000  🔔 (G) │
│ TOP MOVERS TODAY: [cards row]                              │
│ 🔍 Search   [Team ▾][Pos ▾]            Sort: % today ▾     │
│ Player        Team     Pos  Price    Today    7D    24h    │
│ ▐█▌ Mbappé    France   FWD  12,450  ▲4.2%  ▲9.1%  ╱╲╱     │
```

### Player Detail + Trade — mobile
Buy/Sell are **not separate screens**: a bottom sheet over the detail. Context never
lost. Desktop: 2 columns, right TradeSheet sticky.
```
│ ←  Kylian Mbappé            🔔  │   Sheet on [Buy]:
│    ▐█▌ France · Forward         │   │ Buy Mbappé              │
│    12,450 FX   ▲ +4.2% today    │   │ Quantity: [5] shares    │
│    ╱╲  ╱╲╱╲ line chart          │   │ [1][5][10][Max]         │
│    24H · 7D · Tournament        │   │ Price/share 12,512 FX   │
│    [○ Show fair value]          │   │ (includes 1% spread)    │
│ ⚠ Live match — spread 2.5%      │   │ Total      62,560 FX    │
│ WHY IT MOVED TODAY              │   │ Cash left  37,440 FX    │
│ ⚽ Goal (62') .......... +6.0%  │   │ [   Confirm buy   ]     │
│ 📊 Market .............. −1.8%  │
│ YOUR POSITION / STATS / NEXT    │
│ [ Buy ]          [ Sell ]       │
```

### Portfolio — mobile
```
│ Your portfolio              🔔  │
│ 112,300 FX        ▲ +12.3%      │
│ total value        return       │
│ Cash: 37,440      [Share 📤]    │
│ YOUR PLAYERS (3)                │
│ ▐█▌ Mbappé  5 sh  62,250        │
│     P&L: ▲ +1,940 (+3.2%)       │

Empty: "Your portfolio is empty." + 3 hot player mini-cards
       + [ Explore the market → ]
```

### Leaderboard
```
│ Ranking          [Global|Leagues]│
│ 🥇 1  @juanfut      ▲ +48.2%     │   gold tokens live here
│ 🥈 2  @mati_10      ▲ +41.7%     │
│ ── you ─────────────────────     │   your row always visible,
│ 🔵 87 @george       ▲ +12.3%     │   sticky, primary highlight
│ [ + Create private league ]      │
│ [ Join with code ]               │
```
Ranked by % return (ADR-007).

### Activity Feed (bell)
```
│ ← Activity                      │
│ TODAY                           │
│ ⚽ Mbappé scored (62')          │
│    Price: ▲ +6.0% · 8 min ago   │
│ 🟥 Red card for Casemiro        │
│    Price: ▼ −11.2% · 1 h ago    │

Empty: "Here you'll see everything that happens to YOUR players —
goals, cards, ups and downs." + [ Explore the market → ]
```
Every item connects **event → price effect** (kills risk #4).

---

## 11. Operational rules for every F4 session

1. Color and type tokens in Tailwind theme / `globals.css` — never raw hex in components.
2. Build signature components (§4) before composing screens.
3. Green/red only via `PriceChange` or `up`/`down` tokens.
4. Every visible string from `messages/en.json` + `messages/es.json` (key parity test).
5. Prices: `tabular-nums`, `Intl.NumberFormat` with active locale, sourced from NUMERIC
   strings — never `parseFloat` for display.
6. Charts: line + gradient fill, color = period sign. No candlesticks.
7. Breakpoints: mobile base → `md:` 2-col grids → `lg:` top nav + extended tables +
   2-col Player Detail.
8. Skeletons on lists; spinners only inside buttons.
9. `prefers-reduced-motion` respected.
10. Read this doc + the frontend-design skill before building any new UI.
