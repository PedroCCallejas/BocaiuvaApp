# Plano — Financeiro por categorias (bola, água, cerveja, campo)

> Documento de **planejamento**. Nenhuma linha de código foi escrita para isso ainda.
> Aprovar antes de implementar, porque mexe em modelo de dados e regras de negócio.

## 0. Decisões já tomadas

| Pergunta | Decisão |
|---|---|
| Categorias fixas ou livres? | **Livres.** O admin escreve o título da categoria. Sem lista fechada. |
| Vínculo com a partida | **Opcional e explícito.** A despesa nasce solta; o admin escolhe a data e, se quiser, vincula a um jogo. |
| Quem participou / consumiu | **Livre.** O admin monta a lista de participantes de cada despesa, sem herdar automaticamente a presença do jogo. |
| Visibilidade | **100% admin** por enquanto. Jogador não vê nada de financeiro. |
| Mensalidade recorrente | Fora da v1. |

## 1. Situação atual

A tela `financeiro.tsx` (agora aba, só admin) cobre **apenas o custo do campo por partida**:

- `match.fieldCost` → `{ totalAmount, splitCount }` — quanto custou e entre quantos dividir
- `match.fieldPayment` → `{ payerPlayerIds, paidGuestCount, pixKey, responsibleName }` — quem já pagou
- `src/lib/finance.ts` monta o resumo por ano/mês/status
- `src/lib/money.ts` centraliza o cálculo em centavos

Ou seja: **uma despesa por partida, um rateio, um controle de pagamento**. Não existe conceito de categoria, nem de despesa avulsa (fora de partida), nem de consumo individual.

## 2. O que muda

O pedido quebra três premissas do modelo atual:

1. **Várias despesas por partida** (campo + bola + água + cerveja), não uma só.
2. **Rateio diferente por despesa** — quem jogou divide o campo; quem bebeu divide a cerveja. São grupos distintos.
3. **Despesas fora de partida** — uma bola comprada uma vez, rateada entre o elenco.

## 3. Modelo de dados proposto

Nova coleção `expenses`, irmã de `matches`, em vez de inflar o documento da partida.

```ts
interface ExpenseCategory extends BaseEntity {
  teamId: string;
  label: string;        // livre: "Cerveja", "Bola", "Churrasco pós-jogo"
  archivedAt?: string | null; // some da lista sem apagar o histórico
}

interface Expense extends BaseEntity {
  teamId: string;
  categoryId: string;
  matchId?: string | null;        // null = despesa solta (padrão)
  description?: string | null;
  date: string;                   // YYYY-MM-DD — o admin escolhe
  totalAmountCents: number;       // sempre em centavos
  paidByPlayerId?: string | null; // quem adiantou o dinheiro
  splitMode: 'equal' | 'manual';
  participantPlayerIds: string[]; // quem o admin marcou como participante
  extraSharesCount: number;       // convidados sem cadastro
  manualSharesCents?: Record<string, number>; // só quando splitMode === 'manual'
  settledPlayerIds: string[];     // quem já acertou
  createdBy: string;
}
```

**Decisões embutidas:**

- **Categoria é entidade própria com rótulo livre**, criada pelo admin. Uma coleção pequena (poucos documentos por time) que permite renomear sem reescrever o histórico. Arquivar em vez de apagar preserva despesas antigas.
- **`matchId` é opcional e começa nulo.** A despesa existe por si; vincular a um jogo é uma escolha do admin, feita depois se ele quiser.
- **`participantPlayerIds` é sempre manual.** Não herda presença do jogo — quem bebeu não é quem jogou, e o admin decide caso a caso. Se a despesa estiver vinculada a uma partida, a tela pode *oferecer* os presentes como atalho de preenchimento, mas nunca impor.
- `splitMode`:
  - `equal` — divide igual entre os participantes marcados
  - `manual` — valores diferentes por pessoa (alguém tomou 3 cervejas)
- Valores **sempre em centavos**, passando por `src/lib/money.ts`. Nunca float.
- `settledPlayerIds` reaproveita a ideia de `payerPlayerIds` que já funciona no campo.

## 4. Compatibilidade com o que já existe

O `fieldCost`/`fieldPayment` da partida **não é removido**. Duas opções:

- **A (recomendada)** — manter `fieldCost` como está e tratar as despesas novas como adicionais. O resumo financeiro soma os dois. Risco baixo, zero migração, nada quebra.
- **B** — migrar `fieldCost` para uma `Expense` de categoria `campo`. Modelo mais limpo, mas exige script de migração e mexe em código já validado por 249 testes.

Recomendo **A** para a v1 e reavaliar depois, se o modelo novo provar que funciona.

## 5. Telas

**Aba Financeiro (existente, estendida)**

- Resumo do mês: total gasto, total já acertado, total pendente
- Abas internas: `Partidas` (o que já existe) | `Despesas` (novo)
- Lista de despesas com filtro por categoria e mês
- Botão "Nova despesa"

**Modal de despesa (novo)**

- Categoria: chips das já criadas + campo "nova categoria" que cria na hora
- Valor → data (o admin escolhe) → descrição opcional
- "Vincular a um jogo" — desligado por padrão; ligando, aparece a lista de partidas daquela data em diante
- Quem pagou (select de jogador)
- Modo de rateio → seleção manual dos participantes
  - Quando houver partida vinculada: botão "usar quem esteve presente" apenas como atalho de preenchimento
- Lista com valor por pessoa e toggle "acertou"

**Ficha do jogador**

- Nada por enquanto — financeiro é 100% admin nesta versão.
- Quando for liberado para o jogador, o lugar natural é um bloco "Minhas pendências" na própria ficha.

## 6. Permissões e regras do Firestore

- **Criar / editar / excluir despesa e categoria**: só admin do time (`canManageTeam`)
- **Ler**: **só admin** nesta versão. Regra mais restritiva agora e mais fácil de afrouxar depois do que o contrário.
- **Marcar como acertado**: só admin

Isso exige **nova regra em `firestore.rules`** para a coleção `expenses`. Vou escrever a regra e mostrar o diff, mas **não aplico sem seu ok explícito**, conforme as regras do projeto.

## 7. Fases sugeridas

| Fase | Entrega | Risco |
|---|---|---|
| 1 ✅ | Tipos + `src/lib/expenses.ts` (cálculo puro) + 19 testes | **Concluída** |
| 2 | Repositório (mock + firebase) + regra do Firestore | Médio — precisa da sua aprovação para as rules |
| 3 | Tela de listagem de despesas dentro da aba Financeiro | Baixo |
| 4 | Modal de criar/editar despesa, com categoria livre e rateio manual | Médio |
| 5 | Vínculo opcional com partida + atalho "usar presentes" | Baixo |

Cada fase termina com `npm run typecheck` e `npm run test` verdes.

## 8. Riscos

- **Rateio manual é a parte mais fácil de errar.** A soma das partes precisa bater com o total, com sobra de centavos indo para alguém. Toda a lógica fica em `src/lib/expenses.ts`, isolada e testada, antes de qualquer tela.
- **Firestore rules** — a coleção nova nasce sem regra. Sem a regra, ou tudo é negado ou (pior) fica aberto. Fase 2 não sobe sem isso resolvido.
- **Volume de leitura** — despesas crescem mais rápido que partidas. Vale limitar a consulta a um intervalo de meses desde o começo.
- **Escopo** — "e por aí vai" pode virar controle de caixa completo (mensalidade, saldo, histórico). A v1 propositalmente para em "despesa avulsa com rateio". Mensalidade recorrente fica para depois.

## 9. Decisão: A, com camada de unificação (strangler fig)

**Escolhida a opção A**, com um refinamento que elimina o principal defeito dela.

### Evidência que decidiu

Contagem de ocorrências de `fieldCost`/`fieldPayment` no código:

| Arquivo | Ocorrências |
|---|---|
| `src/app/(app)/matches/[matchId].tsx` | 82 |
| `src/services/repository/firebase-repository.ts` | 45 |
| `src/app/(app)/matches/[matchId]/finish.tsx` | 35 |
| `tests/stats-breakdown-finance-cases.ts` | 27 |
| `src/services/repository/mock-repository.ts` | 26 |
| demais (lib, types, tests) | ~39 |

São **~254 pontos de acoplamento** em código coberto por testes que já passam. Migrar (opção B) significaria reescrever tudo isso de uma vez, com script de migração de dados em produção, para ganhar elegância de modelo. Custo alto, benefício estético.

### O refinamento

A literatura sobre o padrão *strangler fig* aponta o risco real da opção A: a coexistência vira permanente e o sistema fica com dois modelos concorrentes para sempre. A saída é fazer a coexistência **por baixo**, não por cima.

Por isso `src/lib/expenses.ts` expõe um formato único (`UnifiedExpense`) e um único ponto de entrada (`collectTeamExpenses`). O adaptador `fieldCostToUnifiedExpense` é **a única função no app que conhece o modelo legado**. Telas, resumos e saldos leem só o formato unificado.

Consequência prática: se um dia quisermos migrar de verdade, muda-se o adaptador e nada mais. E o `includeFieldCosts: false` já permite desligar a fonte legada num piscar, quando a migração acontecer.

### Modelo de dados escolhido para as cotas

Seguindo o desenho consagrado dos apps de divisão de contas: cada despesa tem **um pagador**, uma data, e uma lista de participantes com cotas opcionalmente customizadas. O acerto é registrado por participante (`settledPlayerIds`) em vez de "fechar" a despesa, o que preserva o histórico e permite acerto parcial.

O ponto mais delicado — sobra de centavos — é resolvido em `splitEqualCents`: a divisão distribui o resto centavo a centavo entre os primeiros participantes, e há teste garantindo que **a soma das partes é sempre exatamente o total** (R$ 1,00 entre 3 vira 34 + 33 + 33).
