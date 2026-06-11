# Supabase Storage Policies

## Buckets usados pelo app

| Bucket | Uso | Leitura |
| --- | --- | --- |
| `player-photos` | fotos de jogadores | pública |
| `team-logos` | escudos dos times | pública |
| `team-banners` | banners dos times | pública |
| `team-videos` | vídeo de apresentação do time | pública |
| `player-videos` | vídeos de apresentação/comemoração | pública |

## Variáveis de ambiente

- Preferir `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `EXPO_PUBLIC_SUPABASE_KEY` continua aceito apenas como fallback legado temporário.
- Manter `EXPO_PUBLIC_SUPABASE_URL` apontando para a raiz do projeto: `https://PROJECT_REF.supabase.co`.

## SQL sugerido para o MVP

```sql
insert into storage.buckets (id, name, public)
values
  ('player-photos', 'player-photos', true),
  ('team-logos', 'team-logos', true),
  ('team-banners', 'team-banners', true),
  ('team-videos', 'team-videos', true),
  ('player-videos', 'player-videos', true)
on conflict (id) do update
set public = excluded.public;
```

```sql
create policy "public read media buckets"
on storage.objects
for select
to public
using (
  bucket_id in (
    'player-photos',
    'team-logos',
    'team-banners',
    'team-videos',
    'player-videos'
  )
);
```

```sql
create policy "anon insert allowed media buckets"
on storage.objects
for insert
to anon
with check (
  bucket_id in (
    'player-photos',
    'team-logos',
    'team-banners',
    'team-videos',
    'player-videos'
  )
  and (
    (
      bucket_id in ('player-photos', 'team-logos', 'team-banners')
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
    or
    (
      bucket_id in ('team-videos', 'player-videos')
      and lower(storage.extension(name)) = 'mp4'
    )
  )
);
```

```sql
create policy "anon update allowed media buckets"
on storage.objects
for update
to anon
using (
  bucket_id in (
    'player-photos',
    'team-logos',
    'team-banners',
    'team-videos',
    'player-videos'
  )
)
with check (
  bucket_id in (
    'player-photos',
    'team-logos',
    'team-banners',
    'team-videos',
    'player-videos'
  )
  and (
    (
      bucket_id in ('player-photos', 'team-logos', 'team-banners')
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
    or
    (
      bucket_id in ('team-videos', 'player-videos')
      and lower(storage.extension(name)) = 'mp4'
    )
  )
);
```

```sql
create policy "deny client deletes on media buckets"
on storage.objects
for delete
to anon
using (false);
```

## Caminhos esperados pelo app

- `player-photos/{teamId}/{playerId}.jpg`
- `team-logos/{teamId}/logo.jpg`
- `team-banners/{teamId}/banner.jpg`
- `team-videos/{teamId}/presentation.mp4`
- `player-videos/{teamId}/{playerId}/presentation.mp4`

## Observações operacionais

- O app pode tentar limpar assets quando um time é excluído, mas isso não deve ser requisito para concluir a exclusão.
- Se o delete do Storage falhar, manter o aviso de limpeza pendente e não bloquear a exclusão do time.
- Antes do deploy público, validar manualmente no painel do Supabase se os cinco buckets existem e se as policies acima estão aplicadas.
