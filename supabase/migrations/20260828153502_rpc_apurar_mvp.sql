create or replace function public.apurar_mvp_da_partida(p_match_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'app', 'pg_temp'
as $$
declare
  v_team_id text;
  v_total int;
  v_maior int;
  v_campeoes text[];
begin
  select team_id into v_team_id
  from public.matches
  where id = p_match_id and deleted_at is null;

  if v_team_id is null then
    raise exception 'Partida nao encontrada.' using errcode = '22023';
  end if;

  if not app.is_team_member(v_team_id) then
    raise exception 'Voce nao participa deste time.' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.mvp_votes where match_id = p_match_id;

  select max(votos) into v_maior
  from (
    select count(*) as votos
    from public.mvp_votes
    where match_id = p_match_id
    group by target_player_id
  ) contagem;

  if coalesce(v_maior, 0) = 0 then
    v_campeoes := array[]::text[];
  else
    select coalesce(array_agg(target_player_id order by target_player_id), array[]::text[])
      into v_campeoes
    from (
      select target_player_id, count(*) as votos
      from public.mvp_votes
      where match_id = p_match_id
      group by target_player_id
    ) contagem
    where contagem.votos = v_maior;
  end if;

  update public.matches
     set mvp_winner_player_ids = v_campeoes,
         mvp_total_votes = v_total,
         updated_at = now()
   where id = p_match_id;
end;
$$;

revoke all on function public.apurar_mvp_da_partida(text) from public, anon;
grant execute on function public.apurar_mvp_da_partida(text) to authenticated;;
