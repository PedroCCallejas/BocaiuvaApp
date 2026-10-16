# Cobrança por time — proposta v0.1

Status: **TO-BE proposto, sem aprovação dos detalhes comerciais e sem implementação**.
O pedido desta rodada cobre definir a proposta, não ativar checkout ou publicar
alterações de regras de negócio. Há pendências operacionais no item 2 e nenhuma
validação de disposição a pagar de outros organizadores.

## Unidade e oferta

- Uma assinatura por time; responsável financeiro paga, jogadores convidados
  não recebem cobrança individual para participar.
- Começar com um plano mensal simples que reúna as funcionalidades atuais do
  time. Preço: **[valor validado por mês/time]**. Não foi definido nesta rodada.
- Proposta para avaliação: teste de **30 dias, sem cartão**, iniciado por ação
  explícita do organizador, sem conversão automática em assinatura paga.
- Piloto do time atual continua gratuito enquanto a proposta é validada.
- Isenção do time do proprietário deve ser um direito explícito no servidor,
  associado ao ID confirmado do time e com motivo. Não hardcodar e-mail, nome
  do time ou domínio. Não foi aplicada uma isenção ao banco.
- Não prometer elenco ou mídias ilimitadas sem conhecer custo e capacidade.
- O limite atual de criação de dois times por conta permanece; a proposta não
  altera esse limite nem vincula a assinatura à conta inteira.

## O que o pagamento libera

Escopo por `team_id`, com verificação no servidor e vínculo ativo da pessoa.
Conta, membership, papéis esportivos, responsável financeiro, assinatura e
isenção são conceitos separados. Ser administrador de elenco não deve, por si
só, permitir trocar o pagador ou enxergar dados financeiros do cartão.

O financeiro existente controla custos do futebol. A assinatura do Professô FC
terá domínio próprio; não deve virar uma despesa automática do elenco.

## Estados propostos

| Estado | Comportamento a especificar e aprovar |
|---|---|
| pilot | Time autorizado para teste assistido; sem cobrança |
| trialing | Teste com início/fim registrados no servidor; sem cartão obrigatório |
| active | Pagamento confirmado pelo provedor e direitos por time |
| past_due | Aviso claro ao responsável; carência proposta de 7 dias, ainda a aprovar |
| canceled | Cancelar renovação; manter direitos até o fim do período já pago |
| expired | Preservar histórico e acesso a dados/exportação; novas escritas conforme política aprovada |
| exempt | Isenção explícita, sem simular pagamento ou compartilhar plano com outros times |

São regras propostas. Política de retenção, bloqueio, reembolso e carência
precisa de decisão antes de virar código ou texto contratual.

## Critérios para a implementação futura

1. Uma pessoa em A pago e B gratuito não transfere benefícios ao trocar de time.
2. Webhook assinado e idempotente; não liberar acesso só pelo retorno do checkout.
3. Validar provedor, ID de preço, valor, moeda, time e responsável no servidor.
4. Eventos repetidos ou fora de ordem não duplicam assinatura nem cobrança.
5. Cancelamento e recuperação de acesso são claros, sem apagar histórico.
6. Transferência do responsável exige autorização adequada e deixa trilha de auditoria.
7. Nenhuma taxa, doação ou serviço extra vem pré-selecionado.
8. Segredos e dados de cartão não entram no cliente; ambiente de teste antes do real.
9. RLS/serviços devem garantir o isolamento e os direitos no servidor antes de
   colocar bloqueios de plano na interface.

## Decisões ainda abertas

Preço, trial, carência, limites de mídias, política de fim do plano, provedor,
meios de pagamento, reembolso e obrigações comerciais. Sem compra, cadastro em
provedor, chave, migration, webhook, alteração de Auth/RLS ou deploy nesta rodada.

## Evidência e limites

[SportEasy vende por equipe](https://www.sporteasy.net/pt/teams/plans/), mas preço
europeu não valida preço brasileiro. [Relatos públicos analisados](feedback.md)
levantam atrito em notificações, papéis e cobrança; são hipóteses para o piloto,
não depoimentos do Professô FC. O usuário possui um time com aproximadamente
20 jogadores, sem outros organizadores entrevistados até aqui.
