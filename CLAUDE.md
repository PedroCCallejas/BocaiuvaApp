# Professô FC — guia do Claude

Responda sempre em **português do Brasil**.

**Governança é a Constitution:** [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
Ela define princípios, fluxo de trabalho, portões de qualidade e o formato da
resposta final — e prevalece sobre este arquivo. O que está aqui é o mapa
operacional: onde as coisas ficam e o que morde.

## Onde os dados vivem

**Supabase Postgres é a única fonte de dados do produto.** Firebase é só Auth.

- `src/services/repository/index.ts` monta o repositório Supabase sempre.
  `EXPO_PUBLIC_DATA_SOURCE=mock` é a única chave que desvia disso, e só em
  desenvolvimento local.
- `src/services/repository/supabase/composicao/` aplica 6 camadas sobre `base.ts`: financeiro, resenhas,
  partidas, avaliações, elenco, notificações. **A ordem importa e `elenco` fica
  por último** — é ela que define o contexto da sessão.
- O login é Firebase e continua sendo. O Supabase valida esse JWT como provedor
  de terceiros, e isso depende do custom claim `role: authenticated`. Sem o
  claim, todo mundo chega como `anon` e as policies recusam tudo.

**Firestore é legado.** `firebase-repository.ts` e `legacy-firestore-client.ts`
existem para as ferramentas de migração; o app ativo não os importa. Não crie
leitura nem escrita nova no Firestore.

**O app é web-only hoje.** `app.config.ts` declara `plugins: ['expo-router']`,
não há `/ios` nem `/android`, e não há build EAS. Anúncios são **AdSense web**
(`src/config/ads.ts`), não AdMob. Avisos são **Web Push** (`public/sw.js` + Edge
Function `enviar-push`), não `expo-notifications`.

## Mapa

| Procurando | Vá em |
|---|---|
| Quem decide acesso, mapa de domínio, ordem das camadas, fatias | [`docs/arquitetura-dados.md`](docs/arquitetura-dados.md) |
| Arquitetura, privacidade de mídia, Storage, procedimento de release | [`README.md`](README.md) |
| Schema vivo do banco | `supabase/migrations/` (26 arquivos, ordem cronológica) |
| Permissões | RLS e helpers `app.*` nas migrations — não no cliente ([autoridade](docs/arquitetura-dados.md)) |
| Regras de domínio | `src/lib/` (limites, cálculo, elegibilidade) |
| Telas e rotas | `src/app/` (Expo Router; `.native.tsx` vence no mobile) |
| Estado da UI | `src/store/` (Zustand, sobre o snapshot único) |
| Lógica privilegiada | `supabase/functions/` (5 Edge Functions) |
| Histórico da migração | `docs/` — os marcados como STATUS histórico são registro, não roteiro |

## Armadilhas que já morderam

Ausência de dado é indistinguível de ausência de acesso. Quando algo aparecer
"vazio" ou "zerado", suspeite de leitura, não de dado apagado.

- **PostgREST corta em 1000 linhas, sem erro.** Toda leitura de coleção que
  cresce usa `todasAsLinhas` (`src/services/repository/supabase/paginacao.ts`), com `order` estável. Sem
  isso o ranking somou 60% das presenças e ninguém percebeu.
- **UPDATE/DELETE sem `.eq()` é recusado.** O `safeupdate` do PostgREST barra
  antes da RLS. Toda escrita diz em qual linha mexe.
- **Sem token, a RLS devolve zero linhas em silêncio.** `getFirebaseAccessToken`
  espera `authStateReady()` e falha se não houver sessão.

## Validação

```bash
npm run typecheck    # tsc --noEmit
npm run test         # 600 testes; runner próprio em tests/run-tests.ts
npm run build:web    # expo export --platform web — antes de deploy
```

Não existe `npm run lint` neste projeto. Não invente o comando.

**21 arquivos de teste leem o próprio código-fonte com `readFileSync`** para
congelar invariantes ("tal variável não pode reaparecer"). Se um teste desses
falhar, o alvo é a invariante, não o teste.

O CI (`.github/workflows/ci.yml`) roda typecheck, test, build:web e
`npm audit --omit=dev --audit-level=high` em PR e push na main.

Os testes SQL em `supabase/tests/` não têm runner npm e não rodam no CI.

## Operações perigosas

Nenhuma destas sem pedido explícito, a cada vez (Constitution V):

| Operação | Por quê |
|---|---|
| `npm run migrar:postgres` | Grava com `service_role` ignorando RLS, sobrescrevendo o Postgres vivo com o Firestore congelado. Há trava por módulo migrado — **`--forcar=<tabela>` a desarma** |
| `npm run auth:claim` | Escreve custom claims em usuários reais do Firebase |
| `npm run backfill:membership-index`, `npm run repair:players-linked-email` | Escrevem em massa no Firestore, hoje legado |
| Edge `excluir-conta`, `excluir-time` | Exclusão real com privilégio |
| Aplicar migration, publicar Edge Function | Sem caminho de volta. Procedimento no README |
| Deploy Vercel, `eas build`, `expo start` | Fora do fluxo normal |
| `firestore.rules`, `.env`, `secrets/`, `google-services.json` | Segredos e superfície de acesso (Constitution IV) |

Quase todo script de escrita tem par `:dry`. Rode o `:dry` primeiro, sempre.
