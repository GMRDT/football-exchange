-- Private leagues.

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'private',
  invite_code text unique not null,
  -- SET NULL: deleting a user account must not delete the league for its
  -- remaining members.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
