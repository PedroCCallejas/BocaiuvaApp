-- Permite apagar a conta sem apagar o histórico legítimo do time.
-- Campos de autoria ficam nulos; vínculos pessoais e assinaturas já usam
-- cascade ou são anonimizados pela Edge Function antes da exclusão.

alter table public.teams
  drop constraint if exists teams_admin_user_id_fkey,
  add constraint teams_admin_user_id_fkey
    foreign key (admin_user_id) references public.users (id) on delete set null;

alter table public.players
  drop constraint if exists players_linked_user_id_fkey,
  add constraint players_linked_user_id_fkey
    foreign key (linked_user_id) references public.users (id) on delete set null;

alter table public.matches
  drop constraint if exists matches_created_by_fkey,
  drop constraint if exists matches_manual_mvp_selected_by_fkey,
  drop constraint if exists matches_deleted_by_fkey,
  add constraint matches_created_by_fkey
    foreign key (created_by) references public.users (id) on delete set null,
  add constraint matches_manual_mvp_selected_by_fkey
    foreign key (manual_mvp_selected_by) references public.users (id) on delete set null,
  add constraint matches_deleted_by_fkey
    foreign key (deleted_by) references public.users (id) on delete set null;

alter table public.match_diary_entries
  drop constraint if exists match_diary_entries_author_user_id_fkey,
  add constraint match_diary_entries_author_user_id_fkey
    foreign key (author_user_id) references public.users (id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_actor_user_id_fkey,
  add constraint notifications_actor_user_id_fkey
    foreign key (actor_user_id) references public.users (id) on delete set null;

alter table public.expenses
  drop constraint if exists expenses_created_by_fkey,
  add constraint expenses_created_by_fkey
    foreign key (created_by) references public.users (id) on delete set null;

alter table public.match_field_costs
  drop constraint if exists match_field_costs_updated_by_user_id_fkey,
  add constraint match_field_costs_updated_by_user_id_fkey
    foreign key (updated_by_user_id) references public.users (id) on delete set null;
