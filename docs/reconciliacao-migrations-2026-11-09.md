> Atualizacao final: migration do caixa aplicada e verificada no BocaApp em 09/11/2026, versao remota 20261109135601. Nome local alinhado sem alterar SQL. As referencias anteriores a aplicacao pendente descrevem o estado antes desta etapa. Login Firebase externo e publicacao continuam pendentes.

# Reconciliacao do historico Supabase - 09/11/2026

## Base e resultado

Branch local: codex/entrega-caixa-expo58-20261109.
Base desta reconciliacao: c35e2504f550917bc52795b70c61f2c6c65c987c.
Projeto remoto conferido: BocaApp, xepbopkhsprfemqjzrkm.

Foram executadas somente consultas de catalogos/historico e advisors. Nenhum dado de usuarios foi consultado. Nenhuma migration, grant, credencial, policy, registro de negocio ou deploy remoto foi criado/alterado.

O remoto tem 28 migrations: as 27 anteriores mais 20261020162856_grants_explicitos_service_role. Essa migration ja estava aplicada, mas seu arquivo local estava fora do Git. O arquivo e agora incorporado separadamente, sem reaplicacao ao remoto.

## Identidade do SQL

- SHA256 do arquivo local com CRLF: 537d524bb64cf451bf88eef489d17aef3546bca82395e2d4feae6f2f6f31d2c6.
- SHA256 normalizado para LF: 4ff3df94678d4ea8ee9f1140fdcf6f23c8c349ab1c119f768c2c6a387e1e8b61.
- SHA256 do unico statement armazenado no historico remoto: 4ff3df94678d4ea8ee9f1140fdcf6f23c8c349ab1c119f768c2c6a387e1e8b61.

A diferenca de hash bruto e apenas quebra de linha. Os nomes/versoes do historico anterior conferem. Checagem de privilegios efetivos confirmou todos os 13 privilegios de tabela e os 13 de coluna requeridos pela migration; nenhum ausente.

## Caixa ainda pendente no remoto

Em 09/11, to_regclass('public.team_cash_entries') e to_regprocedure('public.listar_caixa_do_time(text)') retornaram null. 20261109120000_caixa_semanal nao consta no historico remoto.

A proxima migration e somente a do caixa. Nao usar migration repair para marcar o caixa como aplicado e nao reaplicar a grants de outubro. Antes de uma futura aplicacao, repetir a conferencia de historico e existencia dos objetos, pois esta evidencia e temporal.

## Testes locais

Na arvore de trabalho completa, 29 migrations e 7 suites SQL passaram, incluindo explicit_grants; dump/restore preservou fingerprint e as 7 suites passaram de novo. O runner reproduziu a regressao anterior de grants e confirmou reexecucao segura da migration em banco descartavel.

Esse teste usa alteracoes preexistentes de runner/fixtures ainda nao versionadas por esta tarefa. Por isso tambem foi executado um ensaio isolado da arvore c35e250 acrescida apenas da migration reconciliada, com runner/fixtures ja versionados. O resultado separado esta registrado no fechamento abaixo.

## Avisos do advisor

Advisor security retornou tres avisos de SECURITY DEFINER executavel por authenticated: apurar_mvp_da_partida, create_team_with_admin e join_team_with_invite_code. Catalogos confirmaram anon sem EXECUTE, authenticated com EXECUTE e search_path fixo nas tres. As definicoes locais contem verificacoes de membro/autenticacao. Sao exposicoes intencionais a revisar em contexto, nao prova de exploracao nem justificativa para remover acesso e quebrar fluxos. Nada foi alterado.

Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Proxima etapa e limites

1. Publicacao do codigo continua separada e nao foi realizada.
2. Para tornar o caixa operacional, aplicar em etapa explicitamente autorizada a migration 20261109135601_caixa_semanal.sql no BocaApp: cria tabela, RPC e RLS; leitura a membros do proprio time e escrita a administracao. Nao inclui dados reais de teste, grants adicionais, outra migration ou deploy.
3. Validar o login Firebase externo com uma sessao/conta de teste autorizada no ambiente de destino, sem criar credenciais persistentes ou gravar registros reais para teste. O ensaio anterior com Supabase Auth local nao confirma esse provedor.
4. A CLI Supabase v3 mudou para alvo local por padrao e confirmacao explicita para hosted. Consultar --help da versao instalada antes de comandos; nao assumir que comandos historicos vao ao mesmo ambiente.

Fontes: consultas read-only de supabase_migrations.schema_migrations e pg_proc, has_table_privilege/has_column_privilege, list_migrations, get_advisors; arquivo SQL local; https://supabase.com/changelog/supabase-cli-v3 .

## Fechamento da sequencia isolada

A arvore versionada c35e250 acrescida apenas da migration historica reconciliada passou: 29 migrations, 6 suites SQL, dump/restore com fingerprint preservado e repeticao das 6 suites. Nenhuma dependencia dos arquivos preexistentes de runner/grants foi necessaria para esse resultado. O conjunto completo com testes adicionais anteriores tambem passou, conforme acima.

## Aplicacao remota autorizada e verificada

A migration foi aplicada uma unica vez pelo conector ao projeto BocaApp xepbopkhsprfemqjzrkm, com nome caixa_semanal. O servidor registrou versao 20261109135601; o arquivo planejado 20261109120000 foi renomeado localmente para coincidir, sem mudar o SQL. SHA256 local/remoto: e925648dd05b5175a82d776c449d0ff882ebaae07c70da467fc9025ccd09667b.

Preflight imediato confirmou tabela/RPC inexistentes e helpers de permissao presentes. Como a alteracao e aditiva, sem dados anteriores no objeto novo, nao foi exportado backup de dados pessoais; a transacao protegeu contra aplicacao parcial. Nenhum dado de negocio foi inserido, alterado ou apagado para teste. Nao houve criacao de conta, token, credencial ou configuracao de autenticacao.

Verificacao posterior:
- Historico remoto tem 29 migrations, sem reaplicar grants de outubro.
- team_cash_entries existe com RLS e as 3 policies esperadas.
- authenticated tem SELECT/INSERT/UPDATE, sem DELETE; anon e service_role sem grants diretos na nova tabela.
- listar_caixa_do_time(text) e SECURITY INVOKER, search_path fixo; anon sem EXECUTE e authenticated com EXECUTE.
- Fingerprint de ACL/RLS das relacoes anteriores permaneceu a1455c8cb9d3d8abf91688a8cf44ea16, excluindo apenas a nova tabela e seus indices.
- Policies anteriores: f199ab68cbe208a83eba2c5be8d4f7f5, sem mudanca.
- Default ACL: 9276163d4c35cfd16ddba13c288d0004, sem mudanca.
- Advisor repetido mostrou somente os mesmos 3 avisos preexistentes, nenhum novo.

Nao foi feito push, deploy ou teste com dados reais. A preparacao do banco esta concluida; falta validar a integracao do Firebase externo e a publicacao em etapa separada. Nao executar a migration novamente.
