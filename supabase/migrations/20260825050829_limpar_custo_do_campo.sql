-- Remover o valor do campo de uma partida.
--
-- Também derruba `save_match_field_cost` e `save_match_field_payment`, criadas
-- na migration anterior antes de eu encontrar `salvar_custo_do_campo`, que já
-- fazia o trabalho. Duas rotinas para a mesma coisa é a receita para uma delas
-- ficar para trás.
--
-- `salvar_custo_do_campo` (migration das partidas) já grava custo e
-- participantes numa transação só, e é usada tanto pelo encerramento quanto
-- pela edição. O que não existia era o caminho inverso: apagar.
--
-- Some o custo e os participantes juntos, porque cota que não existe mais não
-- tem como ter pagante. É o mesmo que o Firestore fazia ao zerar `fieldPayment`
-- quando `fieldCost` virava null.
--
-- `security invoker`: a policy `match_field_costs_write` já exige
-- `can_manage_team`, então quem decide a permissão continua sendo a RLS. Aqui
-- só se ganha a transação. `security definer` seria furar uma porta que já está
-- aberta para quem pode passar.

drop function if exists public.save_match_field_cost(text, bigint, int, bigint, text, boolean);
drop function if exists public.save_match_field_payment(text, text[], text[], int, text, text, boolean);

create or replace function public.limpar_custo_do_campo(p_match_id text)
returns void
language plpgsql
security invoker
set search_path to 'public', 'app', 'pg_temp'
as $$
begin
  delete from public.match_field_participants where match_id = p_match_id;
  delete from public.match_field_costs where match_id = p_match_id;
end;
$$;

revoke all on function public.limpar_custo_do_campo(text) from public, anon;
grant execute on function public.limpar_custo_do_campo(text) to authenticated;
