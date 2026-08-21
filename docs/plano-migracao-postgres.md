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
| Listas simples | **`text[]`** | `benchPlayerIds`, `secondaryPositions` — conjuntos sem atributo nenhum. |
| Relação com atributo | **tabela** | Rateio de despesa e pagamento do campo. Ver abaixo. |
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

## Auditoria do Firestore atual

Feita lendo o código que **escreve** no Firestore (`FIRESTORE_COLLECTIONS` e os
normalizadores), sem gastar cota.

### Coleções que existem e não vão para o Postgres

| Coleção | Por quê |
|---|---|
| `publicTeams` | Projeção denormalizada do time público, gerada por `syncPublicTeamProjection`. No Postgres é uma consulta com `where is_public`. |
| `teamInvites` | Documento cujo id **é** o código de convite; todos os campos são cópia do time. Vira `select * from teams where invite_code = ?`. |
| `teamMembershipIndex` | O índice espelhado que existia só porque regra do Firestore não consulta coleção. É justamente o que a migração elimina. |

### O que a auditoria corrigiu antes de importar

**1. Código de convite sem unicidade.** No Firestore o código era o id do
documento, então era único de graça. Como coluna em `teams`, dois times podiam
ficar com o mesmo código e "entrar com o código" levaria ao time errado. Virou
índice único.

> Se a importação falhar aí, o dado já está divergente hoje — e é melhor
> descobrir agora do que depois que o app depender disso.

**2. Três chaves estrangeiras que não valiam perder a linha.** `admin_user_id`
do time, `created_by` da partida e `author_user_id` da resenha eram
obrigatórias. Um documento de usuário apagado descartaria o **time inteiro** e,
em cascata, elenco, partidas e histórico. Perder de quem foi a autoria é ruim;
perder o time é catastrófico. Passaram a opcionais.

**3. Conta sem e-mail.** `normalizeUserDocument` não garante o campo, e o
mapeador descartava esses usuários — levando junto os times de que são donos.
A coluna virou anulável.

## O financeiro deixou de ser array

Primeira versão do schema copiava o Firestore: três listas paralelas em
`expenses` (`participant_player_ids`, `settled_player_ids`,
`manual_shares_cents`) e um `jsonb` em `matches` com `payerPlayerIds` e
`exemptPlayerIds` dentro.

Isso não é documento — é **relação com atributo**. E lista paralela não tem como
o banco garantir coerência. Foi exatamente daí que nasceram os bugs que a gente
já corrigiu na mão: participante errado no rateio, isento virando devedor.

| Antes | Agora |
|---|---|
| `expenses.participant_player_ids` + `settled_player_ids` + `manual_shares_cents` | `expense_shares (expense_id, player_id, amount_cents, settled_at)` |
| `matches.field_cost` + `field_payment` (jsonb) | `match_field_costs` + `match_field_participants (match_id, player_id, role)` |

O que muda na prática:

- **"quanto o jogador X deve"** vira `sum()` no banco, em vez de carregar todas
  as despesas e somar na memória do celular;
- a **chave primária** `(match_id, player_id)` torna "pagante e isento ao mesmo
  tempo" impossível por construção — antes era uma checagem em código;
- o custo do campo virou **centavos inteiros**. No Firestore era `float` em
  reais, e float em dinheiro fecha conta errada.

O valor da cota é **congelado na importação**, não recalculado. O rateio já foi
combinado e cobrado no mundo real; recalcular depois mudaria quanto alguém deve
num acerto que já aconteceu.

## Fases

### Fase 0 — Schema e carga inicial ✅ concluídos parcialmente

O projeto remoto já possui schema e uma carga inicial. O histórico remoto de
migrations ainda precisa receber `0012` e `20260821071359_seguranca_pre_migracao`
antes da virada. O app continua lendo do Firestore.

O dump atual contém documentos legados de times que já não existem em `teams`.
O preflight os separa de referências quebradas reais e interrompe a migração se
qualquer descarte inesperado aparecer.

### Fase 1 — Ligar o Supabase ao Firebase Auth

No painel do Supabase: Authentication → Third-Party Auth → Firebase, apontando
para o projeto `bocaiuva-app`. Também é preciso o custom claim
`role: 'authenticated'` nos usuários do Firebase — o JWT do Firebase não traz
esse campo, e sem ele a RLS recusa tudo.

> Isso mexe em autenticação. Não faço sem pedido explícito.

O cliente já envia o JWT Firebase ao Supabase. Ainda é obrigatório confirmar no
Dashboard que a integração Third-Party Auth aponta para o projeto Firebase
correto e rodar o backfill de claims antes da virada. Novas contas precisam de
automação server-side para receber o claim; até ela ser implantada, rode a
auditoria de claims antes de liberar leitura Supabase para novos cadastros.

### Fase 2 — Importação inicial ✅ script pronto

```bash
# simulação: lê, mapeia e relata, sem gravar nada
npm run migrar:postgres:dry

# importação de verdade
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm run migrar:postgres

# só um módulo
npm run migrar:postgres -- --only=expense_categories,expenses
```

Credenciais do Firebase seguem a mesma ordem dos outros scripts do projeto
(`--credentials`, env, ou `secrets/bocaiuva-app-firebase-service-account.json`).
A pasta `secrets/` está no `.gitignore`; a service key do Supabase vai por
variável de ambiente e **nunca** entra em arquivo versionado.

**Idempotente.** `upsert` por id, e os ids são os mesmos do Firestore — rodar
duas vezes não duplica nada.

**A importação disputa a mesma cota do app.** Ler o Firestore inteiro custa
aproximadamente uma leitura completa do banco, na mesma cota de 50 mil/dia. Duas
saídas, que se combinam:

1. **Rodar na virada.** A cota reseta à meia-noite do Pacífico, ~4h da manhã no
   Brasil. Nessa janela a importação não tira leitura de quem vai usar o app.
2. **Importar em pedaços**, um dia de cada vez:

   ```bash
   npm run migrar:postgres -- --only=users,teams,players,team_members
   npm run migrar:postgres -- --only=matches,attendance
   npm run migrar:postgres -- --only=player_ratings,mvp_votes,match_stats
   ```

   Tabela fora do `--only` **não é lida do Firestore**: os ids já importados são
   consultados no Postgres, que não tem cota. Sem isso, cada pedaço releria o
   banco inteiro só para validar chave estrangeira — e a leitura do Firestore é
   justamente o recurso racionado.

   Ressalva: em `--dry-run` não há Postgres para consultar, então as tabelas
   puladas ficam sem verificação de referência.

**Ordem obrigatória** por causa das FKs: `users` → `teams` → `players` →
`team_members` → `seasons` → `matches` → resto. Coberta por teste.

**Referência pendurada.** O Firestore aceita um campo apontando para documento
apagado; o Postgres recusa a linha inteira. O importador separa os dois casos:

- referência **obrigatória** pendurada → a linha não entra, e sai no relatório;
- referência **opcional** pendurada → o campo vira nulo e a linha entra.

Sem isso, uma partida apontando para uma temporada apagada derrubaria a
importação de todas as partidas do time.

O mapeamento (`src/lib/migracao/mapear-postgres.ts`) é função pura e tem 20
testes. É onde uma migração erra, e erro de mapeamento em produção é silencioso.

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
