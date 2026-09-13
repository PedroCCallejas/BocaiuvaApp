# Professô FC Constitution

## Core Principles

### I. Evidência Antes de Alteração

Nenhuma linha de código é modificada antes de a implementação existente ter sido
lida e compreendida. O código existente é a evidência do comportamento atual: o
que ele faz é o que o sistema faz, independentemente do que a documentação diga.

Arquitetura, regras de negócio e comportamento NUNCA podem ser inventados. Toda
afirmação sobre como o sistema funciona DEVE apontar para o arquivo, a função ou
o documento que a sustenta. Na ausência de evidência, a resposta correta é
declarar que não se sabe e investigar — nunca preencher a lacuna com suposição
apresentada como fato.

*Razão:* neste projeto já se pagou caro por leitura errada disfarçada de certeza
(paginação silenciosa do PostgREST, RLS devolvendo zero linhas sem erro). Ausência
de dado é indistinguível de ausência de acesso; só a leitura do código separa os
dois.

### II. AS-IS e TO-BE Declarados

Toda análise DEVE separar explicitamente:

- **AS-IS** — comportamento atual, confirmado por leitura do código ou execução.
- **TO-BE** — comportamento desejado, definido pela specification.

A specification define o comportamento desejado; o código define o comportamento
atual. Os dois são fontes distintas e não se substituem.

Quando código, documentação e specification divergirem, a divergência DEVE ser
relatada ao humano. É proibido escolher silenciosamente qual dos três "está
certo" e seguir em frente com essa escolha embutida na implementação.

*Razão:* uma divergência resolvida em silêncio vira uma decisão de produto tomada
sem ninguém decidir.

### III. Escopo Mínimo e Preservação do Existente

Funcionalidades existentes DEVEM ser preservadas, exceto quando a specification
pedir explicitamente a alteração. Arquivos e comportamentos fora do escopo pedido
NÃO são modificados sem necessidade comprovada e declarada.

Toda alteração DEVE ser pequena, testável e reversível. Refatoração ampla sem
pedido explícito é violação deste princípio.

Erros descobertos fora do escopo DEVEM ser documentados e relatados — nunca
corrigidos silenciosamente junto com a tarefa em andamento.

*Razão:* mudança pequena falha pequeno. Correção carona dentro de outra entrega
esconde a causa quando algo quebra e impede o humano de avaliar o risco que não
pediu para correr.

### IV. Segredos Nunca Expostos

Tokens, API keys, senhas, secrets e credenciais NUNCA são impressos, logados,
commitados, colados em respostas, enviados a serviços externos ou incluídos em
qualquer artefato do repositório.

`.env`, `.env.local`, `google-services.json` e equivalentes só são alterados
mediante pedido explícito do humano. Chave `service_role`, VAPID privada e
credenciais administrativas NUNCA entram em variáveis `EXPO_PUBLIC_*`, que são
publicadas no bundle do cliente.

*Razão:* segredo exposto uma vez está exposto para sempre; rotação é reparo, não
desfazimento.

### V. Operações Irreversíveis Exigem Aprovação Humana

As seguintes operações exigem confirmação humana explícita e prévia, a cada
ocorrência:

- alteração destrutiva em banco de dados (DROP, TRUNCATE, DELETE em massa,
  migration que perde coluna ou dado);
- exclusão de dados de produção;
- deploy para produção (Vercel, `eas build`, Edge Functions);
- qualquer operação sem caminho de volta.

Aprovação dada em um contexto não se estende ao próximo. UPDATE e DELETE DEVEM
sempre dizer em qual linha mexem (`.eq()`), conforme exigido pelo `safeupdate` da
conexão PostgREST.

*Razão:* o custo de perguntar é um minuto; o custo de não perguntar pode ser dado
que não existe mais.

### VI. Pronto Significa Verificado

Trabalho NUNCA é considerado concluído apenas porque o código foi escrito.

Toda feature relevante DEVE ter critérios de aceitação verificáveis, escritos
antes de a implementação ser declarada pronta. Toda implementação DEVE passar por
verificação final contra os critérios da specification, item por item.

Antes de declarar qualquer tarefa técnica concluída, TODAS as validações que
existirem no `package.json` DEVEM ser executadas e seus resultados relatados com
a saída real. Neste projeto, hoje:

1. `npm run typecheck`
2. `npm run test`
3. `npm run build:web` (quando a mudança afeta o build web)

Não existe `npm run lint` neste projeto e o comando NÃO DEVE ser inventado. Se um
script de lint for adicionado ao `package.json`, ele passa a integrar esta lista
obrigatoriamente.

Falha de validação DEVE ser relatada com a saída do comando. Etapa pulada DEVE ser
declarada como pulada.

*Razão:* "escrevi o código" e "o código funciona" são afirmações diferentes, e só
a segunda interessa a quem usa o app.

## Restrições Técnicas e Documentação

**Stack fixa.** Expo / React Native com Expo Router (`src/app/`), Supabase
Postgres como banco principal, Firebase Auth para login, Vercel para o deploy web.
Firestore permanece apenas para bootstrap (`users`, `teams`, `teamMembers`),
notificações e perfis públicos congelados. Trocar qualquer peça dessa stack exige
emenda a esta constituição.

**Dependências grandes** (Expo SDK, Firebase SDK, Supabase, React Native) NÃO são
atualizadas sem pedido explícito do humano.

**Permissão mora na RLS**, não no cliente. Checagem duplicada no app é um segundo
lugar para divergir. Escrita em várias tabelas passa por RPC transacional;
`security definer` só quando a policy não tem como funcionar, sempre com
`search_path` fixo e `revoke` de `public, anon`.

**Leitura de coleção que cresce** usa `todasAsLinhas` (`supabase/paginacao.ts`)
com `order` estável — o PostgREST corta em 1000 linhas sem erro.

**Documentação importante permanece versionada no repositório.** Decisões de
arquitetura, planos de migração, esquemas e políticas ficam em `docs/` e em
`CLAUDE.md`, commitados junto com o código que descrevem. Documento histórico DEVE
ser marcado como histórico (ex.: `docs/plano-migracao-postgres.md` é registro, não
roteiro). Conhecimento que só existe em conversa não existe.

**Migrations** são aplicadas com o nome carimbado pela hora da aplicação. Se
aplicada pela API, o arquivo local DEVE ser renomeado para bater com o remoto.

## Fluxo de Desenvolvimento e Portões de Qualidade

Toda tarefa técnica segue esta ordem:

1. Entender o problema relatado.
2. Ler o código existente e estabelecer o AS-IS com evidência.
3. Identificar a causa provável.
4. Listar os arquivos relacionados.
5. Explicar o risco da alteração.
6. Propor a menor correção segura.
7. Implementar apenas quando o pedido for claramente de implementação.
8. Rodar as validações do Princípio VI.
9. Verificar a implementação contra os critérios de aceitação.
10. Relatar: o que foi feito, arquivos alterados, comandos rodados, resultado dos
    comandos, riscos e observações, próximos passos.

Portões bloqueantes — nenhuma tarefa é declarada concluída com qualquer um destes
em aberto:

- `npm run typecheck` com erro;
- `npm run test` com falha;
- critério de aceitação não verificado;
- divergência entre código, documentação e specification não relatada;
- alteração fora de escopo não declarada.

Git limpo: commits atômicos, mensagem clara, uma intenção por commit.

## Governance

Esta constituição supersede qualquer outra prática, preferência ou hábito no
projeto. Em conflito entre esta constituição e uma instrução pontual, a
constituição prevalece até ser emendada.

**Procedimento de emenda.** Alterações são feitas exclusivamente em
`.specify/memory/constitution.md`, via `/speckit-constitution`, com Sync Impact
Report descrevendo a mudança. Toda emenda exige pedido explícito do humano e é
commitada junto com a justificativa.

**Política de versionamento** (semântico):

- **MAJOR** — remoção ou redefinição incompatível de princípio ou regra de
  governança;
- **MINOR** — novo princípio ou seção, ou expansão material de orientação
  existente;
- **PATCH** — esclarecimento, correção de texto, refinamento não semântico.

**Conformidade.** Toda revisão de código e todo PR DEVEM verificar aderência a
estes princípios. Complexidade adicionada DEVE ser justificada por escrito.
Violação identificada é relatada, não contornada.

**Orientação de runtime.** `CLAUDE.md` (raiz do projeto) carrega a orientação
operacional do dia a dia e DEVE permanecer consistente com esta constituição;
divergência entre os dois é relatada e resolvida por emenda, nunca por
interpretação no momento da tarefa.

**Version**: 1.0.0 | **Ratified**: 2026-09-11 | **Last Amended**: 2026-09-11
