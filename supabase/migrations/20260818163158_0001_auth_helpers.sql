-- Helpers de identidade e permissao.
--
-- O login continua no Firebase: o Supabase recebe o JWT dele e `sub` carrega o
-- uid. Nenhum jogador precisa recriar conta.
--
-- Estas funcoes existem para dar UM lugar onde mora a resposta de "quem e essa
-- pessoa neste time". No Firestore essa resposta estava espalhada por regras que
-- nao conseguiam consultar colecoes, o que obrigou a manter um indice espelhado
-- e gerou uma sequencia de bugs de permissao.

create schema if not exists app;

comment on schema app is 'Funcoes de apoio a RLS. Nada de dado de negocio aqui.';

create or replace function app.current_uid()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'sub', '')
$$;

create or replace function app.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

comment on function app.current_uid is 'uid do Firebase que assinou o JWT desta requisicao.';
