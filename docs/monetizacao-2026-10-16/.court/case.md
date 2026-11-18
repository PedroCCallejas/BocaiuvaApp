# Caso: modelo de monetização do Professô FC

Data: 16/10/2026. Julgamento de estratégia, não autorização para ativar cobrança.

## Decisão em julgamento

Avaliar se vale preparar o primeiro lançamento comercial com assinatura por time, um mês de teste gratuito, dois níveis pagos Pro/Premium e anúncios apenas no acesso gratuito público, preservando o Bocaiúva como Premium isento permanente.

O usuário pediu análise de alternativas. Dois planos e anúncios são hipóteses para este julgamento, não decisões já tomadas. Rejeitar essas hipóteses não significa rejeitar assinatura por time ou a isenção solicitada. A decisão prática é qual desenho preparar e quais condições validar antes de cobrar.

## Restrições expressas do proprietário

- Não ativar cobrança agora. Primeiro sincronização Git/CI, correção do cache e backup real.
- Deseja oferecer um mês grátis; proposta operacional em exame: 30 dias sem cartão, contados da criação do primeiro time elegível, sem renovar por novos usuários convidados. Ainda não há implementação nem definição final de mês civil versus 30 dias.
- Bocaiúva, seu próprio time com cerca de 20 jogadores, deverá ter Premium permanente sem cobrança. Isenção por ID estável do time no servidor, nunca por nome, e-mail, conta inteira ou domínio. Não se estende automaticamente a outros times da mesma pessoa.
- Nenhum vídeo novo. Não migrar banco, trocar autenticação ou publicar produção neste trabalho.

## Produto observado (AS-IS)

App web Professô FC, Expo/React Native Web, Firebase Auth, Supabase Postgres, Vercel. Times, convites, papéis de gestão/jogador, elenco, partidas/presença, escalação, resultados, estatísticas/rankings, avaliações/MVP, resenhas, financeiro e perfis públicos opcionais. Ferramentas utilitárias e navegação já existem. Não há faturamento, checkout, assinatura ou entitlements comerciais implantados. A plataforma é web hoje; não está publicada nas lojas Android/iOS.

O piloto disponível é apenas o time do proprietário, cerca de 20 jogadores; ele também usa um time de teste. Nenhum outro organizador entrevistado, nenhuma compra validada. Os jogadores convidados não são 20 clientes pagantes. Os limites técnicos atuais e regras de acesso não serão transformados em limites comerciais nesta análise.

614 testes locais passaram na rodada anterior; isolamento RLS e restauração sintética foram exercitados em PostgreSQL descartável com 27 migrations e cinco testes SQL, repetidos após restore. Isso não comprova recuperação de produção. A troca de time A→B→A passou na sessão real; o componente de cache preserva dados anteriores quando uma leitura em contexto novo falha e precisa de correção/verificação. CI remoto está sendo acompanhado. Não há prova de vazamento real entre contas.

Custos fixos, suporte por time, tráfego, volume de fotos/vídeos, conversão, retenção, disposição a pagar e RPM de anúncios são desconhecidos. Supabase está no Free; elegibilidade comercial da hospedagem e custo de plano precisam ser conferidos antes de vender. Não existe margem calculada com custos medidos.

## Hipótese comercial concreta para exame (TO-BE, não funcionalidade prometida)

Unidade: assinatura mensal por time, um organizador responsável, jogadores convidados sem cobrança individual. Mesmo time mantém o plano na web e em futuro app; comissões/regras de lojas ainda precisam de análise quando houver aplicativo nativo.

| Oferta candidata | Escopo proposto para debate |
|---|---|
| Teste gratuito | 30 dias com a experiência Premium para avaliar o produto; sem cartão nem renovação paga automática |
| Pro | Rotina completa: elenco, partidas/presença/escalação, resultados, estatísticas essenciais, MVP/resenhas e financeiro básico; sem anúncios dentro do time |
| Premium | Tudo do Pro e diferenciais futuros mensuráveis, como relatórios/exportações avançados e personalização institucional/patrocinadores, com limites transparentes de mídia; tais diferenciais ainda não foram construídos ou validados |
| Acesso gratuito público | Galeria/perfis autorizados e ferramentas públicas úteis; eventual publicidade contextual somente em páginas com conteúdo suficiente, se elegíveis e após medir receita/impacto. Não há plano gratuito perpétuo de gestão de times decidido |
| Bocaiúva | Premium isento permanente, sem checkout, expiração de trial, publicidade ou bloqueio por faturamento |

Depois do teste sem adesão, preservar dados e oferecer consulta/exportação; comportamento exato de edição, prazo de retenção e cancelamento ainda precisam de decisão antes de implementar. Segurança, privacidade e recuperação não devem ser diferenciais pagos.

Não há preço escolhido. Faixas experimentais podem ser sugeridas como hipóteses de entrevista, nunca como preço validado. Alternativas legítimas: um único plano pago completo inicialmente; dois planos somente após diferenciação real; patrocínio local direto em vez de publicidade programática; publicidade adiada ou descartada. Não considerar ausência de certeza de mercado como prova automática de fracasso.

## Evidências externas disponíveis e limites

1. SportEasy, página oficial portuguesa consultada em 16/10/2026: Basic gratuito com 30 membros; Premium por equipe, €9,99 mensais ou €69 anuais; oferece um mês Premium gratuito. Sustenta que unidade por equipe e teste são modelos existentes; não valida preço no Brasil, conversão do Professô FC, nem necessidade de dois níveis pagos. https://www.sporteasy.net/pt/teams/plans/
2. Google Publisher Policies, consultado em 16/10/2026: anúncios não permitidos em telas sem conteúdo do editor, de baixo valor, em construção ou apenas de navegação/alertas. Não supor que login, erro ou toda tela autenticada serve para AdSense. Aprovação do editor/site e demais políticas continuam necessárias. https://support.google.com/publisherpolicies/answer/11112688?hl=pt-BR e https://support.google.com/adsense/answer/48182?hl=pt-BR
3. Pesquisa anterior exploratória: nove reviews públicas de nove autores sobre Spond, SportEasy e TeamSnap, apenas três plataformas. Temas de notificações excessivas, confusão com presença, exportação, estatísticas, suporte e taxas. Cada tema tem no máximo duas menções, algumas históricas; sinal fraco, não pesquisa representativa, nem demonstra disposição a pagar brasileira. Referências e trechos curtos preservados em C:/Projetos/AppBoca/replica/reviews.csv; análise em replica/feedback.md. Não ler outros arquivos fora destes e dos indicados pelos briefs.
4. SEO/descoberta por IA será um canal a preparar, não aquisição garantida: Google informa que os fundamentos SEO continuam válidos para AI Overviews/AI Mode, sem arquivo/esquema especial obrigatório, e indexação não é garantida. https://developers.google.com/search/docs/appearance/ai-features

## Critério e imparcialidade

GUILTY: o desenho composto, como descrito, exige mudança material antes de servir de plano para lançamento comercial. Indicar quais partes manter e quais mudar, sem atribuir ao usuário uma decisão inexistente de preços ou anúncios.

NOT GUILTY: pode avançar como preparação experimental descrita, respeitando todos os portões e sem cobrança atual. Incerteza de sucesso por si só não condena. Distinguir preparação de lançamento imediato.

As funções editoriais padrão do júri são lentes críticas, não credenciais de especialistas financeiros. Aplicar os critérios à clareza da oferta, experiência do organizador e viabilidade da proposta. Não avaliar qualidade de vídeo. Não fabricar tráfego, receita, entrevistas, preços locais, efeitos de anúncios, votos humanos ou veredito de mercado. Cada voto é uma segunda opinião de agente de IA. O escrivão não escolheu previamente uma oferta vencedora.
