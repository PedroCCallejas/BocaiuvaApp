# Grants explicitos — preparacao local de 20/10/2026

Status: migration aplicada ao BocaApp xepbopkhsprfemqjzrkm em 20/10/2026,
com confirmacao especifica e verificacao de catalogos antes/depois. Versao remota
20261020162856_grants_explicitos_service_role; arquivo local alinhado a essa versao.
Nenhum push/deploy ou alteracao de dados foi realizado.
Base verificada: `934e087` (27 migrations anteriores). Alteracoes de documentos no
checkout original foram preservadas com backup e conferencia de hash antes da aplicacao.

## AS-IS e objetivo

O anuncio oficial confirma que em 30/10/2026 muda o default de **novas** tabelas
`public`; as existentes mantem seus grants. Nao foi comprovada falha atual do
banco remoto nesta tarefa. A auditoria recebida relata CRUD existente para
`authenticated`/`service_role`; as consultas posteriores limitaram-se aos catalogos para o preflight e a validacao da migration.

A reconstrucao local demonstrou que `service_role` com BYPASSRLS, sem grant de
tabela, recebe `42501` ao ler `matches`. A migracao adiciona os acessos diretos
exercidos pelas cinco Edge Functions; preserva policies, RLS, defaults removidos,
views `security_invoker` e grants anonimos por coluna. Nao concede acesso anonimo.

## Matriz verificada no codigo

| Consumidor em supabase/functions | Operacoes service_role diretas em public |
| --- | --- |
| enviar-push/index.ts | SELECT matches, team_members, push_subscriptions; DELETE push_subscriptions; EXECUTE consume_team_push_quota ja existe |
| excluir-conta/index.ts | SELECT teams(id, admin_user_id), players(*); UPDATE players nos 10 campos de anonimizacao; DELETE users filtrado por id, requer SELECT users(id) |
| excluir-time/index.ts | DELETE teams filtrado por id; autorizacao usa authenticated; cascatas nao exigem DELETE nas filhas |
| exportar-dados/index.ts | SELECT * em team_members, players, matches, match_diary_entries, expenses, push_subscriptions, notifications, attendance, mvp_votes, player_ratings |
| preparar-conta/index.ts | Nao consulta tabelas Supabase; usa Firebase Auth |

Os 10 campos de UPDATE sao linked_user_id, linked_email, full_name, nickname,
photo_url, presentation_video_url, intro_video_url, celebration_video_url, bio,
updated_at. Todos os IDs sao text/UUID; nenhuma sequence precisa de grant aqui.
Storage e Auth sao superficies separadas, sem alteracoes nesta proposta.

Os grants sao **aditivos**. Em bancos existentes, grants historicos amplos de
service_role continuam amplos; este patch nao representa uma normalizacao desses
ACLs. A matriz minima e comprovada na reconstrucao sem grants automaticos.
Ferramentas administrativas de importacao nao sao um motivo para conceder CRUD
permanente a todas as tabelas; eventual importacao deve ter privilegios proprios
revisados separadamente.

## Verificacao reproduzivel

Com Node e Docker locais, imagem postgres:17 disponivel e dependencias instaladas:

```powershell
npm run typecheck
npm test
npm run test:postgres -- tests/postgres/report.local.json
```

O runner cria container aleatorio sem rede/portas, monta fontes somente para
leitura, usa dados sinteticos em tmpfs e remove o container ao terminar. Revoga
defaults antes da primeira migration, reproduz a falha anterior, aplica a
correcao, testa sua reexecucao e executa os seis arquivos SQL. Confere a matriz
service_role, as 27 colunas anonimas permitidas, views publicas/privadas,
isolamento authenticated, recusas 42501, anonimizacao e exclusoes apenas de
fixtures, RPC de cota e ausencia de grants em tabela futura. Faz pg_dump/pg_restore,
compara dados/RLS/policies/grants de tabela/coluna/funcao/defaults e repete os testes.

Isso testa PostgreSQL 17 com compatibilidade minima Auth/Storage. Nao e teste
real de Data API, JWT Firebase, Edge Functions, Push ou objetos Storage. O build
web nao foi executado: nenhum arquivo do bundle foi alterado.

## Revisao posterior

1. Revisar o patch e a matriz; no checkout alvo, conferir `git apply --check` antes
   de aplicar, preservando os documentos locais. Nao fazer reset ou checkout forcado.
2. Executar os comandos acima no ambiente de desenvolvimento.
3. Antes de qualquer aplicacao remota, conferir historico e grants reais e testar
   a migracao em ambiente Supabase de homologacao autorizado, incluindo PostgREST e
   Edge Functions com fixtures. Aplicacao remota depende de uma etapa futura.
4. Novas tabelas devem declarar grants necessarios na propria migration, com RLS
   e policies; nao reativar exposicao automatica ou grants em todas as tabelas.

Fontes verificadas em 20/10/2026:
- https://github.com/orgs/supabase/discussions/45329
- https://supabase.com/changelog
- https://supabase.com/docs/guides/api/securing-your-api
- https://www.postgresql.org/docs/current/ddl-priv.html

## Aplicacao remota confirmada

A baseline foi reconferida imediatamente antes da aplicacao: 27 migrations antigas
iguais, mesmos grants/RLS/policies/views/defaults. A migration aprovada foi aplicada
uma unica vez e registrada como 20261020162856_grants_explicitos_service_role.
O SQL manteve o hash SHA256 537d524bb64cf451bf88eef489d17aef3546bca82395e2d4feae6f2f6f31d2c6.
A verificacao posterior confirmou 28 entradas de historico, 13 entradas ACL de
coluna novas e nenhuma remocao; grants de tabela, roles, RLS, hash das policies,
views, defaults e ACL da RPC de cota permaneceram iguais. Nenhum dado privado
foi consultado, nenhuma RPC executada e nenhum redeploy foi realizado.
