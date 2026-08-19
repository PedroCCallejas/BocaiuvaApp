-- O papel `authenticated` nao conseguia nem chamar as funcoes de permissao.
--
-- Toda policy chama `app.is_team_member(...)`, mas o schema `app` nunca teve
-- USAGE concedido. Resultado: qualquer consulta de usuario logado morreria com
-- "permission denied for schema app" — antes mesmo de a RLS decidir qualquer
-- coisa. RLS controla QUAIS linhas; o GRANT controla se da para chegar na mesa.
--
-- Descoberto simulando um JWT real dentro do banco, nao em producao.

grant usage on schema app to authenticated, anon;

grant execute on all functions in schema app to authenticated, anon;

-- Funcao criada depois desta migracao ja nasce chamavel.
alter default privileges in schema app
  grant execute on functions to authenticated, anon;

-- As funcoes sao `security definer` e so respondem sobre quem esta chamando:
-- `is_team_member` diz se EU sou membro, `current_player_id` devolve O MEU
-- jogador. Nao ha o que vazar chamando direto.

-- Acesso as tabelas. A RLS continua sendo quem filtra linha a linha; sem o
-- GRANT ela nem chega a ser avaliada.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
