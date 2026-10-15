# Aplicação local do design system

Fonte: `Professô FC Design System.zip`, fornecido pelo usuário em 13/10/2026.
Escopo autorizado: aplicar o design, corrigir os fluxos necessários e o CI/CD,
preparando revisão local antes de qualquer deploy.

## Continuação — correção de notas e publicação autorizada, 14/10/2026

O usuário revisou a prévia, pediu corrigir Reclamação/Fominha, avaliar a troca
de time e autorizou publicar na Vercel. As seções abaixo registram a entrega
local de 13/10; seus avisos de ausência de deploy pertencem àquela etapa.

- Reclamação/Fominha exibiam a pontuação invertida de desempenho (`11 - nota`)
  com o sufixo `adj.`. Agora mostram a média original registrada, nas telas de
  Estatísticas e Rankings, por um formatador comum em `src/lib/stats.ts`.
  Ordenação, barras e cálculo da média geral permanecem iguais.
- Regressão coberta: nota 1 aparece como 1, em vez de 10; 3,2 aparece como 3,2,
  em vez de 7,8. Critérios positivos e demais métricas mantêm a apresentação.
- Troca de time: teste demonstrativo A → B → A confirma time/membership ativos,
  elenco, partidas e critérios isolados por time; tentativa sem acesso é
  recusada e mantém o contexto. O código Supabase recarrega as fatias após
  selecionar o time. Nenhum código desse fluxo foi alterado.
- Limite da etapa local: a conferência completa da troca no navegador foi interrompida por
  um diálogo bloqueante na automação da demonstração. Não foi autenticada uma
  conta real naquela etapa; o teste mock não substitui a validação de RLS e sessão real.
- `npm run typecheck`: exit 0; `npm run test`: 614 testes passaram;
  `npm run build:web`: exit 0, 87 rotas. Build demonstrativo também passou.
- `npm run audit:security` reexecutado em 14/10: exit 0, 14 moderadas,
  21 altas, zero críticas, somente as duas exceções previamente aprovadas.
- Evidências adicionais: `evidencias/reclamacao-corrigida.jpg` e
  `evidencias/fominha-corrigida.jpg`.
- Publicação concluída (`READY`) pelo conector Vercel, com 294 arquivos do snapshot
  local validado, sem `.env`, credenciais ou dados de usuários. Resultado
  final registrado em `publicacao-2026-10-14.md`. Uma sessão real já disponível
  permitiu conferir as notas corretas e a troca de time em produção, com retorno
  ao Bocaiúva; a limitação da automação mock acima foi superada nessa avaliação.
- Não houve commit/push; o CI do GitHub permanece sem nova execução.


## AS-IS e diferenças do material

- O app tem tema/componentes React Native; o ZIP contém referências React/DOM.
  A implementação adapta a referência à stack, sem executar seus bundles.
- O README do ZIP diz que gradientes do botão já foram removidos, mas o código
  original ainda usa `LinearGradient`. O campo já tem rótulo fixo, apesar de o
  guia chamá-lo de flutuante. O código é a evidência do estado atual.
- O kit usa dados fictícios, inclusive localização/números do Bocaiúva. Nenhum
  desses dados entra no repositório de dados ou na galeria real.
- As divergências anteriores da constituição sobre Firestore permanecem
  registradas no plano de evolução; esta tarefa não altera a governança.

## TO-BE e critérios de aceitação

- [x] Tema com tokens aditivos, cores dos times preservadas no painel.
- [x] Botões/campos comuns com contraste, foco e tamanhos de toque adequados.
- [x] Entrada com três ações e rodapé legal curto.
- [x] Redirecionamento condicionado à sessão carregada; loading/erro/retry explícitos.
- [x] Galeria preserva filtros e dados públicos, sem blocos promocionais repetidos.
- [x] Ferramentas com navegação de volta, textos curtos e controles prioritários.
- [x] Conta sem time consegue acessar ferramentas e sua conta.
- [x] Voltar ao início não apaga cronômetro ou rodízio.
- [x] Dados locais das ferramentas isolados por conta, sem associar legado anônimo automaticamente.
- [x] Typecheck, testes e build web verificados.
- [x] Auditoria e dependências corrigidas quando houver versões seguras compatíveis.
- [x] Preview local disponibilizado; nenhum push/deploy executado.
- [ ] Usuário conferir restauração de sua sessão real Firebase após fechar/reabrir o navegador.

## Resultado e evidências

- `npm run typecheck`: exit 0.
- `npm run test`: 612 testes passaram. Incluem concorrência/retry da inicialização,
  retorno seguro, isolamento das contas e auditoria com expiração, mudança de
  versão/advisory, ciclos e rejeição de achados críticos.
- `npm run build:web`: exit 0, 87 rotas estáticas; build demonstrativo também passou.
- `npm run audit:security`: exit 0, sem bloqueios, com as duas exceções aprovadas.
  14 entradas moderadas e 21 altas permanecem no relatório; zero críticas.
- `git diff --check`: sem erro de whitespace. Avisos de normalização LF/CRLF do Git.
- Instalação limpa passou com `npm ci --ignore-scripts --no-fund --no-audit`.
  Não houve atualização dos SDKs principais nem `audit fix --force`.
- Navegador: início e rodízio sem overflow horizontal em 375/768/1024/1440 px.
  Ações iniciais com 52 px incluindo contorno; foco do botão por teclado visível.
- Galeria conectada carregou o time público Bocaiúva com 67 jogos, preservando
  localização, contato público e estatísticas reais. Consulta somente leitura.
- Demonstração: login abre `/home`; cadastro sem time abre `/team-access` e
  acessa `/account` e ferramentas; conta diferente abre placar zerado.
- Cronômetro iniciado e placar 1×0 preservados ao voltar ao início e reabrir.
- Rodízio 3×3 com sete jogadores preservou os seis em campo e um na fila após
  voltar ao início e reabrir. Algoritmos não foram alterados.
- URLs diretas exigem login e preservam a ferramenta em `next`, limitado às
  rotas permitidas. No navegador, a URL completa é lida antes do Stack montar;
  o pathname do layout sozinho apontava apenas para o hub.

Screenshots reais em [`evidencias/`](evidencias/), sem edição de imagem.
Desenhos e exemplos do ZIP não substituem verificação do app renderizado.
Lista completa em [`arquivos-alterados.md`](arquivos-alterados.md).

## Como analisar localmente

1. **Demonstração:** http://127.0.0.1:9138/login — clique em **Admin demo** e
   abra Ferramentas. Os dados são fictícios; nenhuma escrita vai para produção.
   O modo mock mantém contas/sessão em memória: recarregar a página exige entrar
   novamente. O estado local das ferramentas permanece por conta no dispositivo.
2. **Configuração conectada:** http://127.0.0.1:9137 — permite conferir a galeria
   real e sua sessão. Usa os serviços já configurados; ações de escrita nessa
   versão usam o banco real. Os testes desta entrega consultaram só a área pública.
3. Se encerrar as prévias, rode `npm run preview:web -- dist 9137` e
   `npm run preview:web -- dist-audit-design-preview 9138`, em terminais separados.
   O servidor só expõe a pasta exportada e escuta em `127.0.0.1`.

## Riscos e limites da etapa

- Não foi autenticada uma conta real, nem testado o popup Google. A restauração
  Firebase existente foi preservada; a UI agora espera `ready` e redireciona
  sem oferecer o botão Entrar durante a carga. O tempo de rede real não foi medido.
- Exceções de segurança expiram em 12/11/2026 e não eliminam os riscos dos
  pacotes. Consulte [`../diagnostico-ci-auditoria-2026-10-13.md`](../diagnostico-ci-auditoria-2026-10-13.md).
- Ferramentas passam a exigir conta e ficam `noindex`, removidas do sitemap.
  Isso muda a descoberta pública; componentes de anúncios foram preservados.
- A persistência das ferramentas é local, não sincronizada entre dispositivos.
  Dados anônimos anteriores continuam na chave antiga, sem associação automática.
- Correção adicional comprovada na demonstração: login/cadastro atualizavam o
  repositório mock sem atualizar seu AuthService; agora usam esse serviço somente
  no modo mock. O caminho Firebase/Supabase continua igual.
- App nativo, cobrança e infraestrutura VPS ficam para etapas próprias. A stack
  já utiliza Supabase Postgres; banco, RLS, credenciais e domínio não foram alterados.
- Não houve commit, push, deploy, `expo start` ou build EAS. CI remoto/Vercel
  continuam sem nova execução. A divergência histórica da constituição sobre
  Firestore foi registrada no plano e continua pendente de emenda própria.
