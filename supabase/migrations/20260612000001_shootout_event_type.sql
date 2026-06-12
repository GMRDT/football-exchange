-- shootout_kick event type (audit fix 1).
--
-- API-Football reports penalty-shootout kicks as type=Goal with
-- comments='Penalty Shootout'. Without a dedicated code, ingest priced each
-- kick as penalty_scored (+0.06) / penalty_missed (-0.08) — up to 10 spurious
-- fair-value moves per shootout, compounding on top of the AET survival
-- multiplier (MARKET_ENGINE.md §1.3).
--
-- default_perf_points = 0 makes the existing pipeline handle it with no code
-- branch: eventDeltaPct(0) = 0 → fair value unchanged, total_pct = 0 →
-- ingest_event() skips the drip enqueue. The kick is still recorded in
-- match_events (idempotent, available for reconciliation/activity feed).

insert into public.event_types (code, name, default_perf_points)
values ('shootout_kick', 'Penalty shootout kick (unpriced)', 0)
on conflict (code) do nothing;
