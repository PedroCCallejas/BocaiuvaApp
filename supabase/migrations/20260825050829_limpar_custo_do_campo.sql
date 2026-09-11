-- Desfaz as duas funcoes criadas por engano: `salvar_custo_do_campo` ja cobre
-- gravar custo e participantes numa transacao so. Duas rotinas para a mesma
-- coisa e a receita para uma delas ficar para tras.
drop function if exists public.save_match_field_cost(text, bigint, int, bigint, text, boolean);
drop function if exists public.save_match_field_payment(text, text[], text[], int, text, text, boolean);

-- O que faltava de verdade: tirar o valor do campo.
--
-- Some o custo e os participantes juntos, porque cota que nao existe mais nao
-- tem como ter pagante. E o mesmo que o Firestore fazia ao zerar `fieldPayment`
-- quando `fieldCost` virava null.
--
-- `security invoker`: a policy `match_field_costs_write` ja exige
-- `can_manage_team`. Aqui so se ganha a transacao.
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
grant execute on function public.limpar_custo_do_campo(text) to authenticated;;
