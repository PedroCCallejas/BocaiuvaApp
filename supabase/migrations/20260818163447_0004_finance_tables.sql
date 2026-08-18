-- Financeiro.
--
-- Dinheiro em centavos inteiros, sempre. Float aqui vira R$ 10,999 no extrato e
-- a conta do rateio nunca fecha.

create table public.expense_categories (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  label text not null,
  -- Arquivar em vez de apagar: as despesas antigas apontam para a categoria e
  -- perderiam o nome.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expense_categories_team_id_idx on public.expense_categories (team_id);

create table public.expenses (
  id text primary key,
  team_id text not null references public.teams (id) on delete cascade,
  category_id text not null references public.expense_categories (id),
  -- Despesa nasce solta: so ganha partida quando o admin escolhe vincular.
  match_id text references public.matches (id) on delete set null,
  description text,
  date date not null,
  total_amount_cents integer not null check (total_amount_cents >= 0),
  paid_by_player_id text references public.players (id) on delete set null,
  split_mode text not null default 'equal'
    check (split_mode in ('equal', 'manual')),
  -- Quem consumiu nao e necessariamente quem jogou: a lista e sempre manual.
  participant_player_ids text[] not null default '{}',
  extra_shares_count integer not null default 0 check (extra_shares_count >= 0),
  manual_shares_cents jsonb,
  settled_player_ids text[] not null default '{}',
  created_by text references public.users (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_team_date_idx on public.expenses (team_id, date desc)
  where deleted_at is null;
create index expenses_match_id_idx on public.expenses (match_id)
  where match_id is not null;
create index expenses_category_id_idx on public.expenses (category_id);
