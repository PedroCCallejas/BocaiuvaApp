# Professô FC — evolução e cobrança por time

Data: 15/10/2026. Status: análise e proposta; não implementa cobrança.

## AS-IS confirmado

- Expo Router / React Native Web, Supabase Postgres para os dados do produto e Firebase Auth. Referências: `package.json`, `src/services/repository/`, `docs/arquitetura-dados.md` e `CLAUDE.md`.
- O usuário pode participar de times diferentes; a conta, o vínculo e o time ativo são conceitos distintos. Referências: `src/lib/team.ts`, `src/app/(app)/team-access.tsx` e migrations em `supabase/migrations/`.
- O financeiro atual controla despesas e cobranças do futebol. Ele não é um sistema de assinatura do Professô FC. Referência: `src/app/(app)/(tabs)/financeiro.tsx`.
- Não há assinatura SaaS implementada. Não anunciar compra, renovação automática ou planos pagos como recursos disponíveis.
- O produto publicado é web. A base Expo não comprova distribuição nativa em lojas.
- A integração da main d244583 teve CI aprovado em 15/10/2026. Há exceções de auditoria específicas para braces e node-forge até 12/11/2026; elas não eliminam os riscos.
- Existe divergência entre a constituição, que ainda descreve bootstrap Firestore, e a arquitetura atual Postgres. A divergência precisa de decisão e emenda pelo fluxo do projeto; este documento não a resolve silenciosamente.

## TO-BE proposto: cobrar por time

**Recomendação: uma assinatura por time; o organizador paga e convida os jogadores sem cobrança individual.** A unidade acompanha o valor entregue: organizar a rotina coletiva. Cobrar por jogador cria atrito para confirmar presença e convidar o elenco.

Uma pessoa pode administrar mais de um time. Participar de um time pago não dá automaticamente assinatura aos outros times da conta. Trocar o time ativo nunca pode transferir assinatura ou permissões.

Começar com um plano pago simples e um período de teste é uma hipótese a validar com 5–10 organizadores. Preço, duração do teste, limites e eventual acesso gratuito às ferramentas ainda são decisões de produto. Não há preço validado nesta análise. Para o time do proprietário do projeto, considerar uma isenção explícita registrada no servidor, sem condições escondidas por nome, e-mail ou domínio.

Como referência de unidade comercial, a [SportEasy oferece planos por equipe](https://www.sporteasy.net/pt/teams/plans/) (consultado em 15/10/2026). Isso sustenta a escolha da unidade, não valida preço no Brasil nem demanda pelo Professô FC.

## Requisitos antes de implementar a assinatura

1. Especificar conta, time, membership, responsável financeiro e assinatura como entidades separadas.
2. Autorizar recursos pagos no servidor. O time selecionado e as flags da interface não são autoridade de pagamento ou acesso.
3. Definir estados de teste, ativo, atraso, cancelamento e isenção. Cancelamento não deve apagar histórico.
4. Usar webhooks verificados e idempotentes; não liberar plano pelo retorno visual do checkout. Definir transferência do responsável e recuperação de pagamento.
5. Provar isolamento entre dois times com a mesma conta, entre administradores/jogadores e entre times pagos/gratuitos.
6. Definir backup e teste de restauração, suporte, termos comerciais e tratamento dos dados antes de cobrar.

São requisitos propostos, não uma especificação aprovada nem autorização para alterar RLS, Auth ou regras comerciais.

## Melhorias úteis do Vibe Coding Toolkit

Aplicação seletiva do snapshot f13bb354363dafef8ce8d8f605856cc9e1cc52cc, preservando AGENTS.md, CLAUDE.md, stack e gates existentes.

| Prioridade | Melhoria | Evidência / critério de conclusão |
|---|---|---|
| 1 | Testes de jornadas reais | Login persistente, conta sem time, convite, papéis, troca de time e retorno das ferramentas verificados no navegador; testes de código isolados não substituem a jornada. |
| 1 | Resolver exceções de dependências | Reavaliar advisories antes de 12/11/2026, sem relaxar o bloqueio para novos casos. |
| 1 | Conciliar documentação de arquitetura | Emenda explícita pelo fluxo da constituição; mapa de domínio consistente com o código. |
| 2 | Observabilidade mínima | Erros e falhas de acesso diagnosticáveis sem registrar dados privados ou credenciais. |
| 2 | Preparar cobrança por time | Especificação e critérios acima, antes do checkout. |
| 3 | Lint incremental | Hoje não existe script lint. Avaliar uma configuração pequena em tarefa própria; evitar reformatar toda a base ou instalar presets sem necessidade. |

Não é necessário migrar para Next.js, Drizzle ou uma VPS para começar a cobrar: o banco principal já é Postgres. Separar autorização, serviços e persistência ajuda uma futura mudança de hospedagem; a mudança de provedor deve ter seu próprio plano de dados, acesso, backup e reversão.

## Escopo desta avaliação

Leitura direcionada e inspeção da demonstração local. Não é auditoria completa de segurança, teste de cobrança ou garantia de ausência de regressões. Nenhuma configuração do toolkit foi adotada em massa; não foram adicionados hooks, dependências ou serviços pagos.
