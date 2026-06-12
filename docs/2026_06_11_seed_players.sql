-- ============================================================
-- Football Exchange — Player + Team seed (Mundial 2026)
-- Migration: run in Supabase SQL Editor
-- Teams seeded first, then players resolved by subquery.
-- positions already seeded in 20260610000001_catalogs.sql
-- ============================================================

BEGIN;

-- ── 1. Teams ─────────────────────────────────────────────────
INSERT INTO public.teams (name, country, colors) VALUES
  ('Argentina', 'Argentina', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Brazil', 'Brazil', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('France', 'France', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Spain', 'Spain', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('England', 'England', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Germany', 'Germany', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Portugal', 'Portugal', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Netherlands', 'Netherlands', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Belgium', 'Belgium', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Croatia', 'Croatia', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Morocco', 'Morocco', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Colombia', 'Colombia', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Uruguay', 'Uruguay', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Norway', 'Norway', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Mexico', 'Mexico', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('United States', 'United States', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Japan', 'Japan', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Sweden', 'Sweden', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Turkey', 'Turkey', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Senegal', 'Senegal', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Ecuador', 'Ecuador', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Canada', 'Canada', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Switzerland', 'Switzerland', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Egypt', 'Egypt', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Ivory Coast', 'Ivory Coast', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Scotland', 'Scotland', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('South Korea', 'South Korea', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Algeria', 'Algeria', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Ghana', 'Ghana', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Czech Republic', 'Czech Republic', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Paraguay', 'Paraguay', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Austria', 'Austria', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Australia', 'Australia', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb),
  ('Bosnia and Herzegovina', 'Bosnia and Herzegovina', '{"primary": "#cccccc", "secondary": "#ffffff"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── 2. Players ───────────────────────────────────────────────
INSERT INTO public.players
  (full_name, team_id, position_id, dob, base_value, fair_value, current_price, liquidity_tier, api_player_id)
VALUES
  (
    'Lionel Messi',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1987-06-24',
    45000, 45000, 45000,
    'star',
    NULL
  ),
  (
    'Julián Álvarez',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-01-31',
    250000, 250000, 250000,
    'star',
    NULL
  ),
  (
    'Lautaro Martínez',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-08-22',
    212500, 212500, 212500,
    'star',
    NULL
  ),
  (
    'Alexis Mac Allister',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-12-24',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Enzo Fernández',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-01-17',
    187500, 187500, 187500,
    'starter',
    NULL
  ),
  (
    'Nico Paz',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2004-09-08',
    150000, 150000, 150000,
    'prospect',
    NULL
  ),
  (
    'Cristian Romero',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1998-04-27',
    125000, 125000, 125000,
    'starter',
    NULL
  ),
  (
    'Emiliano Martínez',
    (SELECT id FROM public.teams WHERE name = 'Argentina'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1992-09-02',
    45000, 45000, 45000,
    'starter',
    NULL
  ),
  (
    'Vinícius Júnior',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-07-12',
    375000, 375000, 375000,
    'star',
    NULL
  ),
  (
    'Raphinha',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1996-12-14',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Neymar',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1992-02-05',
    25000, 25000, 25000,
    'star',
    NULL
  ),
  (
    'Matheus Cunha',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-05-27',
    150000, 150000, 150000,
    'starter',
    NULL
  ),
  (
    'Bruno Guimarães',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-11-16',
    200000, 200000, 200000,
    'starter',
    NULL
  ),
  (
    'Gabriel Magalhães',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1997-12-19',
    187500, 187500, 187500,
    'starter',
    NULL
  ),
  (
    'Marquinhos',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1994-05-14',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Alisson',
    (SELECT id FROM public.teams WHERE name = 'Brazil'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1992-10-02',
    50000, 50000, 50000,
    'starter',
    NULL
  ),
  (
    'Kylian Mbappé',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1998-12-20',
    450000, 450000, 450000,
    'star',
    NULL
  ),
  (
    'Ousmane Dembélé',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-05-15',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Michael Olise',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-12-12',
    250000, 250000, 250000,
    'star',
    NULL
  ),
  (
    'Désiré Doué',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2005-06-03',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Aurélien Tchouaméni',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2000-01-27',
    200000, 200000, 200000,
    'starter',
    NULL
  ),
  (
    'William Saliba',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2001-03-24',
    200000, 200000, 200000,
    'starter',
    NULL
  ),
  (
    'Eduardo Camavinga',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2002-11-10',
    150000, 150000, 150000,
    'starter',
    NULL
  ),
  (
    'Mike Maignan',
    (SELECT id FROM public.teams WHERE name = 'France'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1995-07-03',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Lamine Yamal',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2007-07-13',
    500000, 500000, 500000,
    'star',
    NULL
  ),
  (
    'Pedri',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2002-11-25',
    350000, 350000, 350000,
    'star',
    NULL
  ),
  (
    'Rodri',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1996-06-22',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Nico Williams',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-07-12',
    175000, 175000, 175000,
    'star',
    NULL
  ),
  (
    'Pau Cubarsí',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2007-01-22',
    200000, 200000, 200000,
    'prospect',
    NULL
  ),
  (
    'Dean Huijsen',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2005-04-14',
    175000, 175000, 175000,
    'starter',
    NULL
  ),
  (
    'Mikel Oyarzabal',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-04-21',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Unai Simón',
    (SELECT id FROM public.teams WHERE name = 'Spain'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1997-06-11',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Jude Bellingham',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-06-29',
    450000, 450000, 450000,
    'star',
    NULL
  ),
  (
    'Bukayo Saka',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2001-09-05',
    350000, 350000, 350000,
    'star',
    NULL
  ),
  (
    'Harry Kane',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1993-07-28',
    187500, 187500, 187500,
    'star',
    NULL
  ),
  (
    'Declan Rice',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1999-01-14',
    275000, 275000, 275000,
    'star',
    NULL
  ),
  (
    'Morgan Rogers',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2002-07-26',
    175000, 175000, 175000,
    'starter',
    NULL
  ),
  (
    'Eberechi Eze',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-06-29',
    150000, 150000, 150000,
    'starter',
    NULL
  ),
  (
    'Marc Guéhi',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2000-07-13',
    125000, 125000, 125000,
    'starter',
    NULL
  ),
  (
    'Jordan Pickford',
    (SELECT id FROM public.teams WHERE name = 'England'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1994-03-07',
    45000, 45000, 45000,
    'starter',
    NULL
  ),
  (
    'Florian Wirtz',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-05-03',
    325000, 325000, 325000,
    'star',
    NULL
  ),
  (
    'Jamal Musiala',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-02-26',
    312500, 312500, 312500,
    'star',
    NULL
  ),
  (
    'Nick Woltemade',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-02-14',
    137500, 137500, 137500,
    'starter',
    NULL
  ),
  (
    'Joshua Kimmich',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1995-02-08',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Aleksandar Pavlović',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2004-05-03',
    125000, 125000, 125000,
    'prospect',
    NULL
  ),
  (
    'Nico Schlotterbeck',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1999-12-01',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Antonio Rüdiger',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1993-03-03',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Manuel Neuer',
    (SELECT id FROM public.teams WHERE name = 'Germany'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1986-03-27',
    2500, 2500, 2500,
    'star',
    NULL
  ),
  (
    'Cristiano Ronaldo',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1985-02-05',
    30000, 30000, 30000,
    'star',
    NULL
  ),
  (
    'Vitinha',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2000-02-13',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'João Neves',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2004-09-27',
    200000, 200000, 200000,
    'star',
    NULL
  ),
  (
    'Rafael Leão',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-06-10',
    175000, 175000, 175000,
    'star',
    NULL
  ),
  (
    'Nuno Mendes',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2002-06-19',
    175000, 175000, 175000,
    'starter',
    NULL
  ),
  (
    'Bruno Fernandes',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1994-09-08',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Diogo Costa',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1999-09-19',
    87500, 87500, 87500,
    'starter',
    NULL
  ),
  (
    'Francisco Conceição',
    (SELECT id FROM public.teams WHERE name = 'Portugal'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-12-14',
    75000, 75000, 75000,
    'starter',
    NULL
  ),
  (
    'Cody Gakpo',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-05-07',
    187500, 187500, 187500,
    'star',
    NULL
  ),
  (
    'Ryan Gravenberch',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2002-05-16',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Tijjani Reijnders',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-07-29',
    175000, 175000, 175000,
    'star',
    NULL
  ),
  (
    'Frenkie de Jong',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-05-12',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Virgil van Dijk',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1991-07-08',
    62500, 62500, 62500,
    'star',
    NULL
  ),
  (
    'Denzel Dumfries',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1996-04-18',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Memphis Depay',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1994-02-13',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Bart Verbruggen',
    (SELECT id FROM public.teams WHERE name = 'Netherlands'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '2002-08-18',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Kevin De Bruyne',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1991-06-28',
    50000, 50000, 50000,
    'star',
    NULL
  ),
  (
    'Jérémy Doku',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-05-27',
    162500, 162500, 162500,
    'star',
    NULL
  ),
  (
    'Thibaut Courtois',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1992-05-11',
    55000, 55000, 55000,
    'star',
    NULL
  ),
  (
    'Romelu Lukaku',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1993-05-13',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Charles De Ketelaere',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2001-03-10',
    125000, 125000, 125000,
    'starter',
    NULL
  ),
  (
    'Amadou Onana',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-08-16',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Youri Tielemans',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-05-07',
    95000, 95000, 95000,
    'starter',
    NULL
  ),
  (
    'Zeno Debast',
    (SELECT id FROM public.teams WHERE name = 'Belgium'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2003-10-24',
    50000, 50000, 50000,
    'prospect',
    NULL
  ),
  (
    'Luka Modrić',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1985-09-09',
    20000, 20000, 20000,
    'star',
    NULL
  ),
  (
    'Joško Gvardiol',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2002-01-23',
    187500, 187500, 187500,
    'star',
    NULL
  ),
  (
    'Petar Sučić',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-10-25',
    80000, 80000, 80000,
    'prospect',
    NULL
  ),
  (
    'Franjo Ivanović',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2003-09-29',
    75000, 75000, 75000,
    'prospect',
    NULL
  ),
  (
    'Mateo Kovačić',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1994-05-06',
    50000, 50000, 50000,
    'starter',
    NULL
  ),
  (
    'Andrej Kramarić',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1991-06-19',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Marcelo Brozović',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1992-11-16',
    15000, 15000, 15000,
    'starter',
    NULL
  ),
  (
    'Dominik Livaković',
    (SELECT id FROM public.teams WHERE name = 'Croatia'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1995-01-09',
    25000, 25000, 25000,
    'starter',
    NULL
  ),
  (
    'Achraf Hakimi',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1998-11-04',
    200000, 200000, 200000,
    'star',
    NULL
  ),
  (
    'Brahim Díaz',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1999-08-03',
    87500, 87500, 87500,
    'star',
    NULL
  ),
  (
    'Bilal El Khannouss',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2004-05-10',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Eliesse Ben Seghir',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2005-02-16',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Ismael Saibari',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-01-28',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Nayef Aguerd',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1996-03-30',
    75000, 75000, 75000,
    'starter',
    NULL
  ),
  (
    'Soufiane Rahimi',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1996-06-02',
    25000, 25000, 25000,
    'starter',
    NULL
  ),
  (
    'Yassine Bounou',
    (SELECT id FROM public.teams WHERE name = 'Morocco'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1991-04-05',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Luis Díaz',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-01-13',
    175000, 175000, 175000,
    'star',
    NULL
  ),
  (
    'James Rodríguez',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1991-07-12',
    7500, 7500, 7500,
    'star',
    NULL
  ),
  (
    'Jhon Durán',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2003-12-13',
    87500, 87500, 87500,
    'starter',
    NULL
  ),
  (
    'Luis Suárez',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-12-02',
    75000, 75000, 75000,
    'starter',
    NULL
  ),
  (
    'Richard Ríos',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2000-06-02',
    75000, 75000, 75000,
    'starter',
    NULL
  ),
  (
    'Jhon Arias',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-09-21',
    40000, 40000, 40000,
    'starter',
    NULL
  ),
  (
    'Daniel Muñoz',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1996-05-26',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Camilo Vargas',
    (SELECT id FROM public.teams WHERE name = 'Colombia'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1989-03-09',
    5000, 5000, 5000,
    'starter',
    NULL
  ),
  (
    'Federico Valverde',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-07-22',
    325000, 325000, 325000,
    'star',
    NULL
  ),
  (
    'Darwin Núñez',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-06-24',
    100000, 100000, 100000,
    'star',
    NULL
  ),
  (
    'Ronald Araújo',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1999-03-07',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Manuel Ugarte',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-04-11',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Rodrigo Bentancur',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-06-25',
    87500, 87500, 87500,
    'starter',
    NULL
  ),
  (
    'Maximiliano Araújo',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-02-15',
    55000, 55000, 55000,
    'starter',
    NULL
  ),
  (
    'José María Giménez',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1995-01-20',
    22500, 22500, 22500,
    'starter',
    NULL
  ),
  (
    'Sergio Rochet',
    (SELECT id FROM public.teams WHERE name = 'Uruguay'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1993-03-23',
    10000, 10000, 10000,
    'starter',
    NULL
  ),
  (
    'Erling Haaland',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-07-21',
    450000, 450000, 450000,
    'star',
    NULL
  ),
  (
    'Martin Ødegaard',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-12-17',
    175000, 175000, 175000,
    'star',
    NULL
  ),
  (
    'Antonio Nusa',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2005-04-17',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Alexander Sørloth',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1995-12-05',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Oscar Bobb',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-07-12',
    80000, 80000, 80000,
    'prospect',
    NULL
  ),
  (
    'Sander Berge',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-02-14',
    55000, 55000, 55000,
    'starter',
    NULL
  ),
  (
    'Leo Østigård',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1999-11-28',
    22500, 22500, 22500,
    'starter',
    NULL
  ),
  (
    'Ørjan Nyland',
    (SELECT id FROM public.teams WHERE name = 'Norway'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1990-09-10',
    2500, 2500, 2500,
    'starter',
    NULL
  ),
  (
    'Santiago Giménez',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2001-04-18',
    70000, 70000, 70000,
    'star',
    NULL
  ),
  (
    'Gilberto Mora',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2008-10-14',
    75000, 75000, 75000,
    'prospect',
    NULL
  ),
  (
    'Edson Álvarez',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-10-24',
    50000, 50000, 50000,
    'starter',
    NULL
  ),
  (
    'Hirving Lozano',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1995-07-30',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Raúl Jiménez',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1991-05-05',
    12500, 12500, 12500,
    'starter',
    NULL
  ),
  (
    'Johan Vásquez',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1998-10-22',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Obed Vargas',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2005-08-05',
    20000, 20000, 20000,
    'prospect',
    NULL
  ),
  (
    'Guillermo Ochoa',
    (SELECT id FROM public.teams WHERE name = 'Mexico'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1985-07-13',
    1000, 1000, 1000,
    'star',
    NULL
  ),
  (
    'Christian Pulisic',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1998-09-18',
    137500, 137500, 137500,
    'star',
    NULL
  ),
  (
    'Folarin Balogun',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2001-07-03',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Weston McKennie',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-08-28',
    55000, 55000, 55000,
    'starter',
    NULL
  ),
  (
    'Antonee Robinson',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1997-08-08',
    87500, 87500, 87500,
    'starter',
    NULL
  ),
  (
    'Tyler Adams',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1999-02-14',
    45000, 45000, 45000,
    'starter',
    NULL
  ),
  (
    'Sergiño Dest',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2000-11-03',
    45000, 45000, 45000,
    'starter',
    NULL
  ),
  (
    'Diego Luna',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-09-09',
    30000, 30000, 30000,
    'prospect',
    NULL
  ),
  (
    'Matt Freese',
    (SELECT id FROM public.teams WHERE name = 'United States'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1998-09-02',
    12500, 12500, 12500,
    'starter',
    NULL
  ),
  (
    'Takefusa Kubo',
    (SELECT id FROM public.teams WHERE name = 'Japan'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2001-06-04',
    125000, 125000, 125000,
    'star',
    NULL
  ),
  (
    'Ritsu Doan',
    (SELECT id FROM public.teams WHERE name = 'Japan'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1998-06-16',
    75000, 75000, 75000,
    'starter',
    NULL
  ),
  (
    'Ayase Ueda',
    (SELECT id FROM public.teams WHERE name = 'Japan'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1998-08-28',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Wataru Endo',
    (SELECT id FROM public.teams WHERE name = 'Japan'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1993-02-09',
    15000, 15000, 15000,
    'starter',
    NULL
  ),
  (
    'Hiroki Ito',
    (SELECT id FROM public.teams WHERE name = 'Japan'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1999-05-12',
    55000, 55000, 55000,
    'starter',
    NULL
  ),
  (
    'Zion Suzuki',
    (SELECT id FROM public.teams WHERE name = 'Japan'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '2002-08-21',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Alexander Isak',
    (SELECT id FROM public.teams WHERE name = 'Sweden'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-09-21',
    300000, 300000, 300000,
    'star',
    NULL
  ),
  (
    'Viktor Gyökeres',
    (SELECT id FROM public.teams WHERE name = 'Sweden'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1998-06-04',
    187500, 187500, 187500,
    'star',
    NULL
  ),
  (
    'Lucas Bergvall',
    (SELECT id FROM public.teams WHERE name = 'Sweden'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2006-02-02',
    125000, 125000, 125000,
    'prospect',
    NULL
  ),
  (
    'Anthony Elanga',
    (SELECT id FROM public.teams WHERE name = 'Sweden'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-04-27',
    87500, 87500, 87500,
    'starter',
    NULL
  ),
  (
    'Roony Bardghji',
    (SELECT id FROM public.teams WHERE name = 'Sweden'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2005-11-15',
    50000, 50000, 50000,
    'prospect',
    NULL
  ),
  (
    'Robin Olsen',
    (SELECT id FROM public.teams WHERE name = 'Sweden'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1990-01-08',
    2500, 2500, 2500,
    'starter',
    NULL
  ),
  (
    'Arda Güler',
    (SELECT id FROM public.teams WHERE name = 'Turkey'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2005-02-25',
    225000, 225000, 225000,
    'star',
    NULL
  ),
  (
    'Kenan Yıldız',
    (SELECT id FROM public.teams WHERE name = 'Turkey'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2005-05-04',
    187500, 187500, 187500,
    'star',
    NULL
  ),
  (
    'Hakan Çalhanoğlu',
    (SELECT id FROM public.teams WHERE name = 'Turkey'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1994-02-08',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Can Uzun',
    (SELECT id FROM public.teams WHERE name = 'Turkey'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2005-11-11',
    100000, 100000, 100000,
    'prospect',
    NULL
  ),
  (
    'Barış Alper Yılmaz',
    (SELECT id FROM public.teams WHERE name = 'Turkey'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-05-23',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Uğurcan Çakır',
    (SELECT id FROM public.teams WHERE name = 'Turkey'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1996-04-05',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Sadio Mané',
    (SELECT id FROM public.teams WHERE name = 'Senegal'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1992-04-10',
    37500, 37500, 37500,
    'star',
    NULL
  ),
  (
    'Nicolas Jackson',
    (SELECT id FROM public.teams WHERE name = 'Senegal'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2001-06-20',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Pape Matar Sarr',
    (SELECT id FROM public.teams WHERE name = 'Senegal'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2002-09-14',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Iliman Ndiaye',
    (SELECT id FROM public.teams WHERE name = 'Senegal'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-03-06',
    95000, 95000, 95000,
    'starter',
    NULL
  ),
  (
    'Habib Diarra',
    (SELECT id FROM public.teams WHERE name = 'Senegal'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2004-01-03',
    75000, 75000, 75000,
    'starter',
    NULL
  ),
  (
    'Édouard Mendy',
    (SELECT id FROM public.teams WHERE name = 'Senegal'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1992-03-01',
    12500, 12500, 12500,
    'starter',
    NULL
  ),
  (
    'Moisés Caicedo',
    (SELECT id FROM public.teams WHERE name = 'Ecuador'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-11-02',
    275000, 275000, 275000,
    'star',
    NULL
  ),
  (
    'Willian Pacho',
    (SELECT id FROM public.teams WHERE name = 'Ecuador'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2001-10-16',
    162500, 162500, 162500,
    'star',
    NULL
  ),
  (
    'Piero Hincapié',
    (SELECT id FROM public.teams WHERE name = 'Ecuador'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2002-01-09',
    112500, 112500, 112500,
    'starter',
    NULL
  ),
  (
    'Kendry Páez',
    (SELECT id FROM public.teams WHERE name = 'Ecuador'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2007-05-04',
    45000, 45000, 45000,
    'prospect',
    NULL
  ),
  (
    'Pervis Estupiñán',
    (SELECT id FROM public.teams WHERE name = 'Ecuador'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1998-01-21',
    45000, 45000, 45000,
    'starter',
    NULL
  ),
  (
    'Enner Valencia',
    (SELECT id FROM public.teams WHERE name = 'Ecuador'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1989-11-04',
    5000, 5000, 5000,
    'starter',
    NULL
  ),
  (
    'Alphonso Davies',
    (SELECT id FROM public.teams WHERE name = 'Canada'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2000-11-02',
    100000, 100000, 100000,
    'star',
    NULL
  ),
  (
    'Jonathan David',
    (SELECT id FROM public.teams WHERE name = 'Canada'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-01-14',
    100000, 100000, 100000,
    'star',
    NULL
  ),
  (
    'Tajon Buchanan',
    (SELECT id FROM public.teams WHERE name = 'Canada'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-02-08',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Stephen Eustáquio',
    (SELECT id FROM public.teams WHERE name = 'Canada'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1996-12-21',
    25000, 25000, 25000,
    'starter',
    NULL
  ),
  (
    'Ismaël Koné',
    (SELECT id FROM public.teams WHERE name = 'Canada'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2002-06-16',
    35000, 35000, 35000,
    'starter',
    NULL
  ),
  (
    'Dayne St. Clair',
    (SELECT id FROM public.teams WHERE name = 'Canada'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1997-05-09',
    10000, 10000, 10000,
    'starter',
    NULL
  ),
  (
    'Granit Xhaka',
    (SELECT id FROM public.teams WHERE name = 'Switzerland'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1992-09-27',
    30000, 30000, 30000,
    'star',
    NULL
  ),
  (
    'Dan Ndoye',
    (SELECT id FROM public.teams WHERE name = 'Switzerland'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-10-25',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Gregor Kobel',
    (SELECT id FROM public.teams WHERE name = 'Switzerland'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1997-12-06',
    80000, 80000, 80000,
    'starter',
    NULL
  ),
  (
    'Manuel Akanji',
    (SELECT id FROM public.teams WHERE name = 'Switzerland'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1995-07-19',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Breel Embolo',
    (SELECT id FROM public.teams WHERE name = 'Switzerland'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-02-14',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Mohamed Salah',
    (SELECT id FROM public.teams WHERE name = 'Egypt'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1992-06-15',
    112500, 112500, 112500,
    'star',
    NULL
  ),
  (
    'Omar Marmoush',
    (SELECT id FROM public.teams WHERE name = 'Egypt'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1999-02-07',
    137500, 137500, 137500,
    'star',
    NULL
  ),
  (
    'Mostafa Mohamed',
    (SELECT id FROM public.teams WHERE name = 'Egypt'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1997-11-28',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Mahmoud Trezeguet',
    (SELECT id FROM public.teams WHERE name = 'Egypt'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1994-10-01',
    10000, 10000, 10000,
    'starter',
    NULL
  ),
  (
    'Mohamed El Shenawy',
    (SELECT id FROM public.teams WHERE name = 'Egypt'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1988-12-18',
    1250, 1250, 1250,
    'starter',
    NULL
  ),
  (
    'Amad Diallo',
    (SELECT id FROM public.teams WHERE name = 'Ivory Coast'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-07-11',
    125000, 125000, 125000,
    'star',
    NULL
  ),
  (
    'Evan Ndicka',
    (SELECT id FROM public.teams WHERE name = 'Ivory Coast'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1999-08-20',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Simon Adingra',
    (SELECT id FROM public.teams WHERE name = 'Ivory Coast'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2002-01-01',
    50000, 50000, 50000,
    'starter',
    NULL
  ),
  (
    'Franck Kessié',
    (SELECT id FROM public.teams WHERE name = 'Ivory Coast'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1996-12-19',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Yahia Fofana',
    (SELECT id FROM public.teams WHERE name = 'Ivory Coast'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '2000-08-21',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Scott McTominay',
    (SELECT id FROM public.teams WHERE name = 'Scotland'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1996-12-08',
    87500, 87500, 87500,
    'star',
    NULL
  ),
  (
    'John McGinn',
    (SELECT id FROM public.teams WHERE name = 'Scotland'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1994-10-18',
    30000, 30000, 30000,
    'starter',
    NULL
  ),
  (
    'Andy Robertson',
    (SELECT id FROM public.teams WHERE name = 'Scotland'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1994-03-11',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Ben Doak',
    (SELECT id FROM public.teams WHERE name = 'Scotland'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2005-11-11',
    62500, 62500, 62500,
    'prospect',
    NULL
  ),
  (
    'Angus Gunn',
    (SELECT id FROM public.teams WHERE name = 'Scotland'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1996-01-22',
    7500, 7500, 7500,
    'starter',
    NULL
  ),
  (
    'Son Heung-min',
    (SELECT id FROM public.teams WHERE name = 'South Korea'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1992-07-08',
    37500, 37500, 37500,
    'star',
    NULL
  ),
  (
    'Lee Kang-in',
    (SELECT id FROM public.teams WHERE name = 'South Korea'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2001-02-19',
    100000, 100000, 100000,
    'star',
    NULL
  ),
  (
    'Kim Min-jae',
    (SELECT id FROM public.teams WHERE name = 'South Korea'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1996-11-15',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Hwang Hee-chan',
    (SELECT id FROM public.teams WHERE name = 'South Korea'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1996-01-26',
    25000, 25000, 25000,
    'starter',
    NULL
  ),
  (
    'Riyad Mahrez',
    (SELECT id FROM public.teams WHERE name = 'Algeria'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1991-02-21',
    25000, 25000, 25000,
    'star',
    NULL
  ),
  (
    'Mohamed Amoura',
    (SELECT id FROM public.teams WHERE name = 'Algeria'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-05-09',
    87500, 87500, 87500,
    'starter',
    NULL
  ),
  (
    'Rayan Aït-Nouri',
    (SELECT id FROM public.teams WHERE name = 'Algeria'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2001-06-06',
    100000, 100000, 100000,
    'starter',
    NULL
  ),
  (
    'Luca Zidane',
    (SELECT id FROM public.teams WHERE name = 'Algeria'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '1998-05-13',
    5000, 5000, 5000,
    'starter',
    NULL
  ),
  (
    'Antoine Semenyo',
    (SELECT id FROM public.teams WHERE name = 'Ghana'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2000-01-07',
    162500, 162500, 162500,
    'star',
    NULL
  ),
  (
    'Thomas Partey',
    (SELECT id FROM public.teams WHERE name = 'Ghana'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1993-06-13',
    12500, 12500, 12500,
    'starter',
    NULL
  ),
  (
    'Iñaki Williams',
    (SELECT id FROM public.teams WHERE name = 'Ghana'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1994-06-15',
    37500, 37500, 37500,
    'starter',
    NULL
  ),
  (
    'Jordan Ayew',
    (SELECT id FROM public.teams WHERE name = 'Ghana'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1991-09-11',
    7500, 7500, 7500,
    'starter',
    NULL
  ),
  (
    'Patrik Schick',
    (SELECT id FROM public.teams WHERE name = 'Czech Republic'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1996-01-24',
    70000, 70000, 70000,
    'star',
    NULL
  ),
  (
    'Tomáš Souček',
    (SELECT id FROM public.teams WHERE name = 'Czech Republic'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1995-02-27',
    17500, 17500, 17500,
    'starter',
    NULL
  ),
  (
    'Ladislav Krejčí',
    (SELECT id FROM public.teams WHERE name = 'Czech Republic'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1999-04-20',
    70000, 70000, 70000,
    'starter',
    NULL
  ),
  (
    'Antonín Kinský',
    (SELECT id FROM public.teams WHERE name = 'Czech Republic'),
    (SELECT id FROM public.positions WHERE code = 'GK'),
    '2003-03-31',
    30000, 30000, 30000,
    'prospect',
    NULL
  ),
  (
    'Julio Enciso',
    (SELECT id FROM public.teams WHERE name = 'Paraguay'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2004-01-23',
    55000, 55000, 55000,
    'star',
    NULL
  ),
  (
    'Miguel Almirón',
    (SELECT id FROM public.teams WHERE name = 'Paraguay'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1994-02-10',
    20000, 20000, 20000,
    'starter',
    NULL
  ),
  (
    'Diego Gómez',
    (SELECT id FROM public.teams WHERE name = 'Paraguay'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '2003-03-27',
    37500, 37500, 37500,
    'starter',
    NULL
  ),
  (
    'Antonio Sanabria',
    (SELECT id FROM public.teams WHERE name = 'Paraguay'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1996-03-04',
    10000, 10000, 10000,
    'starter',
    NULL
  ),
  (
    'David Alaba',
    (SELECT id FROM public.teams WHERE name = 'Austria'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1992-06-24',
    15000, 15000, 15000,
    'star',
    NULL
  ),
  (
    'Marcel Sabitzer',
    (SELECT id FROM public.teams WHERE name = 'Austria'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1994-03-17',
    25000, 25000, 25000,
    'starter',
    NULL
  ),
  (
    'Konrad Laimer',
    (SELECT id FROM public.teams WHERE name = 'Austria'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1997-05-27',
    62500, 62500, 62500,
    'starter',
    NULL
  ),
  (
    'Harry Souttar',
    (SELECT id FROM public.teams WHERE name = 'Australia'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '1998-10-22',
    12500, 12500, 12500,
    'starter',
    NULL
  ),
  (
    'Jackson Irvine',
    (SELECT id FROM public.teams WHERE name = 'Australia'),
    (SELECT id FROM public.positions WHERE code = 'MID'),
    '1993-03-07',
    10000, 10000, 10000,
    'starter',
    NULL
  ),
  (
    'Nestory Irankunda',
    (SELECT id FROM public.teams WHERE name = 'Australia'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '2006-02-04',
    20000, 20000, 20000,
    'prospect',
    NULL
  ),
  (
    'Edin Džeko',
    (SELECT id FROM public.teams WHERE name = 'Bosnia and Herzegovina'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1986-03-17',
    2500, 2500, 2500,
    'star',
    NULL
  ),
  (
    'Ermedin Demirović',
    (SELECT id FROM public.teams WHERE name = 'Bosnia and Herzegovina'),
    (SELECT id FROM public.positions WHERE code = 'FWD'),
    '1998-03-25',
    50000, 50000, 50000,
    'starter',
    NULL
  ),
  (
    'Amar Dedić',
    (SELECT id FROM public.teams WHERE name = 'Bosnia and Herzegovina'),
    (SELECT id FROM public.positions WHERE code = 'DEF'),
    '2002-08-18',
    37500, 37500, 37500,
    'starter',
    NULL
  )
;

-- ── 3. Verify ────────────────────────────────────────────────
DO $$
DECLARE
  v_teams int;
  v_players int;
  v_nulls int;
BEGIN
  SELECT COUNT(*) INTO v_teams FROM public.teams;
  SELECT COUNT(*) INTO v_players FROM public.players;
  SELECT COUNT(*) INTO v_nulls FROM public.players WHERE team_id IS NULL OR position_id IS NULL;
  RAISE NOTICE 'teams=% players=% null_fks=%', v_teams, v_players, v_nulls;
  IF v_nulls > 0 THEN
    RAISE EXCEPTION 'Seed failed: % players have NULL foreign keys', v_nulls;
  END IF;
  IF v_players < 200 THEN
    RAISE EXCEPTION 'Seed failed: only % players inserted (expected >=200)', v_players;
  END IF;
END $$;

COMMIT;