# Bugs e itens a confirmar — 16/10/2026

## B01 — título da aba permanece em Cronômetro depois de sair da ferramenta

- Severidade: **S4**, reproduzido em produção; preexistente.
- Passos: com sessão autenticada, abrir Ferramentas → Cronômetro → Início → Meus times.
- Esperado: título da aba acompanha a área atual.
- Observado: URL `/home` e depois `/team-access`, mas título `Cronômetro | Professô FC`.
- Efeito: dificulta distinguir abas e o contexto anunciado por tecnologias assistivas.
- Evidência: navegação observada no Edge; títulos web são definidos por
  `src/components/seo/PublicSeoHead.tsx` e seus chamadores. Conferir o ciclo de
  montagem das rotas internas antes de corrigir.
- Estado: aberto; nenhuma alteração de UI aplicada nesta rodada.

## B02 — alerta nativo de convite inválido bloqueou a automação

- Severidade de produto: **não atribuída**; limitação de ferramenta, não bug confirmado.
- Ambiente: demonstração local, organizador sem time, código fictício inexistente.
- Observado: alerta JavaScript do tipo `alert`; o controle do navegador não conseguiu
  fechá-lo. O usuário foi solicitado a confirmar o aviso manualmente.
- Não confundir timeout da ferramenta com falha de negócio ou ingresso indevido.
- O teste de convite vazio mostrou mensagem inline e manteve a pessoa sem time.
- O usuário fechou o aviso; a aba continuou sem time. A validação foi retomada
  e a criação de um time fictício foi concluída na mesma sessão.

## B03 — acesso direto a criar partida renderiza tela vazia para jogador

- Severidade: **S3**, há recuperação pelo endereço inicial; reproduzido em produção.
- Passos: jogador comum autenticado em seu time abre `/matches/create`.
- Esperado: explicar a restrição e oferecer retorno.
- Observado: carregamento termina em tela vazia, sem navegação ou mensagem.
- Causa: `src/app/(app)/matches/create.tsx` retorna `null` para `!team || !canManage`.
- Correção local: mesmo guard, agora com `EmptyState` e botão Ver partidas.
  Não altera quem pode criar, Auth, RLS ou regra de negócio.
- Estado: **corrigida e verificada localmente**. Admin vê formulário; depois de
  entrar como jogador e voltar pelo histórico, aparecem aviso e botão; botão
  abre `/matches`. Conferido em 390×844. Não publicada nesta rodada.

## A confirmar — isolamento de cache quando muda conta/time e uma leitura falha

- Prioridade: **P1 de investigação antes de cobrança**; não é vazamento confirmado.
- Fonte: `src/services/repository/supabase/fatias.ts` preserva cache após erro;
  `composicao/index.ts` aplica as fatias e só carrega as pendentes no bootstrap;
  `app-store.ts` limpa o snapshot da UI ao sair, mas não invalida as fatias.
- Reprodução controlada: carregar A, mudar a fonte sintética para B, provocar
  falha na releitura e aplicar as fatias; o conteúdo A continua aplicável.
  Script e saída em `.expo/validacao-gaps-2026-10-16/repro-cache.ts`.
- A preservação dentro do mesmo contexto é intencional e precisa continuar.
  O gap é não haver uma chave/geração explícita por conta e time.
- **Limite:** não houve prova de outra conta vendo dados na UI, quebra de RLS,
  gravação cruzada ou falha na troca saudável real A → B → A. Essa troca passou.
- Próxima verificação: cliente Supabase controlado, duas contas e dois times,
  falhas por fatia e respostas atrasadas. Só então definir a correção mínima.
- Não aplicar uma limpeza genérica sem preservar a recuperação e a sincronização.

## Melhorias observadas, sem classificação como bug

- No celular, a identidade do time ocupa grande parte da primeira tela; avaliar
  priorizar próximo jogo/presença com os jogadores do piloto.
- O aviso de push bloqueado aparece em dois pontos do painel. A escolha de
  privacidade do usuário deve ser preservada; avaliar uma única explicação.
- Não foram reproduzidos S1 ou S2 na navegação saudável executada. Isso não
  representa auditoria completa de segurança ou ausência de defeitos.
