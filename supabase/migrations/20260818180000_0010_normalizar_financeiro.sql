-- Rateio deixa de ser array e vira relacao.
--
-- `participant_player_ids`, `settled_player_ids` e `manual_shares_cents` eram
-- tres listas paralelas descrevendo a mesma coisa: quanto cada pessoa deve
-- naquela despesa e se ja acertou. Lista paralela nao tem como o banco garantir
-- que estao coerentes — e foi exatamente ai que nasceram os bugs de participante
-- errado no rateio e de isento virando devedor.
--
-- Com uma linha por pessoa, "quanto o jogador X deve" vira uma consulta com
-- sum() em vez de carregar todas as despesas e somar na memoria do celular.

create table public.expense_shares (
  expense_id text not null references public.expenses (id) on delete cascade,
  player_id text not null references public.players (id) on delete cascade,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  -- Nulo = ainda deve. Data = acertou naquele momento.
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Impede cota duplicada da mesma pessoa na mesma despesa.
  primary key (expense_id, player_id)
);

create index expense_shares_player_id_idx on public.expense_shares (player_id);
-- A pergunta do painel de pendencias: quem ainda deve.
create index expense_shares_em_aberto_idx on public.expense_shares (player_id)
  where settled_at is null;

alter table public.expenses drop column participant_player_ids;
alter table public.expenses drop column settled_player_ids;
alter table public.expenses drop column manual_shares_cents;

comment on table public.expense_shares is
  'Cota de cada participante numa despesa. Substitui as listas paralelas do Firestore.';

-- Custo do campo sai de dentro do documento da partida.
--
-- Era jsonb com `payerPlayerIds` e `exemptPlayerIds` dentro. Nada impedia a
-- mesma pessoa de aparecer nas duas listas — que e uma contradicao (pagou e nao
-- paga), e precisou ser barrada na mao no codigo.

create table public.match_field_costs (
  match_id text primary key references public.matches (id) on delete cascade,
  -- Centavos inteiros. No Firestore isso era float em reais, e float em dinheiro
  -- fecha conta errada.
  total_amount_cents integer not null default 0 check (total_amount_cents >= 0),
  split_count integer not null default 0 check (split_count >= 0),
  amount_per_player_cents integer not null default 0 check (amount_per_player_cents >= 0),
  note text,
  pix_key text,
  responsible_name text,
  paid_guest_count integer not null default 0 check (paid_guest_count >= 0),
  updated_by_user_id text references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_field_participants (
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null references public.players (id) on delete cascade,
  -- `payer` pagou a cota; `exempt` jogou mas o time decidiu que nao rateia
  -- (goleiro convidado, aniversariante).
  role text not null check (role in ('payer', 'exempt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A chave primaria e a garantia: uma pessoa tem UM papel por partida, entao
  -- pagante e isento ao mesmo tempo deixa de ser possivel por construcao.
  primary key (match_id, player_id)
);

create index match_field_participants_player_idx
  on public.match_field_participants (player_id);

alter table public.matches drop column field_cost;
alter table public.matches drop column field_payment;

comment on table public.match_field_participants is
  'Quem pagou e quem esta isento do rateio do campo. A chave impede os dois papeis para a mesma pessoa.';
