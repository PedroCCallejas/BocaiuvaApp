# Migração Firestore → Postgres (Supabase)

## Por que

O Firestore cobra por **documento lido**. O histórico do time só cresce, e todo
mundo relê tudo a cada abertura do app. Em agosto batemos o teto de 50 mil
leituras/dia — e quando isso acontece o app inteiro para de gravar: presença,
voto, avaliação, despesa.

O caso mais grave é `playerRatings`, que cresce ao **quadrado** do elenco:
15 avaliadores × 15 avaliados = ~225 documentos por partida. Em 50 partidas são
~11 mil documentos que cada pessoa relê ao abrir o app.

No Postgres a mesma consulta é **uma requisição**, não 11 mil. O Supabase cobra
por banda e armazenamento, não por linha lida. O problema deixa de existir como
categoria — não é otimizado, é eliminado.

## Decisões tomadas

| Assunto | Decisão | Motivo |
|---|---|---|
| Login | **Continua no Firebase Auth** | O Supabase aceita o JWT do Firebase e usa nas policies de RLS. Migramos dados, não pessoas: ninguém recria conta. |
| Projeto | **BocaApp** (`xepbopkhsprfemqjzrkm`) | Já existia, `sa-east-1` (São Paulo), Postgres 17. Latência baixa e nada a montar do zero. |
| IDs | **`text`, mantendo o id atual do Firestore** | `uuid` exigiria uma tabela de-para durante toda a convivência dos dois bancos. Qualquer erro nela vira dado órfão. |
| Listas simples | **`text[]`** | `participantPlayerIds`, `benchPlayerIds` etc. Tabela de junção multiplicaria a superfície da migração sem ganho real nesta escala. |
| Estruturas | **`jsonb`** | `scoreboard`, `fieldCost`, `starters`, `criteriaSnapshot`. São documentos de verdade, não relações. |
| Enums | **`text` + `check`** | Enum de Postgres exige migração para cada valor novo. O app evolui rápido demais para isso. |
| Dinheiro | **centavos inteiros** | Float vira R$ 10,999 no extrato e o rateio nunca fecha. |

## O que a migração conserta de quebra

Três bugs de permissão em três dias tiveram a **mesma raiz**: regra do Firestore
não consegue consultar coleção. Para saber "essa pessoa é qual jogador do time?"
foi preciso manter um índice espelhado (`teamMembershipIndex`) — e quando ele
ficava sem `playerId`, a pessoa levava `permission-denied` ao confirmar presença,
votar no MVP e avaliar, enquanto o colega de time conseguia.

No Postgres isso é `app.current_player_id(team_id)`: uma função, um lugar, que
aceita as duas fontes (vínculo gravado ou cadastro reservado por uid/e-mail).
O índice espelhado simplesmente não existe.

## Schema

Migrações versionadas em `supabase/migrations/`:

| Arquivo | Conteúdo |
|---|---|
| `0001_auth_helpers` | `app.current_uid()` e `app.current_email()` a partir do JWT |
| `0002_core_tables` | `users`, `teams`, `seasons`, `players`, `team_members`, `rating_criteria` |
| `0003_match_tables` | `matches`, `lineups`, `attendance`, `match_stats`, `mvp_votes`, `player_ratings`, `match_diary_entries`, `notifications` |
| `0004_finance_tables` | `expense_categories`, `expenses` |
| `0005_permission_helpers` | `is_team_member`, `can_manage_team`, `can_manage_players`, `current_player_id`, `is_team_player` |
| `0006_row_level_security` | RLS ligada nas 16 tabelas, 40 policies |
| `0007_column_guards_and_touch` | Triggers de coluna protegida + `updated_at` automático |
| `0008_pin_function_search_path` | `search_path` fixo nas funções |

**Por que os triggers de coluna:** RLS decide *quem* escreve na linha, não
*quais colunas*. Sem eles, "editar o próprio perfil" deixaria a pessoa mudar o
próprio vínculo, status e estatísticas — escalada de privilégio disfarçada de
edição de perfil.

## Fases

### Fase 0 — Schema ✅ concluída

Tabelas, RLS, helpers e triggers no ar. **Nenhum dado migrado, app intocado.**

### Fase 1 — Ligar o Supabase ao Firebase Auth

No painel do Supabase: Authentication → Third-Party Auth → Firebase, apontando
para o projeto `bocaiuva-app`. Também é preciso o custom claim
`role: 'authenticated'` nos usuários do Firebase — o JWT do Firebase não traz
esse campo, e sem ele a RLS recusa tudo.

> Isso mexe em autenticação. Não faço sem pedido explícito.

### Fase 2 — Importação inicial

Script que lê o Firestore com service account e grava no Postgres com service
key (que ignora RLS). Roda quantas vezes for preciso: `upsert` por id, e como os
ids são os mesmos, reimportar é idempotente.

Ordem obrigatória por causa das FKs: `users` → `teams` → `players` →
`team_members` → `seasons` → `matches` → resto.

### Fase 3 — Escrita dupla

O repositório passa a gravar nos dois bancos. Firestore continua sendo a fonte
de leitura. Se o Supabase falhar, a ação **não** falha — é só sombra.

Serve para provar em produção, com dado real, que o schema aguenta tudo que o
app manda. Dura o tempo que precisar.

### Fase 4 — Leitura, módulo a módulo

Um módulo por vez muda a fonte de leitura para o Postgres. Ordem sugerida, do
menor risco para o maior:

1. **Financeiro** — o mais novo, o mais isolado, o de menos dado
2. **Estatísticas e avaliações** — onde está o ganho de cota
3. **Partidas e presença**
4. **Elenco e time**

Cada módulo é reversível sozinho: basta apontar a leitura de volta.

### Fase 5 — Desligar o Firestore

Só quando todos os módulos estiverem lendo do Postgres por tempo suficiente.
Firestore vira backup frio.

## Por que isso é viável

`AppRepository` tem **56 métodos** num contrato só, e **nenhuma tela acessa o
Firestore direto** — verificado. Um `supabase-repository.ts` implementa o mesmo
contrato e a escolha vira uma flag.

Foi o que tornou a decisão de arquitetura de meses atrás valer a pena agora.

## O que ainda não está resolvido

- **Tempo real.** Hoje são 13 listeners do Firestore. O Supabase Realtime existe
  mas funciona diferente. Talvez a resposta seja simplesmente não ter tempo real
  em tudo — boa parte dessas telas não precisa.
- **Cache offline.** O Firestore tem persistência em disco pronta. No Supabase
  isso passa a ser problema nosso.
- **Storage.** As imagens já estão no Supabase, mas o bucket do projeto BocaApp
  está vazio — precisa conferir se apontam para outro projeto.
