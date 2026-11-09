> Atualizacao final: migration do caixa aplicada e verificada no BocaApp em 09/11/2026, versao remota 20261109135601. Nome local alinhado sem alterar SQL. As referencias anteriores a aplicacao pendente descrevem o estado antes desta etapa. Login Firebase externo e publicacao continuam pendentes.

# Caixa semanal
Status: implementação local; migration preparada, não aplicada em produção.

## AS-IS
O financeiro existente calcula cobranças, despesas e rateios e é restrito à gestão.
Foi preservado sem alteração. Não representa o caixa simples solicitado.

## TO-BE e critérios de aceitação
- Membro ativo vê no início o total das arrecadações e pode abrir /caixa.
- Administração registra o total de uma semana com descrição opcional e pode corrigir.
- Semana começa na segunda-feira; uma linha por semana evita duplicação por clique/repetição.
- Valores obrigatórios, positivos, em centavos; nenhum saldo inicial é inventado.
- Total é soma das arrecadações. Não deduz despesas, nem cria pagamentos individuais.
- Banco limita escrita à gestão e leitura aos membros/gestão do próprio time; nenhum acesso público.
- Carregamento e erro não aparecem como saldo zero; troca de usuário/time descarta respostas antigas.
- Serviço dedicado pagina consultas e usa filtros explícitos nas correções.
- Sem postagem, notificações ou publicação automática.

## Arquivos e verificação
Migration: supabase/migrations/20261109135601_caixa_semanal.sql.
Casos unitários: tests/team-cash-cases.ts, registrados no runner.
Casos RLS: supabase/tests/team_cash.sql, incluídos pelo runner test:postgres.
Executar typecheck, test, build:web e test:postgres antes da publicação.
A migration precisa de revisão/aplicação autorizada antes de publicar o cliente.
Sem migration, caixa mostra indisponível e mantém o restante do app utilizável.

## Limites
Não implementa saídas/saldo contábil, conciliação, exclusão nem auditoria histórica de correções.
Atualização é ao abrir/voltar ao início ou pelo botão Atualizar caixa, sem realtime novo.

## Resultado local desta entrega
- npm run test: 623 testes passaram.
- npm run build:web: exportado para dist com sucesso após atualização das dependências.
- npm run test:postgres: 29 migrations e 7 suítes passaram; dump/restore preservou fingerprint e repetiu as 7 suítes.
- Typecheck está sendo validado no fechamento integrado da migração Expo.
- QA visual e autenticado local concluídos; detalhes abaixo.
- Docker Desktop instalado foi iniciado apenas para testes locais.
- Nenhuma migration aplicada em produção, nenhum deploy e nenhum dado real criado.

## QA visual e interativo concluído
Prévia isolada fora do repositório, sem .env, com serviço de caixa em memória e valores sintéticos. Mesmos CashContent, Screen, AppInput, AppButton e hook da implementação. Edge em 1280×900 e 390×844.
- Estado vazio e validação de valor ausente.
- Registro com descrição: total e histórico atualizados; data normalizada para segunda-feira.
- Correção do valor e cancelamento sem alterar registro.
- Registro com descrição em branco.
- Membro vê total/histórico, sem formulário ou botões Corrigir.
- Falha de leitura mostra Total indisponível, sem zero falso; salvar fica desabilitado.
- Recuperação da leitura e retorno ao estado vazio.
- Layout legível nas duas larguras; nenhum erro no console.
Limite: UI usa fixtures em memória; a persistência e permissões reais foram testadas separadamente no PostgreSQL descartável. Não equivale a E2E de autenticação/Supabase em staging.

## QA autenticado local concluído em 09/11/2026
Ambiente descartável com PostgreSQL 17, Supabase Auth (GoTrue) e PostgREST oficiais. As 29 migrations do projeto foram aplicadas somente nesse banco. Três contas fictícias, senhas e segredo JWT gerados apenas em memória. Serviços publicados exclusivamente em 127.0.0.1; banco sem porta publicada e dados em tmpfs. Sem cópia de dados reais ou acesso ao projeto remoto.

API e RLS verificadas: login válido; senha incorreta rejeitada; caixa vazio; admin registra e corrige; descrição pode ser removida; membro lê mas não insere nem corrige; conta de outro time e acesso anônimo bloqueados; semana duplicada rejeitada; admin não escreve em outro time; vínculo revogado bloqueia leitura mesmo com JWT ainda válido.

Na tela com serviço real de caixa: admin registrou R$ 88,50 e corrigiu para R$ 92,75; membro autenticado viu o valor persistido sem controles administrativos; conta externa recebeu Total indisponível, sem dados anteriores ou zero falso. Layout móvel 390 x 844 conferido. Valores são exclusivamente sintéticos, não correspondem ao caixa do time.

Ao final, os três containers, banco tmpfs, rede e processos de QA foram destruídos. Verificado que não restaram listeners nas portas do teste nem volumes do projeto local. Evidência visual e relatório de casos preservados fora do repositório, sem credenciais.

Limite: a cópia de QA usa Supabase Auth local em um adaptador de autenticação, preservando tela, hook e serviço de caixa reais. Não valida o provedor Firebase externo, login completo do aplicativo, Storage, push ou ambiente de produção. Não houve deploy nem aplicação de migrations remotas.