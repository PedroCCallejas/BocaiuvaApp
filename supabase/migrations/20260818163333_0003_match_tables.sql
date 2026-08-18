-- Partida e tudo que nasce dela.
--
-- Aqui esta o peso do banco. `player_ratings` cresce ao QUADRADO do elenco:
-- 15 avaliadores x 15 avaliados = 225 linhas por jogo. No Firestore isso eram
-- 225 documentos cobrados a cada leitura, por pessoa, a cada abertura do app.
-- Em SQL, a mesma coisa e uma consulta so.

create table public.matches (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  season_id text references public.seasons (id) on delete set null,
  date date not null,
  -- HH:MM. Texto de proposito: um `time` aqui abriria discussao de fuso para
  -- um dado que e so "o horario combinado no grupo".
  time text not null default '',
  venue text not null default '',
  location_url text,
  opponent_name text not null default '',
  opponent_logo_url text,
  opponent_team_id text references public.teams (id) on delete set null,
  opponent_team_name text,
  opponent_team_logo_url text,
  opponent_source text check (opponent_source in ('manual', 'public_team')),
  line_players_count integer not null default 0,
  match_type text not null default 'society'
    check (match_type in ('society', 'futsal', 'field', 'training')),
  notes text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'confirmed', 'finished', 'canceled')),
  created_by text not null references public.users (id),
  scoreboard jsonb,
  field_cost jsonb,
  field_payment jsonb,
  finished_at timestamptz,
  mvp_winner_player_ids text[] not null default '{}',
  mvp_total_votes integer not null default 0,
  manual_mvp_player_id text references public.players (id) on delete set null,
  manual_mvp_selected_by text references public.users (id),
  manual_mvp_selected_at timestamptz,
  deleted_at timestamptz,
  deleted_by text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A tela quase sempre quer "as partidas do time, mais recentes primeiro".
create index matches_team_date_idx on public.matches (team_id, date desc)
  where deleted_at is null;
create index matches_season_id_idx on public.matches (season_id)
  where season_id is not null;

create table public.lineups (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  formation_key text not null default '',
  -- [{ playerId, x, y, zone, label }] — posicao no campo e desenho, nao relacao.
  starters jsonb not null default '[]'::jsonb,
  bench_player_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id)
);

create index lineups_team_id_idx on public.lineups (team_id);

create table public.attendance (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null references public.players (id) on delete cascade,
  user_id text references public.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('confirmed', 'absent', 'pending')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index attendance_team_id_idx on public.attendance (team_id);
create index attendance_match_id_idx on public.attendance (match_id);
create index attendance_player_id_idx on public.attendance (player_id);

create table public.match_stats (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null references public.players (id) on delete cascade,
  played boolean not null default false,
  started boolean not null default false,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  yellow_cards integer not null default 0 check (yellow_cards >= 0),
  red_cards integer not null default 0 check (red_cards >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index match_stats_team_id_idx on public.match_stats (team_id);
create index match_stats_player_id_idx on public.match_stats (player_id);

create table public.mvp_votes (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  voter_player_id text not null references public.players (id) on delete cascade,
  target_player_id text not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um voto por pessoa por jogo, garantido pelo banco em vez de por transacao.
  unique (match_id, voter_player_id),
  check (voter_player_id <> target_player_id)
);

create index mvp_votes_team_id_idx on public.mvp_votes (team_id);
create index mvp_votes_match_id_idx on public.mvp_votes (match_id);

create table public.player_ratings (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  rater_player_id text not null references public.players (id) on delete cascade,
  target_player_id text not null references public.players (id) on delete cascade,
  criteria_scores jsonb not null default '{}'::jsonb,
  -- Foto dos criterios no momento da nota: se o admin mudar peso ou apagar um
  -- criterio depois, a nota antiga continua explicavel.
  criteria_snapshot jsonb not null default '{}'::jsonb,
  legacy_criteria jsonb,
  overall numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, rater_player_id, target_player_id),
  check (rater_player_id <> target_player_id)
);

create index player_ratings_team_id_idx on public.player_ratings (team_id);
create index player_ratings_match_id_idx on public.player_ratings (match_id);
create index player_ratings_target_idx on public.player_ratings (target_player_id);

create table public.match_diary_entries (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  author_user_id text not null references public.users (id),
  author_name text not null default '',
  title text,
  content text not null,
  mentioned_player_ids text[] not null default '{}',
  visibility text not null default 'team' check (visibility in ('team')),
  pinned boolean not null default false,
  mood text check (mood in ('funny', 'highlight', 'warning', 'praise', 'neutral')),
  emoji text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index match_diary_entries_team_id_idx on public.match_diary_entries (team_id);
create index match_diary_entries_match_id_idx on public.match_diary_entries (match_id);

create table public.notifications (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null default '',
  match_id text references public.matches (id) on delete cascade,
  player_id text references public.players (id) on delete cascade,
  entry_id text,
  actor_user_id text references public.users (id),
  -- Nulo = aviso para o time inteiro.
  target_user_id text references public.users (id) on delete cascade,
  read_by_user_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_team_target_idx on public.notifications (team_id, target_user_id);
create index notifications_created_at_idx on public.notifications (team_id, created_at desc);
