-- Nucleo: pessoa, time, vinculo, temporada, elenco e criterios de nota.
--
-- Os ids continuam TEXT e mantem exatamente o id atual do Firestore. Trocar por
-- uuid agora obrigaria uma tabela de-para durante toda a convivencia dos dois
-- bancos, e qualquer erro nela viraria dado orfao.

create table public.users (
  id text primary key,
  email text not null,
  display_name text not null default '',
  app_role text not null default 'player'
    check (app_role in ('owner', 'team_admin', 'player')),
  active_team_id text,
  avatar_url text,
  notification_tokens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Perfil da conta. O id e o uid do Firebase Auth.';
comment on column public.users.active_team_id is 'Time aberto no app. Sem FK: o vinculo real vive em team_members.';

create table public.teams (
  id text primary key,
  name text not null,
  slug text not null unique,
  logo_url text,
  banner_url text,
  presentation_video_url text,
  is_public boolean not null default false,
  city text,
  state text,
  neighborhood text,
  home_field_name text,
  contact_name text,
  contact_phone text,
  contact_whatsapp text,
  public_description text,
  allow_friendly_contact boolean not null default false,
  public_roster_enabled boolean not null default false,
  primary_color text not null,
  secondary_color text not null,
  accent_color text,
  description text,
  invite_code text not null,
  invite_code_updated_at timestamptz not null default now(),
  coach_name text not null default '',
  admin_user_id text not null references public.users (id),
  active_season_id text,
  default_match_cost_cents integer check (default_match_cost_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index teams_invite_code_idx on public.teams (invite_code);
create index teams_admin_user_id_idx on public.teams (admin_user_id);

create table public.seasons (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  name text not null,
  year integer not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index seasons_team_id_idx on public.seasons (team_id);

create table public.players (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  linked_user_id text references public.users (id),
  linked_email text,
  full_name text not null,
  nickname text not null,
  photo_url text,
  presentation_video_url text,
  intro_video_url text,
  celebration_video_url text,
  jersey_number integer not null default 0,
  primary_position text not null,
  secondary_positions text[] not null default '{}',
  preferred_position text,
  dominant_foot text not null default 'right'
    check (dominant_foot in ('right', 'left', 'both')),
  status text not null default 'active'
    check (status in ('active', 'injured', 'suspended', 'inactive')),
  bio text,
  allow_self_edit_jersey_number boolean not null default false,
  manual_stats jsonb,
  -- `always` para quem nunca paga (goleiro); `until` para cortesia com prazo.
  -- Prazo e data, nao contador de jogos: contador dessincroniza quando um jogo
  -- e cancelado, editado ou lancado fora de ordem.
  fee_exemption jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_team_id_idx on public.players (team_id);
create index players_linked_user_id_idx on public.players (linked_user_id)
  where linked_user_id is not null;
-- Resolucao por e-mail: o admin cadastra o jogador antes de a pessoa entrar.
create index players_team_linked_email_idx on public.players (team_id, lower(linked_email));

create table public.team_members (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  user_id text not null references public.users (id) on delete cascade,
  player_id text references public.players (id) on delete set null,
  invite_code_used text,
  roles text[] not null default '{player}',
  can_manage_team boolean not null default false,
  can_manage_players boolean not null default false,
  joined_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

comment on table public.team_members is
  'Fonte unica do vinculo pessoa-time. Aqui nao existe indice espelhado: no Postgres a policy consulta esta tabela direto.';

create index team_members_user_id_idx on public.team_members (user_id);
create index team_members_team_id_idx on public.team_members (team_id);

create table public.rating_criteria (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  label text not null,
  description text,
  type text not null check (type in ('positive', 'negative')),
  weight numeric not null default 1 check (weight > 0),
  active boolean not null default true,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rating_criteria_team_id_idx on public.rating_criteria (team_id);
