-- Reconstrucao sem grants automaticos (Supabase #45329).
-- BYPASSRLS nao substitui os privilegios de tabela/coluna.
-- Aditiva: nao normaliza grants historicos nem altera RLS, defaults ou anon.
-- Fontes: as cinco Edge Functions em supabase/functions/ (ver docs/grants-explicitos.md).

-- exportar-dados e enviar-push: leituras diretas do cliente privilegiado.
grant select on table public.team_members, public.players, public.matches,
  public.match_diary_entries, public.expenses, public.push_subscriptions,
  public.notifications, public.attendance, public.mvp_votes, public.player_ratings
  to service_role;

-- excluir-conta: checagem de propriedade e filtro de DELETE da conta.
grant select (id, admin_user_id) on table public.teams to service_role;
grant select (id) on table public.users to service_role;
grant update (linked_user_id, linked_email, full_name, nickname, photo_url,
  presentation_video_url, intro_video_url, celebration_video_url, bio, updated_at)
  on table public.players to service_role;
grant delete on table public.users to service_role;

-- excluir-time e limpeza de endpoints expirados em enviar-push.
-- Cascatas e RPC SECURITY DEFINER nao exigem grants nas tabelas dependentes.
grant delete on table public.teams, public.push_subscriptions to service_role;
