# Monetização: recomendação para o Professô FC

Status: análise em 16/10/2026. Cobrança, checkout, planos comerciais e novas publicidades **não ativados**. Os limites abaixo são propostas, não regras do produto atual.

## Decisão recomendada

Cobrar **por time**, de um organizador responsável, com jogadores convidados incluídos. Começar a validação comercial com **um plano completo**, deixando a hipótese de Pro/Premium preparada para quando houver dois benefícios distintos que organizadores queiram comprar. Oferecer **um mês gratuito sem cartão**, com adesão paga explícita no fim. Manter o **Bocaiúva Premium isento permanente**.

Para implementação futura, sugiro definir “um mês” como **30 dias corridos**, com início/fim informados e controlados no servidor. Isso ainda precisa ser confirmado como regra comercial; o pedido do proprietário aprovou um mês, não um cálculo já implementado. No lançamento, mostrar somente funções que já funcionam.

## Resultado do court

**NOT GUILTY, 12 a 0**: a preparação experimental pode seguir, porque admite abandonar dois planos e anúncios antes da venda. **Não é aprovação de demanda, preço, cobrança ou lançamento imediato.**

Todos os 12 jurados ressaltaram a necessidade de demonstrar a diferença Pro/Premium. O melhor argumento da defesa: estudar alternativas é reversível e os portões técnicos permanecem. A acusação sustentou que vender uma diferença ainda não construída aumenta promessa e retrabalho. Não houve voto dissidente; as ressalvas estão preservadas.

Os votos mudariam se hipóteses virassem promessas sem validação, se recursos futuros fossem vendidos como existentes ou se os portões fossem ignorados. São opiniões independentes de agentes de IA, não uma pesquisa com 12 pessoas ou uma probabilidade de sucesso.

[Veredito integral](.court/20261016-012922/VERDICT.md) · [Caso e processo](.court/20261016-012922/case.md). Skill original: [court, Alex Chen](https://github.com/alexyc9381/court-skill), MIT; adaptação instalada usa funções editoriais, aplicadas aqui como lentes de clareza da oferta, não credenciais financeiras.

## O que colocar em cada oferta

| Recurso | Pro: operação completa do time | Premium: evolução a validar |
|---|---|---|
| Conta, convites e jogadores | Incluídos; jogador não paga individualmente | Igual ao Pro |
| Elenco, agenda, presença e escalação | Incluídos | Incluídos |
| Resultados, histórico, rankings/estatísticas atuais | Incluídos; não retirar do usuário para criar diferença artificial | Incluídos |
| MVP, avaliações e resenhas atuais | Incluídos | Incluídos |
| Financeiro atual do time | Incluído; não confundir com pagamento da assinatura | Incluído |
| Segurança, privacidade, consulta/exportação dos próprios dados | Não usar como vantagem de um plano caro | Mesma proteção |
| Relatórios comparativos e exportações avançadas recorrentes | Futuro: avaliar demanda antes de limitar | Candidato a diferencial; ainda não prometido como disponível |
| Personalização institucional e espaço para patrocinadores | Identidade atual preservada | Candidato a personalização adicional; validar e construir |
| Fotos/vídeos | Limites de tamanho/volume transparentes, calculados com uso real | Mais capacidade se a margem comportar; não prometer ilimitado |
| Anúncios na área do time | Sem anúncios | Sem anúncios |
| Atendimento | Canal e prazo realistas | Prioridade só com capacidade de cumprir; não prometer 24/7 |

**Começo sugerido:** vender futuramente a coluna Pro como plano único completo. Reservar o nome Premium e sua matriz, sem criar um botão de compra para diferenças inexistentes. Não mudar hoje as funções, o limite técnico de times por conta ou permissões por papel.

O acesso público gratuito pode continuar como descoberta: apresentação curta, galeria autorizada e conteúdo útil. A ferramenta gratuita versus somente dentro da conta é decisão pendente; não prometer simultaneamente uma ferramenta pública e seu fechamento no login. Não há decisão de um plano gratuito perpétuo para administrar times.

## Bocaiúva: requisito aprovado

Quando o controle comercial for implementado, cadastrar a isenção no servidor para o **ID estável do time correto**, após conferir o registro. Modelo conceitual: `plan=premium`, `billing_status=exempt`, sem vencimento de trial e sem cliente/assinatura no gateway. Esses campos **não existem hoje**; não foram adicionados ao banco.

- Isenção acompanha esse time mesmo com troca de organizador, salvo decisão explícita futura do proprietário.
- Não reconhecer pelo texto “Bocaiúva”, e-mail, domínio ou papel de administrador.
- Criar outro time com o mesmo nome não concede Premium.
- Outro time do mesmo usuário continua sujeito à oferta normal.
- A isenção prevalece sobre trial expirado e sobre eventos do gateway; não cria fatura ou cobrança.
- Acesso esportivo continua dependendo de vínculo/papel; Premium não transforma jogador em admin.
- Auditar alterações administrativas e testar web/futuro app consultando a mesma decisão no servidor.

Esta é a especificação da exceção, **não uma isenção técnica já aplicada em um sistema de cobrança ativo**.

## Preço: validar antes de publicar

Não existe preço aprovado nem custo por time medido. Como roteiro de entrevista, apresentar **R$ 19,90, R$ 29,90 e R$ 39,90 por time/mês**, em conversas separadas e com a mesma oferta completa. São hipóteses escolhidas para explorar sensibilidade, não valores de mercado comprovados. Começaria a conversa por R$ 29,90, sem recebimento ou compromisso de entrega futura. Com 20 jogadores, esse exemplo equivale a aproximadamente R$ 1,50 por jogador, mas a fatura seria única do time.

Não fixar ainda o valor do Premium. Cobrar mais só por um benefício demonstrado, com custo e margem conhecidos. Se o mesmo organizador administra dois times, explicar a cobrança separada; eventual desconto para clube/múltiplos times é outra hipótese. Web e futuro app compartilham o direito do time; compras em lojas exigirão avaliação específica quando existir aplicativo nativo.

Planilha mínima antes de escolher preço:

`contribuição por time = preço recebido − taxas de pagamento − impostos aplicáveis − custo variável do time − suporte variável`

`times para cobrir o fixo = custo fixo mensal ÷ contribuição positiva por time`

Medir hospedagem comercial, banco, armazenamento/egress, backup externo, mensagens e minutos de suporte. Não supor que o custo continua zero ao sair dos planos gratuitos. Preço europeu de concorrente não é preço validado no Brasil.

## Anúncios: recomendação é adiar

Não há dados de tráfego/RPM que justifiquem anúncios programáticos agora. O único time próprio não valida receita publicitária. Anúncios acrescentam distração, integração, revisão de política/privacidade e dependência de aprovação do editor.

Se testar depois: somente páginas públicas com conteúdo útil e elegibilidade; nunca login, erro, carregamento ou telas usadas só para navegação. Reservar dimensões para evitar saltos de layout, identificar publicidade e comparar desempenho/conversão com e sem anúncio. Não usar dados privados do time na segmentação. Manter trial, planos pagos e Bocaiúva sem anúncios na experiência do time.

Fórmula de viabilidade: `receita = pageviews monetizáveis ÷ 1.000 × RPM líquido observado`. Exemplo **puramente hipotético**: para R$ 100/mês, um RPM de R$ 5 exigiria 20 mil pageviews; a R$ 10, 10 mil; a R$ 20, 5 mil. Não há medição desses RPMs ou desse tráfego no Professô FC.

Uma alternativa a investigar é **patrocínio direto de comércio local**, identificado e aprovado pelo organizador, sem redirecionamento forçado ou venda de dados. Precisa de comprador real, contrato e benefício claro; não há patrocinador nem receita confirmados.

## Fim do teste e cobrança futura

Proposta: sem cartão no trial, sem débito automático ao terminar; avisos claros antes do fim, escolha explícita para assinar, consulta e exportação preservadas se não aderir. A regra de edição após expiração, retenção e eventual carência deve ser aprovada antes da implementação; sete dias de carência do rascunho anterior continuam sendo apenas hipótese.

Antes de ativar: direitos no servidor por time, autorização do responsável, webhook assinado e idempotente, cancelamento e falha de pagamento testados, nenhuma liberação baseada somente na URL de retorno do checkout, isenção do Bocaiúva coberta por testes. Nunca bloquear todos os times de uma conta porque um deles não pagou.

## Próximas etapas e critérios

1. Concluir CI/cache e comprovar recuperação real, incluindo mídia e chave recuperável fora do computador; não anunciar backup completo com apenas banco sintético.
2. Executar o piloto do time atual por dois jogos, anotando falhas de presença, escalação, resultado e navegação. O proprietário não conta como cliente pagante externo.
3. Recrutar de três a cinco organizadores externos, com autorização humana para contatos. Mostrar a oferta, observar uso real e registrar intenção de adesão/preço; nenhuma mensagem enviada neste trabalho.
4. Medir custo/tempo de suporte e atividade por time. Definir um benefício demonstrável para Premium ou manter plano único. Critério sugerido de amostra exploratória: pelo menos três organizadores descrevem espontaneamente valor recorrente e aceitam testar a mesma oferta; isso ainda não estima conversão de mercado.
5. Aprovar preço, regra pós-trial e limites. Só então especificar e implementar faturamento, com Bocaiúva isento desde o primeiro teste.
6. [Executar SEO e descoberta por IA](../seo-descoberta-ia-2026-10-16.md), com domínio e hospedagem adequados à operação comercial antes da aquisição pública.

## Referências verificadas em 16/10/2026

- [SportEasy: plano por equipe e mês gratuito](https://www.sporteasy.net/pt/teams/plans/). Referência de unidade comercial; não valida preço brasileiro.
- [Google: telas sem conteúdo elegível para publicidade](https://support.google.com/publisherpolicies/answer/11112688?hl=pt-BR) e [políticas AdSense](https://support.google.com/adsense/answer/48182?hl=pt-BR).
- [Vercel Hobby: uso pessoal não comercial](https://vercel.com/docs/plans/hobby). Conferir o plano da conta antes de monetizar; não houve contratação/upgrade.
- Pesquisa exploratória anterior: [nove reviews e limites da amostra](../../replica/feedback.md).
