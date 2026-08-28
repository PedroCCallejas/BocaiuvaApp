-- Apuração do MVP: quem vota é jogador, quem grava o placar do MVP é o admin.
--
-- Esse descompasso é o bug. `matches_write` exige `can_manage_team`, então o
-- jogador comum grava o voto e não consegue atualizar `mvp_winner_player_ids` e
-- `mvp_total_votes`. Pior: `UPDATE` que não casa linha nenhuma **não dá erro** —
-- o voto entrava, a contagem ficava parada, e ninguém percebia.
--
-- É o mesmo problema que já tivemos no Firestore, onde a escrita do agregado
-- pós-voto era recusada para quem não era admin. Lá pelo menos dava erro.
--
-- `security definer` com escopo mínimo: a função recalcula a partir dos votos
-- que já estão gravados e toca apenas nas duas colunas de MVP. Não recebe o
-- resultado por parâmetro de propósito — se recebesse, viraria uma porta para
-- qualquer membro declarar a si mesmo campeão.

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

  -- A RLS não protege mais aqui dentro: a checagem é responsabilidade nossa.
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
    -- Empate mantém todos os empatados: escolher um seria inventar resultado.
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
grant execute on function public.apurar_mvp_da_partida(text) to authenticated;
