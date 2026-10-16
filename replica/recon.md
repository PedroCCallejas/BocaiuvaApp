# Recon do Professô FC — 16/10/2026

## Escopo e limites

Produto do próprio usuário, web responsiva, futebol amador/society. Recorte: entrada, vínculo, partida, isolamento, recuperação e definição comercial. Não é clone. Usuário informou um time com cerca de 20 jogadores. A pesquisa de mercado usa somente fontes públicas, sem copiar código, marca ou usuários de terceiros.

Não há pasta specs ativa neste checkout. Código é o AS-IS; proposta comercial em cobranca-por-time.md é TO-BE ainda não aprovado. As capturas privadas estão em .expo/validacao-gaps-2026-10-16/, fora do versionamento.

## Fontes

| Fonte | O que comprova |
|---|---|
| https://bocaiuva-app.vercel.app/ | Interface publicada e sessão real do proprietário |
| https://supabase.com/dashboard/project/xepbopkhsprfemqjzrkm | Metadata consultada pelo conector, sem exportar registros de negócio |
| ../src/app/ | Inventário de rotas do produto próprio |
| ../supabase/migrations/ | Modelo e regras do banco atual, 27 migrations |
| ../src/services/repository/supabase/ | Camadas, cache e operações atuais |
| https://www.sporteasy.net/pt/teams/plans/ | Referência de unidade comercial por equipe; não valida preço brasileiro |
| https://apps.apple.com/gb/app/spond/id755596884?see-all=reviews | Pesquisa exploratória pública |
| https://play.google.com/store/apps/details?id=com.sporteasy.android&hl=pt_BR | Pesquisa exploratória pública |
| https://www.trustpilot.com/review/teamsnap.com | Pesquisa exploratória pública |

## Inventário completo de rotas

IDs referem-se a este snapshot. Estados não observados não foram preenchidos por inferência.

41 rotas identificadas por arquivos; a enumeração não significa que todas foram navegadas.

| ID | Rota | Arquivo / entrada | Estados vistos nesta rodada |
|---|---|---|---|
| S01 | `/` | `src/app/index.tsx` | Sessão real: loading e redirecionamento automático |
| S02 | `/account` | `src/app/(app)/account.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S03 | `/ferramentas` | `src/app/ferramentas/index.tsx` | Produção: hub autenticado e navegação |
| S04 | `/ferramentas/campeonato-rapido` | `src/app/ferramentas/campeonato-rapido.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S05 | `/ferramentas/cronometro-pelada` | `src/app/ferramentas/cronometro-pelada.tsx` | Produção: configuração existente, sem alterar tempo/placar |
| S06 | `/ferramentas/rodizio-de-times` | `src/app/ferramentas/rodizio-de-times.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S07 | `/ferramentas/sorteador-de-times` | `src/app/ferramentas/sorteador-de-times.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S08 | `/financeiro` | `src/app/(app)/(tabs)/financeiro.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S09 | `/forgot-password` | `src/app/(auth)/forgot-password.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S10 | `/home` | `src/app/(app)/(tabs)/home.tsx` | Produção: jogador/admin em dois times; demo: time recém-criado vazio; viewport mobile |
| S11 | `/lineup/[matchId]` | `src/app/(app)/lineup/[matchId].tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S12 | `/login` | `src/app/(auth)/login.tsx` | Entrada pública; sessão real concluída pelo usuário |
| S13 | `/matches` | `src/app/(app)/(tabs)/matches.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S14 | `/matches/[matchId]` | `src/app/(app)/matches/[matchId].tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S15 | `/matches/[matchId]/diary-entry` | `src/app/(app)/matches/[matchId]/diary-entry.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S16 | `/matches/[matchId]/edit` | `src/app/(app)/matches/[matchId]/edit.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S17 | `/matches/[matchId]/finish` | `src/app/(app)/matches/[matchId]/finish.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S18 | `/matches/[matchId]/mvp` | `src/app/(app)/matches/[matchId]/mvp.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S19 | `/matches/[matchId]/ratings` | `src/app/(app)/matches/[matchId]/ratings.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S20 | `/matches/create` | `src/app/(app)/matches/create.tsx` | Produção: jogador encontrou tela vazia; correção local verificada com admin/jogador |
| S21 | `/matches/import` | `src/app/(app)/matches/import.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S22 | `/matches/register-legacy` | `src/app/(app)/matches/register-legacy.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S23 | `/notifications` | `src/app/(app)/notifications.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S24 | `/players` | `src/app/(app)/(tabs)/players.tsx` | Produção: carregado, viewport 390 sem overflow |
| S25 | `/players/[playerId]` | `src/app/(app)/players/[playerId].tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S26 | `/players/[playerId]/edit` | `src/app/(app)/players/[playerId]/edit.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S27 | `/players/create` | `src/app/(app)/players/create.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S28 | `/privacidade` | `src/app/privacidade.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S29 | `/profile` | `src/app/(app)/(tabs)/profile.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S30 | `/rankings` | `src/app/(app)/(tabs)/rankings.tsx` | Produção: carregado, viewport 390 sem overflow |
| S31 | `/register` | `src/app/(auth)/register.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S32 | `/stats` | `src/app/(app)/(tabs)/stats.tsx` | Produção: carregado, viewport 390 sem overflow |
| S33 | `/suporte` | `src/app/suporte.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S34 | `/team-access` | `src/app/(app)/team-access.tsx` | Produção: dois times e retorno; demo: sem time, convite vazio/inválido |
| S35 | `/team-invite` | `src/app/(app)/team-invite.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S36 | `/team-rating-criteria` | `src/app/(app)/team-rating-criteria.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S37 | `/team-settings` | `src/app/(app)/team-settings.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S38 | `/team-setup` | `src/app/(app)/team-setup.tsx` | Demo: formulário e criação concluída com dados fictícios |
| S39 | `/teams-gallery` | `src/app/teams-gallery.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S40 | `/teams/[teamId]/public` | `src/app/teams/[teamId]/public.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |
| S41 | `/termos` | `src/app/termos.tsx` | Identificada no inventário de arquivos; UI não exercitada nesta rodada |

## Jornadas

| ID | Objetivo e telas | Caminho observado / limite |
|---|---|---|
| F01 | Abrir sessão: S12 → S10 | Usuário entrou; reload e / restauraram painel. Método Google/senha não foi distinguido nesta rodada. |
| F02 | Começar sem time: S12 → S34 → S38 → S10 | Gestor demo criou time fictício; nenhum time real criado. |
| F03 | Convite: S34 → S10 | UI vazio e inválido exercitada; ingresso válido/idempotente/reentrada no SQL local. |
| F04 | Alternar time: S10 → S34 → S10 | 2 cliques por troca, 4 na ida e volta; papéis e contexto mudaram; Bocaiúva restaurado. |
| F05 | Ferramenta: S10 → S03 → S05 → S10 | 3 cliques de navegação; nenhuma alteração do cronômetro real. |
| F06 | Consultar elenco/números: S24, S32, S30 | Produção em 390×844, sem overflow horizontal nas telas verificadas. |
| F07 | Criar partida: S20 | Jogador recebe tela vazia em produção. Correção verificada mantém bloqueio e oferece retorno; não publicada. |
| F08 | Isolamento de leitura/escrita | Admin A/B, jogador, visitante e conta sem vínculo nos testes SQL locais. |
| F09 | Backup → restaurar → conferir | Ensaio sintético passou; backup real e Storage continuam sem comprovação. |
| F10 | Teste por pessoas do elenco | Roteiro preparado; sessões de 20 jogadores não foram executadas pelo agente. |
| F11 | Assinatura por time | Proposta escrita; checkout/direitos comerciais não implementados. |

## Componentes repetidos

| Componente | Uso / estados |
|---|---|
| AppButton / AppInput | Ação, desabilitado/carregando, rótulo e erro de formulário |
| Screen / AppNavigation | Conteúdo responsivo e retorno entre áreas |
| EmptyState / LoadingState / ErrorState | Ausência de dados, carga e tentativa de recuperação |
| LegalFooter | Privacidade, termos, suporte |
| ToolPageShell | Ferramentas com título e ajuda; título web permanece ao sair em caso reproduzido |

## Dados confirmados e proposta separada

| Entidade | Relação / evidência | Confiança |
|---|---|---|
| users | Identidade do Firebase, active_team_id no Postgres; migrations e repositório | Alta |
| teams / team_members | Time, vínculo, papéis e acesso; RLS e teste de troca | Alta |
| players / matches / attendance / lineups | Elenco, jogo, presença e formação; migrations | Alta |
| mvp_votes / player_ratings / rating_criteria / match_diary_entries | Pós-jogo e memória; migrations | Alta |
| expenses / expense_shares / match_field_costs | Custos do futebol, não assinatura SaaS | Alta |
| assinatura / pagador / direitos comerciais | TO-BE proposto, sem tabelas ou regras implantadas nesta rodada | Proposta, não AS-IS |

## Cobertura que permanece aberta

Aparelhos físicos Android/iOS e Safari, encerramento completo do navegador, sessão expirada, rede lenta/offline, duas contas com erro de fatia e resposta atrasada, upload/URLs assinadas reais, recebimento de push e exclusões. Leitura do AX não substitui teste com leitor de tela. Não foram enviados e-mails de recuperação nem executadas exclusões de conta/time.

## Tamanho e próximos passos

Não é reconstrução de app. A validação e correções pontuais cabem em blocos pequenos; pagamento com direitos no servidor, recuperação real e monitoramento são trabalhos próprios e não têm prazo prometido. Priorizar B03, execução remota dos novos testes, cache sob falha e política de backup. Nenhum vídeo, migração de hospedagem, domínio, provider de pagamento ou deploy nesta rodada.
