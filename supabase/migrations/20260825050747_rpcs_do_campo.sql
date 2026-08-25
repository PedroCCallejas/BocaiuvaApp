-- Duas funções de campo que não deveriam ter existido.
--
-- Escritas antes de eu encontrar `salvar_custo_do_campo`, da migration das
-- partidas, que já resolve custo e participantes numa transação só. A migration
-- seguinte (`limpar_custo_do_campo`) derruba as duas.
--
-- Ficam registradas porque foram aplicadas de verdade no banco, e um histórico
-- que omite o que aconteceu deixa de servir para reconstruir o schema. O
-- arrependimento fica documentado no lugar certo: aqui.

create or replace function public.save_match_field_cost(
  p_match_id text,
  p_total_amount_cents bigint,
  p_split_count int,
  p_amount_per_player_cents bigint,
  p_note text default null,
  p_limpar boolean default false
)
returns void
language plpgsql
security invoker
set search_path to 'public', 'app', 'pg_temp'
as $$
begin
  if p_limpar then
    delete from public.match_field_participants where match_id = p_match_id;
    delete from public.match_field_costs where match_id = p_match_id;
    return;
  end if;

  insert into public.match_field_costs (
    match_id, total_amount_cents, split_count, amount_per_player_cents,
    note, updated_by_user_id, created_at, updated_at
  )
  values (
    p_match_id, p_total_amount_cents, p_split_count, p_amount_per_player_cents,
    nullif(btrim(coalesce(p_note, '')), ''), app.current_uid(), now(), now()
  )
  on conflict (match_id) do update
    set total_amount_cents = excluded.total_amount_cents,
        split_count = excluded.split_count,
        amount_per_player_cents = excluded.amount_per_player_cents,
        note = excluded.note,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now();
end;
$$;

create or replace function public.save_match_field_payment(
  p_match_id text,
  p_payer_player_ids text[],
  p_exempt_player_ids text[],
  p_paid_guest_count int default 0,
  p_pix_key text default null,
  p_responsible_name text default null,
  p_limpar boolean default false
)
returns void
language plpgsql
security invoker
set search_path to 'public', 'app', 'pg_temp'
as $$
begin
  delete from public.match_field_participants where match_id = p_match_id;

  if not p_limpar then
    insert into public.match_field_participants (match_id, player_id, role, created_at, updated_at)
    select p_match_id, pid, 'payer', now(), now()
    from unnest(coalesce(p_payer_player_ids, array[]::text[])) as pid
    on conflict (match_id, player_id) do nothing;

    insert into public.match_field_participants (match_id, player_id, role, created_at, updated_at)
    select p_match_id, pid, 'exempt', now(), now()
    from unnest(coalesce(p_exempt_player_ids, array[]::text[])) as pid
    on conflict (match_id, player_id) do nothing;
  end if;

  update public.match_field_costs
     set paid_guest_count = case when p_limpar then 0 else greatest(coalesce(p_paid_guest_count, 0), 0) end,
         pix_key = case when p_limpar then null else nullif(btrim(coalesce(p_pix_key, '')), '') end,
         responsible_name = case when p_limpar then null
                                 else nullif(btrim(coalesce(p_responsible_name, '')), '') end,
         updated_by_user_id = app.current_uid(),
         updated_at = now()
   where match_id = p_match_id;
end;
$$;

revoke all on function public.save_match_field_cost(text, bigint, int, bigint, text, boolean)
  from public, anon;
grant execute on function public.save_match_field_cost(text, bigint, int, bigint, text, boolean)
  to authenticated;

revoke all on function public.save_match_field_payment(text, text[], text[], int, text, text, boolean)
  from public, anon;
grant execute on function public.save_match_field_payment(text, text[], text[], int, text, text, boolean)
  to authenticated;
