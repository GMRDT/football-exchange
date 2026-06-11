-- trade() RPC: the ONLY write path for financial tables (invariant #1).
-- Spec: docs/MARKET_ENGINE.md (formulas) + docs/ARCHITECTURE.md (contract).
--
-- Golden rule enforced throughout: ZERO writes before ALL validations pass.
-- Errors return as jsonb {ok:false, code, message} — the transaction has
-- written nothing at that point, so committing is harmless.

-- ── Runtime params: trading switch + rate limit ──────────────────────────────
update public.market_params
set params = params || '{"trading_enabled": true, "rate_limit_trades_per_min": 10}'::jsonb;

-- ── trade() ──────────────────────────────────────────────────────────────────
create or replace function public.trade(
  p_player_id uuid,
  p_side text,
  p_shares numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_params jsonb;
  v_profile public.profiles%rowtype;
  v_player public.players%rowtype;
  -- limits (from market_params)
  v_max_order numeric;
  v_max_position numeric;
  v_max_daily numeric;
  v_min_price numeric;
  v_max_mult numeric;
  v_max_daily_pct numeric;
  v_rate_limit int;
  -- computed amounts
  v_spread numeric;
  v_p_mid numeric;
  v_exec_price numeric;
  v_gross numeric;
  v_fee numeric;
  v_net numeric;
  -- holdings snapshot
  v_held numeric;
  v_avg numeric;
  -- price impact
  v_l numeric;
  v_kd numeric;
  v_delta numeric;
  v_p_new numeric;
  v_ref numeric;
  -- misc
  v_recent_trades int;
  v_daily_volume numeric;
  v_ledger_delta numeric;
  v_new_balance numeric;
  v_trade_id uuid;
begin
  -- 1. Caller identity. service_role calls without a JWT have no uid.
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized',
      'message', 'Authentication required');
  end if;

  -- 2. Normalize BEFORE any arithmetic: the stored columns are NUMERIC(20,6),
  -- so computing with un-rounded input would create micro-differences between
  -- computed and persisted values.
  p_shares := round(p_shares, 6);

  -- Single read of market_params (needed for max_order_size below).
  select params into v_params from public.market_params limit 1;

  v_max_order     := coalesce((v_params -> 'position_limits' ->> 'max_order_size')::numeric, 0);
  v_max_position  := coalesce((v_params -> 'position_limits' ->> 'max_position_cost')::numeric, 0);
  v_max_daily     := coalesce((v_params -> 'position_limits' ->> 'max_daily_volume')::numeric, 0);
  v_min_price     := coalesce((v_params -> 'circuit_breakers' ->> 'min_price')::numeric, 100);
  v_max_mult      := coalesce((v_params -> 'circuit_breakers' ->> 'max_price_multiplier')::numeric, 10);
  v_max_daily_pct := coalesce((v_params -> 'circuit_breakers' ->> 'max_daily_pct')::numeric, 0.5);
  v_rate_limit    := coalesce((v_params ->> 'rate_limit_trades_per_min')::int, 10);

  -- 3. Input validation.
  if p_player_id is null
     or p_side is null or p_side not in ('buy', 'sell')
     or p_shares is null or p_shares <= 0
     or p_shares > v_max_order then
    return jsonb_build_object('ok', false, 'code', 'invalid_input',
      'message', 'Invalid side, shares, or player');
  end if;

  -- 4. Trading switch. Fail-closed: missing row or missing key = paused.
  if not coalesce((v_params ->> 'trading_enabled')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'trading_paused',
      'message', 'Trading is currently paused');
  end if;

  -- 5. Lock profile FIRST — fixed lock order (profile, then player) across
  -- every code path prevents deadlocks between concurrent trades.
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unauthorized',
      'message', 'Profile not found');
  end if;

  -- 6. Lock player second.
  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'player_not_found',
      'message', 'Player not found');
  end if;

  -- 7. Rate limit. Counted under the profile lock, so concurrent trades from
  -- the same user are serialized and the count cannot race.
  select count(*) into v_recent_trades
  from public.trades
  where user_id = v_user
    and created_at > now() - interval '60 seconds';

  if v_recent_trades >= v_rate_limit then
    return jsonb_build_object('ok', false, 'code', 'rate_limited',
      'message', 'Too many trades, slow down');
  end if;

  -- 8. Spread: live-match detection per MARKET_ENGINE.md §3.3.
  if exists (
    select 1 from public.matches m
    where (m.home_team_id = v_player.team_id or m.away_team_id = v_player.team_id)
      and m.status in ('1H', '2H', 'ET', 'P')
      and m.kickoff_utc <= now()
      and m.kickoff_utc >= now() - interval '3 hours'
  ) then
    v_spread := (v_params ->> 'spread_live')::numeric;
  else
    v_spread := (v_params ->> 'spread_base')::numeric;
  end if;

  -- 9. Amounts (MARKET_ENGINE.md §3): everything rounded to 6dp before use.
  -- The fee is a sink — debited from buyers / withheld from sellers and
  -- credited to NO ONE (drains virtual currency, MARKET_ENGINE.md §3.2).
  v_p_mid := v_player.current_price;
  if p_side = 'buy' then
    v_exec_price := round(v_p_mid * (1 + v_spread / 2), 6);
  else
    v_exec_price := round(v_p_mid * (1 - v_spread / 2), 6);
  end if;
  v_gross := round(p_shares * v_p_mid, 6);
  v_fee   := round(p_shares * v_p_mid * v_spread / 2, 6);
  if p_side = 'buy' then
    v_net := v_gross + v_fee;  -- debit
  else
    v_net := v_gross - v_fee;  -- credit
  end if;

  -- 10. Business validations — ALL of them before the first write.
  select h.shares, h.avg_cost into v_held, v_avg
  from public.holdings h
  where h.user_id = v_user and h.player_id = p_player_id;
  v_held := coalesce(v_held, 0);
  v_avg  := coalesce(v_avg, 0);

  if p_side = 'buy' and v_profile.cash_balance < v_net then
    return jsonb_build_object('ok', false, 'code', 'insufficient_funds',
      'message', 'Not enough cash for this trade');
  end if;

  if p_side = 'sell' and v_held < p_shares then
    return jsonb_build_object('ok', false, 'code', 'insufficient_shares',
      'message', 'Not enough shares to sell');
  end if;

  if p_side = 'buy'
     and round(v_held * v_avg, 6) + v_net > v_max_position then
    return jsonb_build_object('ok', false, 'code', 'position_cap',
      'message', 'Position cost basis cap reached for this player');
  end if;

  select coalesce(sum(t.net), 0) into v_daily_volume
  from public.trades t
  where t.user_id = v_user
    and t.player_id = p_player_id
    and t.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  if v_daily_volume + v_net > v_max_daily then
    return jsonb_build_object('ok', false, 'code', 'volume_cap',
      'message', 'Daily volume cap reached for this player');
  end if;

  -- 11. Price impact (MARKET_ENGINE.md §2.1) + circuit breakers (§4).
  v_l  := (v_params -> 'tier_params' -> v_player.liquidity_tier ->> 'L')::numeric;
  v_kd := (v_params -> 'tier_params' -> v_player.liquidity_tier ->> 'k_d')::numeric;
  v_delta := round(p_shares / v_l * v_kd, 6);

  if p_side = 'buy' then
    v_p_new := v_p_mid + v_delta;
  else
    v_p_new := v_p_mid - v_delta;
  end if;

  -- Daily breaker: reference = most recent price older than 24h, falling back
  -- to base_value when the player has no day-old history yet.
  select ph.price into v_ref
  from public.price_history ph
  where ph.player_id = p_player_id
    and ph.captured_at <= now() - interval '24 hours'
  order by ph.captured_at desc
  limit 1;
  v_ref := coalesce(v_ref, v_player.base_value);

  v_p_new := least(
    greatest(v_p_new, round(v_ref * (1 - v_max_daily_pct), 6)),
    round(v_ref * (1 + v_max_daily_pct), 6)
  );
  v_p_new := greatest(v_p_new, v_min_price);
  v_p_new := least(v_p_new, round(v_player.base_value * v_max_mult, 6));

  -- 12. Writes — only reachable once every validation has passed. All inside
  -- the function's transaction: any failure rolls back everything.
  insert into public.trades (user_id, player_id, side, shares, price_per_share, gross, fee, net)
  values (v_user, p_player_id, p_side, p_shares, v_exec_price, v_gross, v_fee, v_net)
  returning id into v_trade_id;

  if p_side = 'buy' then
    -- Cost basis includes the fee: new_avg = (old_shares×old_avg + net) / total.
    insert into public.holdings (user_id, player_id, shares, avg_cost)
    values (v_user, p_player_id, p_shares, round(v_net / p_shares, 6))
    on conflict (user_id, player_id) do update
    set shares   = holdings.shares + excluded.shares,
        avg_cost = round(
          (holdings.shares * holdings.avg_cost + v_net)
          / (holdings.shares + excluded.shares), 6);
  else
    -- avg_cost stays intact on sell (realized P&L keeps its basis).
    update public.holdings
    set shares = shares - p_shares
    where user_id = v_user and player_id = p_player_id;
  end if;

  if p_side = 'buy' then
    v_ledger_delta := -v_net;
  else
    v_ledger_delta := v_net;
  end if;
  v_new_balance := round(v_profile.cash_balance + v_ledger_delta, 6);

  insert into public.wallet_ledger (user_id, delta, balance_after, entry_type, ref_id)
  values (v_user, v_ledger_delta, v_new_balance, 'trade', v_trade_id);

  update public.profiles
  set cash_balance = v_new_balance
  where id = v_user;

  update public.players
  set current_price = v_p_new,
      shares_outstanding = shares_outstanding
        + (case when p_side = 'buy' then p_shares else -p_shares end)
  where id = p_player_id;

  insert into public.price_history (player_id, price, fair_value, reason)
  values (p_player_id, v_p_new, v_player.fair_value, 'trade');

  -- 13. Success. NUMERIC values serialized as text — never as JSON numbers
  -- (ADR-004: the client must not parse money into float64).
  return jsonb_build_object(
    'ok', true,
    'trade_id', v_trade_id,
    'execution_price', v_exec_price::text,
    'shares', p_shares::text,
    'gross', v_gross::text,
    'fee', v_fee::text,
    'net', v_net::text,
    'new_balance', v_new_balance::text,
    'new_price', v_p_new::text
  );
end;
$$;

-- Anon must not even reach the function body; authenticated users go through
-- the auth.uid() gate inside.
revoke execute on function public.trade(uuid, text, numeric) from public, anon;
grant execute on function public.trade(uuid, text, numeric) to authenticated, service_role;
