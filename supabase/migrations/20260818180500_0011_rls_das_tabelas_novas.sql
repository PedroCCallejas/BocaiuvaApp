-- RLS das tabelas criadas em 0010.
--
-- As novas nao tem `team_id` proprio de proposito: o time vem do pai, e duplicar
-- a coluna abriria espaco para ela divergir. As policies consultam o pai.

alter table public.expense_shares enable row level security;
alter table public.match_field_costs enable row level security;
alter table public.match_field_participants enable row level security;

-- Cota de despesa acompanha a despesa: financeiro e so de quem administra.
create policy expense_shares_all on public.expense_shares
  for all to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_shares.expense_id and app.can_manage_team(e.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_shares.expense_id and app.can_manage_team(e.team_id)
    )
  );

-- Custo do campo era campo da partida, que todo membro le. Manter assim: o time
-- precisa ver quanto ficou e quem pagou.
create policy match_field_costs_select on public.match_field_costs
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_field_costs.match_id and app.is_team_member(m.team_id)
    )
  );

create policy match_field_costs_write on public.match_field_costs
  for all to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_field_costs.match_id and app.can_manage_team(m.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_field_costs.match_id and app.can_manage_team(m.team_id)
    )
  );

create policy match_field_participants_select on public.match_field_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_field_participants.match_id and app.is_team_member(m.team_id)
    )
  );

create policy match_field_participants_write on public.match_field_participants
  for all to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_field_participants.match_id and app.can_manage_team(m.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_field_participants.match_id and app.can_manage_team(m.team_id)
    )
  );

-- updated_at automatico, igual as demais.
do $$
declare
  t text;
begin
  foreach t in array array[
    'expense_shares', 'match_field_costs', 'match_field_participants'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function app.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;
