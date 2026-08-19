-- Ajustes vindos da auditoria do banco atual, antes de importar qualquer coisa.

-- 1. Codigo de convite precisa ser unico.
--
-- No Firestore a colecao `teamInvites` usa o proprio codigo como id do
-- documento, o que garantia unicidade de graca. Aqui o codigo virou uma coluna
-- em `teams`, e sem esta restricao dois times poderiam ter o mesmo codigo —
-- "entrar no time com o codigo" ficaria ambiguo, entrando no time errado.
--
-- Se a importacao falhar por esta restricao, o dado ja esta divergente hoje e
-- precisa ser resolvido antes, nao depois.
create unique index teams_invite_code_unico_idx on public.teams (invite_code);
drop index if exists teams_invite_code_idx;

-- 2. Referencias que nao valem perder a linha inteira.
--
-- FK obrigatoria significa "sem isto a linha nao entra". Para dono do time e
-- autor, isso e desproporcional: um documento de usuario apagado derrubaria o
-- time inteiro — e, em cascata, elenco, partidas e historico.
--
-- Perder de quem foi a autoria e ruim. Perder o time e catastrofico.
alter table public.teams alter column admin_user_id drop not null;
alter table public.matches alter column created_by drop not null;
alter table public.match_diary_entries alter column author_user_id drop not null;

-- 3. Conta sem e-mail nao pode sumir.
--
-- `normalizeUserDocument` nao garante `email`. Descartar o usuario levaria
-- junto os times onde ele e dono e as partidas que ele criou.
alter table public.users alter column email drop not null;

comment on index public.teams_invite_code_unico_idx is
  'Substitui a unicidade que vinha do id do documento em teamInvites.';
