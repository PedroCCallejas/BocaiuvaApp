# Publicação — Professô FC, 14/10/2026

Status: **READY**, produção. O usuário autorizou publicar após a revisão local
e pediu corrigir Reclamação/Fominha e avaliar a troca de time.

## Versão publicada

- URL: https://bocaiuva-app.vercel.app
- Deployment: `dpl_Ax72dhoE8enYrBsbD4p2HVfe6LaF`.
- URL imutável: https://bocaiuva-nmallf1p7-pedroccallejas-projects.vercel.app
- Projeto: `bocaiuva-app`, `prj_VqjyClaCYhQQ7d6ekA6Y3YTBgjNu`.
- Equipe: `team_UBrObQXbevaCFT46ALH6oxrx`.
- Criado: 14/10/2026, 07:46:56 em Cuiabá (11:46:56 UTC).
- READY: 14/10/2026, 07:50:28 em Cuiabá (11:50:28 UTC).
- Build remoto: `npx expo export -p web`; saída `dist`; Node 24.x.
  Vercel informou `Build Completed in /vercel/output [3m]`.
- Publicação pelo conector Vercel autenticado, com 294 arquivos do snapshot
  local revisado. `.env`, credenciais, dados pessoais e documentação não foram
  enviados. Configurações e variáveis de produção existentes foram mantidas.
- Baseline Git: `9bb9ab67703cb4838e6b7b73c40d087c4fe6132b` mais alterações
  locais desta entrega, sem commit/push. Não é uma publicação daquele commit
  isoladamente. SHA-256 do manifesto local:
  `07aa6ef0e866c21c700773592206b5eeebf2309bd9cbeb1481d4f7cbc06f5a9d`.
- O alias principal foi consultado e aponta para o deployment acima.
  A Vercel retornou `aliasError: null`.

## O que foi verificado

- Antes da publicação: typecheck sem erro, 614 testes passaram, build web
  com 87 rotas; build demonstrativo também passou. Fonte conferida contra
  o snapshot imediatamente antes de criar a publicação: 294 arquivos iguais.
- Auditoria de segurança reexecutada em 14/10: exit 0, sem bloqueios; 14
  entradas moderadas e 21 altas permanecem, zero críticas. Apenas as duas
  exceções aprovadas até 12/11/2026 são aceitas pelo gate.
- HTTP 200 em `/`, `/teams-gallery`, `/login`, `/register`, `/ferramentas`,
  `/privacidade`, `/termos` e `/suporte`. A primeira tentativa HTTP foi impedida
  pelo DNS do sandbox; a verificação somente leitura fora dele passou. URLs
  em inglês `/privacy`, `/terms` e `/support` não são rotas do app e retornaram
  404; não foram consideradas evidência de falha das rotas legais reais.
- Navegador Edge: domínio principal mostrou a entrada nova com três ações e
  rodapé curto. Uma sessão real já disponível no navegador foi restaurada;
  nenhuma senha/token foi lida ou digitada pelo agente.
- Rankings com dados reais: Reclamação e Fominha mostram a média original
  `1`, em vez de `10 adj.`. Ordenação, barras e média geral foram preservadas.
- Troca real: Bocaiúva → outro time existente → Bocaiúva. O outro time mostrou
  seu único jogador e suas duas partidas encerradas; permissões administrativas
  apareceram conforme o vínculo. Ao voltar, o painel do Bocaiúva recuperou
  seus 67 jogos, próxima partida e conteúdo próprios. O time original ficou
  ativo ao final. Não houve criação/edição/exclusão de jogadores ou partidas;
  a única escrita dessa avaliação foi a preferência do time ativo, restaurada.
- Teste automatizado A → B → A também valida membership, critérios e recusa
  de time sem acesso. O fluxo de troca não precisou de alteração.
- Ferramentas abriram na sessão, com descrições curtas e link para Início.
- Galeria real carregou um time público (Bocaiúva), com os mesmos 67 jogos,
  localização, contato liberado e estatísticas agregadas.
- Console da aba de conferência: zero erros capturados durante rankings e
  troca de time. Consulta de logs de runtime desta publicação, últimos 15
  minutos: nenhum grupo `error`/`fatal` retornado. O app é estático e os logs
  Vercel não cobrem todos os erros possíveis do cliente/Supabase.

## Limites e continuidade

- Esta verificação não testa todos os papéis, dispositivos ou cenários offline.
  Login Google e restauração após fechar completamente o navegador continuam
  sem teste específico do agente; a sessão existente funcionou na nova aba.
- Consulta de Drains retornou 404: configuração de monitoramento externo não
  confirmada. Nenhuma configuração de segurança/monitoramento foi alterada.
- **GitHub Actions não foi reexecutado.** As correções de CI estão no checkout
  local e foram validadas aqui; publicação Vercel não equivale a CI remoto verde.
- **Sincronizar a entrega no Git antes do próximo deploy por Git.** O ramo
  remoto ainda contém a versão anterior e pode substituir esta publicação.
- As exceções de auditoria expiram em 12/11/2026. Os riscos das duas dependências
  continuam documentados em `../diagnostico-ci-auditoria-2026-10-13.md`.
- Sem migrations, alteração de RLS, Firebase Rules, credenciais, cobrança ou
  infraestrutura nesta publicação. Divergência histórica da constituição sobre
  Firestore permanece registrada no plano, sem emenda nesta tarefa.
- Capturas com dados reais ficam em `.expo/verification/` (ignorada pelo Git),
  para não versionar avaliações pessoais. A captura de tela mostrou o painel
  do Bocaiúva após seu retorno, em `time-original-restaurado.png`; rankings em
  `reclamacao-producao.png` e `fominha-producao.png`. A imagem capturada não foi
  tratada como prova visual do hub de ferramentas, conferido pelo estado da UI.

Documentos relacionados: `aplicacao-local.md`, `arquivos-alterados.md` e
`../diagnostico-ci-auditoria-2026-10-13.md`.
