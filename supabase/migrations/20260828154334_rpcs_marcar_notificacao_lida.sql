create or replace function public.marcar_notificacao_lida(p_notification_id text)
returns void
language plpgsql
security invoker
set search_path to 'public', 'app', 'pg_temp'
as $$
declare
  v_uid text := app.current_uid();
begin
  if v_uid = '' then
    raise exception 'Autenticacao obrigatoria.' using errcode = '28000';
  end if;

  update public.notifications
     set read_by_user_ids = array_append(read_by_user_ids, v_uid),
         updated_at = now()
   where id = p_notification_id
     and not (v_uid = any(read_by_user_ids));
end;
$$;

create or replace function public.marcar_notificacoes_lidas(p_team_id text)
returns void
language plpgsql
security invoker
set search_path to 'public', 'app', 'pg_temp'
as $$
declare
  v_uid text := app.current_uid();
begin
  if v_uid = '' then
    raise exception 'Autenticacao obrigatoria.' using errcode = '28000';
  end if;

  update public.notifications
     set read_by_user_ids = array_append(read_by_user_ids, v_uid),
         updated_at = now()
   where team_id = p_team_id
     and not (v_uid = any(read_by_user_ids));
end;
$$;

revoke all on function public.marcar_notificacao_lida(text) from public, anon;
grant execute on function public.marcar_notificacao_lida(text) to authenticated;

revoke all on function public.marcar_notificacoes_lidas(text) from public, anon;
grant execute on function public.marcar_notificacoes_lidas(text) to authenticated;;
