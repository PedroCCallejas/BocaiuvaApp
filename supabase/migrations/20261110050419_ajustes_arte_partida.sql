-- Applied to BocaApp on 2026-11-10 after explicit approval. No ACL or RLS changes.
alter table public.matches add column poster_settings jsonb;
alter table public.matches add constraint matches_poster_settings_valid check (
  poster_settings is null or
  case when jsonb_typeof(poster_settings) = 'object'
    and poster_settings ?& array['version','logoUrl','x','y','scale','removeBackground']
    and jsonb_typeof(poster_settings->'version') = 'number'
    and jsonb_typeof(poster_settings->'x') = 'number'
    and jsonb_typeof(poster_settings->'y') = 'number'
    and jsonb_typeof(poster_settings->'scale') = 'number'
    and jsonb_typeof(poster_settings->'removeBackground') = 'boolean'
    and jsonb_typeof(poster_settings->'logoUrl') in ('string','null')
  then (poster_settings->>'version')::numeric = 1
    and abs((poster_settings->>'x')::numeric) <= 300
    and abs((poster_settings->>'y')::numeric) <= 300
    and (poster_settings->>'scale')::numeric between 0.5 and 2.5
    and coalesce(length(poster_settings->>'logoUrl'),0) <= 4096
  else false end
);
comment on column public.matches.poster_settings is
  'Per-match artwork-only transform. logoUrl identifies the source; mismatches must use the default layout. Existing matches_write RLS governs changes.';
