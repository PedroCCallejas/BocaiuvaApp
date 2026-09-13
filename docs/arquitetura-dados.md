# Arquitetura de dados — quem decide o quê

> Guia operacional para agentes. Leia antes de mexer em permissão, leitura ou
> escrita de dados. Governança em `.specify/memory/constitution.md`; mapa geral
> em `CLAUDE.md`.

## 1. Autoridade de acesso

Três lugares no repositório têm nome de permissão. **Só um decide.**

| Lugar | O que é | Alcance |
|---|---|---|
| RLS e helpers `app.*` nas migrations | **A autoridade.** Decide de fato quem lê e escreve | todo acesso a dado |
| `selectCanManageTeam`, `selectCanManagePlayers` e afins (`src/store/selectors.ts`) | **Reflexo.** Espelham `membership.canManageTeam`, que veio do Postgres. Servem para mostrar ou esconder botão | 18 arquivos de tela |
| `canManagePrivateTeamData`, `canReadPrivateTeamData`, `canUpdateOwnAttendance` e afins (`src/lib/team-membership-index.ts`) | **Resíduo do Firestore.** Importados só por `firebase-repository.ts`, `mock-repository.ts` e `src/mocks/seed.ts` | zero em produção |

Consequências práticas:

- **Permissão nova ou alterada nasce na RLS**, em migration. Mudar só o cliente
  não protege nada: esconde o botão e deixa a porta aberta.
- **Selector do store não é lugar de decidir.** Ele reflete o que o banco já
  respondeu. Se a UI mostra o que não devia, o problema costuma ser a policy,
  não o selector.
- **Não use as funções de `team-membership-index.ts` em código novo.** O nome
  engana: elas respondem pelo modelo de acesso do Firestore, que saiu de
  produção. Continuam no repositório porque o mock e o caminho legado ainda as
  importam.
- Quando o app precisar repetir uma regra que já vive no banco, isso é
  affordance, não segurança — e o teste que trava a regra nos dois lados é
  quem impede a divergência (exemplo em `tests/supabase-financeiro-cases.ts`,
  no caso do limite de times por conta).

## 2. Caminho de autenticação até autorização

```
Firebase Auth  ->  JWT com claim role: authenticated  ->  Supabase  ->  RLS
```

1. O login é Firebase e continua sendo.
2. O Supabase valida esse JWT como provedor de terceiros.
3. A policy é `to authenticated`, então **o custom claim `role: authenticated` é
   obrigatório**. Sem ele a pessoa chega como `anon` e tudo é recusado. O claim é
   atribuído por `npm run auth:claim`.
4. `getFirebaseAccessToken` espera `authStateReady()` e falha se não houver
   sessão. Sem token, a RLS devolve zero linhas **em silêncio**.

Ordem de suspeita quando algo "não aparece": falta de sessão → falta de claim →
falta de vínculo no time → policy restritiva demais. Nessa ordem.

## 3. Mapa mínimo de domínio

Camadas em `src/services/repository/supabase/composicao/`, implementação em
`src/services/repository/supabase/`.

| Domínio | Tabelas | RPC | Arquivo |
|---|---|---|---|
| financeiro | `expenses`, `expense_categories`, `expense_shares` | `salvar_despesa` | `financeiro.ts` |
| resenhas | `match_diary_entries` (lê `players`, `users`) | — | `resenhas.ts` |
| partidas | `matches`, `attendance`, `match_stats`, `lineups`, `match_field_costs`, `match_field_participants` | `criar_partida`, `encerrar_partida`, `salvar_custo_do_campo`, `limpar_custo_do_campo` | `partidas.ts` |
| avaliacoes | `mvp_votes`, `player_ratings`, `rating_criteria` | `apurar_mvp_da_partida` | `avaliacoes.ts` |
| elenco | `players`, `team_members`, `teams`, `users`, `seasons` | `create_team_with_admin`, `join_team_with_invite_code` | `elenco.ts` |
| notificacoes | `notifications` | `marcar_notificacao_lida`, `marcar_notificacoes_lidas` | `notificacoes.ts` |

Fora das camadas: `push_subscriptions` é escrita por
`src/services/notifications/push-subscriptions.ts`, e as views públicas
`public_team_roster` e `public_team_summaries` são lidas por `publico.ts`.

Escrita que toca várias tabelas passa por RPC, para ser transacional.

## 4. Ordem das camadas de composição

`composicao/index.ts` reduz as seis camadas sobre `base.ts` nesta ordem:

```
financeiro -> resenhas -> partidas -> avaliacoes -> elenco -> notificacoes
```

A camada de cima vence. **`elenco` precisa continuar sendo a última das que
definem contexto**: é ela que estabelece a identidade da sessão. Se outra camada
sobrescrevesse `getSnapshot` depois dela, o app perderia a identidade da pessoa.

Ao acrescentar camada, acrescente depois de `elenco` apenas se ela não mexer em
`getSnapshot` — foi o caso de `notificacoes`.

## 5. Sistema de fatias

`src/services/repository/supabase/fatias.ts` monta o snapshot único que a UI
consome. A semântica de falha é deliberada:

- **Primeira carga propaga a falha.** É o que impede confundir indisponibilidade
  com "nenhum dado".
- **Depois que existe cache, releitura malsucedida preserva o último estado
  válido** e agenda nova tentativa.

Por isso, ao investigar tela vazia: **vazio não é prova de dado apagado.** Pode
ser primeira carga que falhou, cache preservado de uma leitura anterior, ou RLS
devolvendo zero linhas por falta de token. Descarte essas três antes de suspeitar
do dado.

Leitura de coleção que cresce usa `todasAsLinhas` (`paginacao.ts`) com `order`
estável — o PostgREST corta em 1000 linhas sem erro.

## 6. Fonte de verdade

**O schema vive em `supabase/migrations/`.** Coluna, tipo, índice, policy e
constraint se leem lá, em ordem cronológica.

Este documento não repete schema de coluna, e não deve passar a repetir:
`docs/firestore-schema.md` é a prova do que acontece com schema copiado para
Markdown — descreve fielmente um banco que saiu de produção.

O que é regra de domínio (limites, cálculo, elegibilidade) vive em `src/lib/` e
é travado pelos testes em `tests/`.
