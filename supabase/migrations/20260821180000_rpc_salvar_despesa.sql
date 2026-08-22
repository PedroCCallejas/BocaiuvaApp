-- Salvar despesa e rateio numa transacao so.
--
-- A despesa vive em `expenses` e o rateio em `expense_shares`. Duas escritas
-- separadas do cliente podem falhar pela metade: sobra despesa sem cota, e o
-- painel de pendencias passa a mentir sobre quem deve o que.
--
-- Ja aprendemos isso no voto de MVP, onde meia escrita gravou o voto e mostrou
-- erro. Aqui a funcao resolve na origem: ou entra tudo, ou nao entra nada.
--
-- `security invoker` de proposito. A funcao NAO ganha privilegio: a RLS de
-- `expenses` e `expense_shares` continua valendo para quem chamou, entao o
-- financeiro segue restrito a quem administra o time. Uma `security definer`
-- aqui viraria um buraco por onde qualquer membro gravaria despesa.

create or replace function public.salvar_despesa(
  p_expense jsonb,
  p_cotas jsonb default '[]'::jsonb
)
returns public.expenses
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_expense public.expenses;
  v_id text := nullif(p_expense ->> 'id', '');
begin
  if v_id is null then
    raise exception 'A despesa precisa de um id.' using errcode = '22023';
  end if;

  insert into public.expenses (
    id, team_id, category_id, match_id, description, date,
    total_amount_cents, paid_by_player_id, split_mode, extra_shares_count,
    created_by, deleted_at, created_at, updated_at
  )
  values (
    v_id,
    p_expense ->> 'team_id',
    p_expense ->> 'category_id',
    nullif(p_expense ->> 'match_id', ''),
    nullif(p_expense ->> 'description', ''),
    (p_expense ->> 'date')::date,
    coalesce((p_expense ->> 'total_amount_cents')::integer, 0),
    nullif(p_expense ->> 'paid_by_player_id', ''),
    coalesce(p_expense ->> 'split_mode', 'equal'),
    coalesce((p_expense ->> 'extra_shares_count')::integer, 0),
    nullif(p_expense ->> 'created_by', ''),
    nullif(p_expense ->> 'deleted_at', '')::timestamptz,
    coalesce(nullif(p_expense ->> 'created_at', '')::timestamptz, now()),
    now()
  )
  on conflict (id) do update set
    category_id = excluded.category_id,
    match_id = excluded.match_id,
    description = excluded.description,
    date = excluded.date,
    total_amount_cents = excluded.total_amount_cents,
    paid_by_player_id = excluded.paid_by_player_id,
    split_mode = excluded.split_mode,
    extra_shares_count = excluded.extra_shares_count,
    deleted_at = excluded.deleted_at,
    updated_at = now()
    -- `team_id` e `created_by` ficam de fora: despesa nao troca de time nem
    -- de autor. Deixar no update abriria caminho para mover dado entre times.
  returning * into v_expense;

  -- Trocar o conjunto inteiro em vez de tentar casar linha a linha. O rateio e
  -- pequeno e recalculado junto; diferenca incremental so traria caso de borda.
  delete from public.expense_shares where expense_id = v_id;

  insert into public.expense_shares (expense_id, player_id, amount_cents, settled_at)
  select
    v_id,
    cota ->> 'player_id',
    coalesce((cota ->> 'amount_cents')::integer, 0),
    nullif(cota ->> 'settled_at', '')::timestamptz
  from jsonb_array_elements(coalesce(p_cotas, '[]'::jsonb)) as cota
  where coalesce(cota ->> 'player_id', '') <> '';

  return v_expense;
end;
$$;

comment on function public.salvar_despesa is
  'Grava despesa e rateio numa transacao. Respeita a RLS de quem chamou.';

-- `authenticated` pode chamar; a RLS decide se a escrita passa.
grant execute on function public.salvar_despesa(jsonb, jsonb) to authenticated;
