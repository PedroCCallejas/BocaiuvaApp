# Supabase Storage — política segura

Os buckets institucionais do time continuam públicos. Fotos e vídeos pessoais
de jogadores são privados e usam URLs assinadas com validade curta. Upload,
substituição e remoção exigem usuário autenticado pelo JWT Firebase.

## Buckets e caminhos aceitos

| Bucket | Caminho |
|---|---|
| `team-logos` | `{teamId}/logo.jpg` |
| `team-banners` | `{teamId}/banner.jpg` |
| `team-videos` | `{teamId}/presentation.mp4` |
| `player-photos` | `{teamId}/{playerId}.jpg` |
| `player-videos` | `{teamId}/{playerId}/presentation.mp4` |

## Autorização

- Logo, banner e vídeo do time: somente quem administra o time.
- Foto e vídeo de jogador: quem administra o elenco ou o próprio jogador.
- Mídia institucional do time: leitura pela URL pública do objeto.
- Mídia pessoal: membros autenticados podem ler; visitantes só recebem URL
  temporária quando time e elenco estão publicados.
- `anon INSERT`, `anon UPDATE` e `anon DELETE`: proibidos.

As policies e os helpers de validação estão nas migrations
`20260821071359_seguranca_pre_migracao.sql` e
`20260903051620_web_supabase_sem_firestore.sql`.

O helper valida bucket, quantidade de segmentos, nome/extensão do arquivo,
`teamId`, `playerId` e membership. Como o upload usa `upsert`, existem policies
autenticadas de `SELECT`, `INSERT` e `UPDATE`; a exclusão autenticada é usada na
limpeza de mídia do time.

## Pré-requisito de autenticação

O cliente em `src/config/supabase/client.ts` envia o ID token Firebase por
`accessToken`. Sem usuário logado, a chamada chega como `anon` e a escrita deve
ser recusada.

Nunca volte a liberar escrita anônima para resolver `permission denied`. Se um
upload legítimo falhar, conferir nesta ordem:

1. claim Firebase `role: authenticated`;
2. token atualizado da sessão;
3. membership ativa e `player_id` correto;
4. caminho gerado pelo app;
5. policy correspondente no banco remoto.
