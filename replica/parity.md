# Leitura do resultado

Abaixo está a saída da skill para esta matriz de pré-requisitos de operação e comercialização. **Não é percentual de funcionamento do app nem prontidão comprovada para produção.** Inclui capacidades futuras não implementadas e validações humanas ainda não realizadas. Não houve comparação visual com concorrente ou nota de similaridade de layout. O app existente permanece publicado; a decisão avaliada é habilitar cobrança, que continua pendente.

## Parity: 67.4 / 100

features 67.4  (25 counted, must-haves 12 of 22 done)

Not shippable yet: 10 must-have features are not done.

## By area, weakest first
- produto                       25.0  (2 features)
- comercial                     31.2  (3 features)
- operação                      50.0  (6 features)
- experiência                   75.0  (5 features)
- isolamento                    90.0  (5 features)
- entrada                      100.0  (4 features)

## Missing, in build order
- [must] comercial: Checkout/webhooks e direitos no servidor, no  (Fase futura; não implementado nem ativado.)
- [must] operação: Backup externo de produção e restauração comprovados, no  (Supabase Free; nenhuma cópia externa/restauração real comprovada.)
- [must] produto: Entrevistas com compradores de outros times, no  (Sem outros organizadores disponíveis até esta rodada.)
- [must] comercial: Proposta de assinatura por time, partial  (Proposta escrita; preço e detalhes comerciais ainda não aprovados.)
- [must] experiência: Uso em celular físico Android e iOS, partial  (Edge com viewport 390x844; aparelho físico ainda não exercitado.)
- [must] isolamento: Isolamento sob falha de rede/cache e respostas atrasadas, partial  (Cache anterior preservado na reprodução; contexto cruzado na UI não comprovado.)
- [must] operação: Cobertura automatizada das migrations/SQL no CI, partial  (Runner local passou; workflow adicionado sem execução remota.)
- [must] operação: Diagnóstico e alerta de erros de produção, partial  (Fallbacks/avisos no app; captura/alerta de cliente não comprovados.)
- [must] operação: Resolver dependências com exceção antes da validade, partial  (Auditoria aprovada, riscos continuam; prazo 12/11/2026.)
- [must] produto: Piloto observado com jogadores reais, partial  (Um time com ~20 jogadores informado; roteiro pronto, sessões não realizadas.)
- [should] experiência: Título da aba acompanha tela interna, no  (B01 reproduzido: Cronômetro permanece em /home e /team-access.)
- [should] comercial: Domínio próprio e plano comercial compatível, partial  (Fora dos itens 1–4 desta rodada; domínio não configurado, plano Vercel não consultado.)
- [should] operação: Documentação consistente com runtime, partial  (Divergências Firestore e comentário das camadas relatadas, sem emenda.)

## Yours, not in the original (not scored)
- Eventos recorrentes e quórum mínimo
- App nativo distribuído em lojas
