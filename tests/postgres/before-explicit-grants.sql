-- Espera a falha anterior: BYPASSRLS sem SELECT continua recusado.
begin;
set local role service_role;
do $$
begin
  begin
    perform id from public.matches limit 1;
    raise exception 'Baseline inesperadamente ja tem SELECT service_role';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
