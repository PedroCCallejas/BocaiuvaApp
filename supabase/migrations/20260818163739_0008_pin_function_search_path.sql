-- search_path fixo nas tres funcoes que ficaram sem.
--
-- Sem isso, quem consegue criar objetos em outro schema pode sequestrar o nome
-- de uma funcao chamada aqui dentro. Nas `security definer` isso rodaria com
-- privilegio de dono.

alter function app.current_uid() set search_path = public, pg_temp;
alter function app.current_email() set search_path = public, pg_temp;
alter function app.touch_updated_at() set search_path = public, pg_temp;
