# Melhorias e posicionamento — 16/10/2026

## Evidência disponível

Nove recortes de avaliações públicas, nove autores, três plataformas, três
produtos. Não é uma amostra representativa e não houve entrevistas de clientes.
Os temas mais presentes têm somente dois relatos, em duas fontes; os demais,
um relato em uma fonte. Todos são sinais fracos, conforme [feedback.md](feedback.md).
Os trechos e sua atribuição estão em [reviews.csv](reviews.csv).

### Atritos levantados

1. Clareza de papéis e presença: 2 relatos / 2 fontes (Spond e TeamSnap).
2. Cobrança e perda de acesso: 2 / 2 (SportEasy e TeamSnap).
3. Excesso de avisos: 1 / 1 (Spond).
4. Suporte: 1 / 1 (SportEasy).

### Pedidos levantados

1. Portabilidade e autonomia da conta: 2 / 2 (SportEasy e TeamSnap).
2. Quórum mínimo: 1 / 1 (Spond); hipótese, não prioridade automática.

### Trabalhos possivelmente mal atendidos

- Jogador que quer responder presença sem lidar com controles do organizador:
  hipótese apoiada pelos 2 relatos de clareza/papéis, ainda não validada no Brasil.
- Organizador que precisa saber o custo total e o que permanece após cancelar:
  hipótese apoiada pelos 2 relatos sobre cobrança/acesso, sem disposição a pagar medida.
- Time pequeno que já usa WhatsApp e precisa de um registro de jogos consultável:
  hipótese de posicionamento coerente com o produto, ainda a testar com compradores.

## Plano ordenado pela evidência e pelo risco

| Prioridade | Ação | Tamanho | Evidência / critério |
|---|---|---|---|
| P1 | Trocar tela vazia de criar partida por restrição com retorno | S | B03 corrigido localmente, admin/jogador e botão conferidos; sem deploy |
| P0 antes de cobrar | Definir e provar recuperação de produção e mídias | M | Plano Free; ensaio sintético passou, backup real não comprovado |
| P1 | Investigar cache por conta/time sob falha e resposta atrasada | M | Componente preserva cache anterior; falta reprodução completa de UI |
| P1 | Manter testes SQL e restauração no CI | S | Implementado localmente; falta execução remota do novo job |
| P1 | Executar piloto do organizador e de cinco jogadores, depois ampliar | S/M | Usuário tem um time com ~20 pessoas; nenhuma sessão de piloto realizada |
| P1 | Especificar assinatura por time sem taxa extra pré-selecionada | S para spec; M/L para integrar | Proposta escrita; detalhes e provedor ainda sem aprovação |
| P2 | Corrigir título de aba que permanece no contexto da ferramenta | S | B01 reproduzido; conferir ciclo de Head antes de implementar |
| P2 | Simplificar primeira tela mobile e aviso de push repetido | S | Inspeção 390×844; confirmar com o piloto antes de redesenhar |
| P2 | Diagnóstico de erro do cliente com dados mínimos | M | Captura/alerta em produção não comprovados |

O novo runner, bootstrap, teste de isolamento e correção B03 foram implementados. Os demais
itens são plano de trabalho, não correções já aplicadas. Não há nova autenticação,
policy, assinatura, dependência grande ou serviço de telemetria instalado.

## Três opções de posicionamento para testar

1. **Rotina do futebol amador organizada:** presença, escalação, pós-jogo e
   histórico no mesmo lugar. Preferida por corresponder às funcionalidades atuais.
2. **Participação simples para o elenco:** o jogador encontra a partida e responde;
   o organizador acompanha. Testar se reduz ajuda e confusão no piloto.
3. **Gestão por time com preço previsível:** um responsável paga, convidados
   participam. É promessa futura, proibida na página comercial até implementar
   e validar os direitos de acesso e o pagamento.

Não usar nomes/relatos dos concorrentes em anúncios, nem afirmar superioridade
ou economia medida. A pesquisa indica perguntas para testar; não comprova essas promessas.
