> Atualizacao final: migration do caixa aplicada e verificada no BocaApp em 09/11/2026, versao remota 20261109135601. Nome local alinhado sem alterar SQL. As referencias anteriores a aplicacao pendente descrevem o estado antes desta etapa. Login Firebase externo e publicacao continuam pendentes.

# Entrega local para revisao e publicacao - 09/11/2026

## Incluido

- Caixa semanal separado das despesas/rateios existentes, com leitura por membros, escrita administrativa e isolamento por time.
- Navegacao de retorno e arte de partida exportavel em PNG.
- Expo 58/Router 58, React 19.3/RN 0.88, dependencias corrigidas e adaptacoes de compatibilidade.
- Node suportado: ^22.13.0 || ^24.3.0; CI usa Node 24.

## Separacao do trabalho anterior

Esta entrega nao inclui alteracoes locais preexistentes de backup/monetizacao, runner SQL/grants ou migration de grants de outubro. Elas permaneceram intactas e fora da selecao. Quatro logs de verificacao foram preservados fora do repositorio; build, dependencias e configuracao local nao entram no commit.

A arvore selecionada foi exportada para outra pasta, sem .env, e validada sem os arquivos excluidos. Nela, o teste SQL reconstruiu 28 migrations e passou 6 suites, repetidas apos pg_dump/pg_restore. A arvore de trabalho completa tem 29 migrations/7 suites porque inclui a pendencia anterior de grants: as duas contagens descrevem conjuntos diferentes.

## Evidencia local

- Typecheck passou na arvore selecionada.
- Todos os 625 testes passaram; os testes da arte agora integram npm test.
- SQL isolado: 28 migrations, 6 suites, fingerprint preservado e 6 suites repetidas apos restauracao.
- Instalacao independente do lockfile: npm ci --ignore-scripts --no-audit --no-fund passou, 737 pacotes.
- Verificacao de secrets por padroes conhecidos nas adicoes nao encontrou correspondencias; isso nao equivale a uma auditoria exaustiva.
- QA autenticado local do caixa esta documentado em caixa-semanal-2026-11-09.md. Usa Supabase Auth local, nao valida Firebase externo.

## Ordem antes de producao

1. Revisar este commit e o trabalho anterior separadamente. Conferir o historico do banco alvo: a migration 20261020162856_grants_explicitos_service_role.sql consta localmente como trabalho anterior e seu documento registra aplicacao remota. Reconciliar/versionar esse historico em etapa propria antes de usar comandos de migrations; nao reaplicar cegamente nem ignorar divergencias.
2. Em ambiente autorizado equivalente, aplicar e verificar a nova 20261109135601_caixa_semanal.sql antes de liberar o cliente. Ela cria tabela/RPC/RLS do caixa; nao publica o frontend.
3. Validar Firebase JWT real, leitura/escrita administrativa, bloqueio de outros times e login/logout/troca de time no ambiente alvo. Revisar tambem modal/download da arte com escudos reais e CORS.
4. Publicar a branch somente com autorizacao, executar CI do SHA exato e conferir preview. Nenhum push, merge, CI remoto, migration de producao ou deploy foi executado nesta preparacao.
5. Depois da aprovacao de publicacao e dos checks, fazer deploy com Node 24 atualizado e smoke test. Nao declarar producao funcional apenas pelo build local.

## Riscos conhecidos

Persistem 5 entradas moderadas na auditoria sem dev, propagadas de glob/minimatch na ferramenta Expo, sem altas/criticas e sem uso das excecoes antigas. Recuperacao completa de midia/identidade/offsite permanece uma pendencia historica separada, anteriormente adiada pelo proprietario.

## Resultado final da arvore selecionada

A exportacao web com cache limpo e dependencias independentes passou, assim como audit:security (exit 0, 5 moderadas, zero altas/criticas, nenhuma excecao usada). O primeiro ensaio com dependencias compartilhadas encontrou cache de outra copia de QA; isso foi eliminado com instalacao independente e nao exigiu alterar codigo do produto. Diff staged sem erros.
