# Evolução da experiência e preparação do produto

Data: 2026-10-13.

Atualização de 14/10/2026: após revisar a prévia, o usuário pediu corrigir
Reclamação/Fominha, avaliar a troca de time e autorizou o deploy Vercel.
O resultado desta continuação está em
[`design-system/aplicacao-local.md`](design-system/aplicacao-local.md) e
[`design-system/publicacao-2026-10-14.md`](design-system/publicacao-2026-10-14.md).
Essa autorização é específica à publicação desta entrega; as restrições do
plano original abaixo registram a etapa anterior.

Status: plano original preservado; primeira etapa implementada localmente por
autorização explícita do usuário. Não autoriza migração, cobrança ou deploy.

Atualização após o ZIP: o usuário autorizou aplicar o design system, corrigir
os fluxos necessários e o CI/CD, com revisão local antes do deploy. Resultado,
critérios e limitações em [`design-system/aplicacao-local.md`](design-system/aplicacao-local.md).
As duas exceções temporárias de auditoria também foram aprovadas explicitamente.
O gate local passou; a execução remota depende de publicação autorizada.
O texto abaixo documenta a análise que antecedeu essa implementação.

Atualização de 13/10/2026: o usuário definiu preparar o design system antes das
alterações de experiência. O briefing está em
[`design-system/briefing.md`](design-system/briefing.md). O diagnóstico confirmado
da falha de CI está em
[`diagnostico-ci-auditoria-2026-10-13.md`](diagnostico-ci-auditoria-2026-10-13.md).
A auditoria de dependências continua falhando; não é declarada corrigida.

## Objetivo

Simplificar a entrada no Professô FC, reunir as ferramentas no ambiente da conta
e preparar uma experiência consistente para web e, futuramente, aplicativo
nativo. Preservar a operação e os dados do Bocaiúva no domínio atual.

## AS-IS antes da implementação: confirmado no código

| Tema | Evidência | Comportamento atual |
| --- | --- | --- |
| Entrada | `src/app/index.tsx`, `IndexScreen` | Já redireciona usuário com time para `/home` e usuário sem time para `/team-access`; depende do usuário retornado pelo store. |
| Restauração | `src/services/auth/firebase-auth-service.ts`, `restoreSession`; `src/config/firebase/client.ts`, `createAuthInstance` | Firebase espera `authStateReady()`; há persistência local configurada para o navegador. |
| Inicialização | `src/store/app-store.ts`, `bootstrap`; `src/services/repository/supabase/composicao/index.ts`, `getInitialSnapshot` | O store publica o contexto após a primeira carga das fatias. A sessão autenticada e a disponibilidade dos dados não têm estados separados na UI. |
| Carregamento | `src/app/_layout.tsx`, `RootLayout` | A raiz é considerada pública e renderiza antes de `ready`. Rotas privadas aguardam com apenas `NoIndexHead`, sem indicador visual de carregamento. |
| Área pública | `src/components/public/PublicPageShell.tsx`; `src/app/index.tsx` | Cabeçalho e rodapé repetem navegação e conteúdo promocional. A entrada contém várias seções e chamadas para as mesmas ações. |
| Ferramentas | `src/components/tools/ToolPageShell.tsx`; `src/app/ferramentas/index.tsx` | Ferramentas públicas, com identidade e navegação próprias. A marca leva ao hub; não há link direto ao início do app nesse shell. |
| Design | `src/constants/theme.ts`; `src/components/ui/`; `src/components/tools/tool-theme.ts` | Já existem tokens e componentes compartilhados. Ferramentas mantêm uma paleta paralela com vários valores repetidos. |
| Conta sem time | `src/app/(app)/_layout.tsx`, `AppLayout` | Rotas internas, exceto acesso e criação de time, exigem um time ativo. Colocar ferramentas nesse grupo sem adaptar a guarda impediria o uso por conta sem time. |
| Dados | `src/services/repository/index.ts`; `src/config/supabase/client.ts` | Repositório real sempre Supabase, autenticação Firebase. O validador de URL exige host terminado em `.supabase.co`, o que impede simplesmente configurar uma VPS com outro host. |
| Estado das ferramentas | `src/store/pickup-tools-store.ts` | Cronômetro e rodízio têm persistência no navegador com chave global; não são, por isso, dados vinculados à conta ou sincronizados entre dispositivos. |
| Plataformas | `app.config.ts`; `CLAUDE.md` | Configuração de exportação web estática; aplicativo nativo ainda requer trabalho próprio de compatibilidade e validação. |

### Causa provável da experiência de entrada

A página pública aparece enquanto o Firebase restaura a sessão e o repositório
carrega os dados. O redirecionamento existe, mas só consegue acontecer quando o
store expõe o usuário. Isso explica a exibição temporária de “Entrar”. Falha de
primeira carga também pode impedir a conclusão do bootstrap.

Não foi reproduzida uma sessão real nem medido o tempo de rede. O diagnóstico
não prova que clicar em “Entrar” seja sempre necessário. A implementação deve
medir separadamente restauração de sessão e primeira carga antes de atribuir
lentidão ao banco ou alterar a persistência.

### Divergências documentais encontradas

- A constituição ainda descreve uso ativo do Firestore para bootstrap,
  notificações e perfis públicos. `CLAUDE.md` e a montagem do repositório
  descrevem Supabase como fonte de dados do produto.
- `CLAUDE.md` diz que elenco fica por último; o código e
  `docs/arquitetura-dados.md` colocam notificações depois de elenco. A invariante
  relevante é preservar elenco como última camada que define contexto.
- Não há pasta `specs/` nesta cópia. Este plano não substitui uma futura spec.

Essas divergências foram relatadas e não resolvidas neste documento. Emenda à
constituição e troca de stack seguem o procedimento de governança existente.

## TO-BE do plano original: consultar aplicação local para itens entregues

### Área pública

- Marca com link para o início.
- Uma frase curta explicando o produto.
- Três caminhos principais: Criar conta, Entrar e Galeria.
- Rodapé discreto: Privacidade, Termos e Suporte, acessíveis sem login.
- Galeria com busca/filtros quando necessários e os perfis autorizados pelos
  times; sem repetir uma apresentação extensa do produto no rodapé.

### Inicialização e conta

1. Na entrada principal, aguardar a decisão de sessão com marca e “Carregando…”.
2. Sem sessão: mostrar a entrada pública enxuta.
3. Com sessão: abrir automaticamente o ambiente da conta.
4. Com time ativo: preservar o acesso rápido ao painel atual do time.
5. Sem time: oferecer Ferramentas e os caminhos Criar time/Entrar por convite.
6. Falha de inicialização: mostrar mensagem breve e Tentar novamente; não deixar
   carregamento infinito nem interpretar erro de dados como ausência de conta.

A galeria, os perfis públicos e as páginas de ajuda/legal não devem depender da
carga dos dados privados. Links diretos e convites precisam preservar o destino.

### Ferramentas

- Acesso pelo ambiente da conta, inclusive sem participar de um time.
- Cabeçalho com Início e Ferramentas, com destino explícito para retorno mesmo
  ao abrir por link direto.
- Título, descrição de uma frase e controles úteis já no primeiro bloco.
- Ajuda complementar recolhida em “Como usar”, quando necessária.
- Preservar cálculos, sorteios, placar e andamento do cronômetro/rodízio.
- Ao exigir login, definir também o que ocorre com estado local existente,
  logout e troca de conta; não atribuir automaticamente dados globais a alguém.

Transformar ferramentas públicas em ferramentas da conta é mudança de produto.
Antes de executar, a spec deve registrar acesso por URL direta, tratamento das
URLs existentes e revisão dos textos/SEO que hoje prometem “grátis, sem login”.

### Design system incremental

Consolidar a base existente em `src/constants/theme.ts` e `src/components/ui/`.
Evitar uma segunda biblioteca e uma troca global de estilos.

- Usar tokens comuns de cores, tipografia, espaçamento e bordas.
- Distinguir identidade do produto e cores configuráveis do time.
- Padronizar botão, campo, seção, navegação e estados de carregamento/erro/vazio.
- Cobrir foco por teclado, contraste, toque, disabled e loading.
- Aplicar primeiro à entrada, galeria e ferramentas; ampliar conforme telas
  forem trabalhadas. Composição específica de ferramenta pode continuar local.

## Preparação comercial e independência de infraestrutura

A decisão de cobrança fica para uma etapa própria: por conta, por time ou por
organização. Conta e vínculo com time devem continuar sendo conceitos separados.
O direito de usar recursos pagos precisará ser validado no servidor; esconder
botões no cliente não implementa cobrança nem autorização.

O banco atual já é PostgreSQL no Supabase. Há duas possibilidades futuras:

- Supabase na VPS: mantém mais serviços e interfaces familiares, mas exige
  operação, backups, atualizações e validação da integração Firebase/JWT.
- PostgreSQL na VPS com API própria: exige substituir os serviços utilizados
  de API de dados, funções, mídias e atualizações, além de preservar autorização.

Não basta trocar a URL. Além do validador de host, existem dependências de
Supabase fora do repositório, como chamadas de Edge Functions no serviço de
autenticação. Antes da migração, inventariar essas dependências, usar o contrato
`AppRepository` como fronteira de dados e planejar adaptadores apenas para
dependências reais. O cliente web/nativo acessaria uma API, não uma conexão
administrativa direta ao PostgreSQL.

Para preservar o domínio e o Bocaiúva: manter IDs e vínculos do time, separar
configuração da marca do produto da identidade do time e decidir depois se o
novo domínio usará a mesma instalação ou uma instalação independente. O mesmo
código poderá servir às duas, com configurações próprias. Bancos independentes
não implicam sincronização automática entre instalações.

Referências consultadas:

- [Banco PostgreSQL do Supabase](https://supabase.com/docs/guides/database/overview).
- [Supabase em infraestrutura própria e responsabilidades operacionais](https://supabase.com/docs/guides/self-hosting).
- [Persistência de autenticação Firebase no navegador](https://firebase.google.com/docs/auth/web/auth-state-persistence).

## Entregas pequenas, em ordem

| Etapa | Escopo mínimo | Arquivos relacionados | Risco principal |
| --- | --- | --- | --- |
| 0 | Preparar design system: briefing, tokens propostos, componentes e pranchas; prioridade atual do usuário | `docs/design-system/briefing.md`, base atual em `src/constants/theme.ts` e `src/components/ui/` | Tratar proposta visual como código já implementado; criar sistema paralelo. |
| 1 | Loading, erro recuperável e entrada automática previsível, preservando os destinos atuais | `src/app/index.tsx`, `src/app/_layout.tsx`, `src/store/app-store.ts`; diagnóstico em `src/services/auth/firebase-auth-service.ts` | Confundir falha de dados com logout; loop de redirecionamento. |
| 2 | Entrada/galeria enxutas e base visual compartilhada | `src/components/public/PublicPageShell.tsx`, `src/app/index.tsx`, `src/app/teams-gallery.tsx`, `src/constants/theme.ts`, `src/components/ui/` | Contraste/tema dos times e layout responsivo. |
| 3 | Ferramentas no ambiente da conta, retorno claro e textos reduzidos | `src/app/(app)/_layout.tsx`, `src/app/ferramentas/`, `src/components/tools/`, `src/components/navigation/WebScreenHeader.tsx`, `src/store/pickup-tools-store.ts` | Bloquear conta sem time; perder estado; mudar acesso público e URLs. |
| 4 | Spec de planos, titularidade e direitos de uso | Contratos de domínio e backend a definir após decisão comercial | Bloqueios indevidos de jogadores e do time existente. |
| 5 | Compatibilidade nativa e eventual VPS | Serviços de autenticação, mídias, notificações, persistência e repositório a inventariar | Migração parcial sem equivalência funcional; operação de infraestrutura. |

Portão técnico paralelo: corrigir a auditoria de dependências em uma entrega
separada, antes de declarar CI/CD resolvido ou publicar a evolução. O workflow
permanece exigindo auditoria; nenhuma atualização de SDK foi feita nesta fase.

## Critérios de aceitação para a implementação futura

- Sessão válida retorna automaticamente ao app ao reabrir a entrada, sem clique.
- Enquanto a decisão de sessão estiver pendente, a entrada não apresenta uma
  chamada enganosa para novo login.
- Visitante recebe apenas as três ações principais e ajuda/legal no rodapé.
- Erro de primeira carga tem recuperação; indisponibilidade não vira logout.
- Galeria, perfil público e ajuda/legal continuam acessíveis sem sessão.
- Conta sem time consegue usar ferramentas; permissões de gestão dos times são
  preservadas.
- Toda ferramenta permite voltar ao início com uma ação, inclusive por acesso
  direto. Voltar não encerra o cronômetro nem apaga o rodízio.
- Troca de conta não expõe estado local de outra pessoa.
- Textos explicativos das ferramentas ocupam no máximo um parágrafo curto;
  controles são prioritários em telas pequenas.
- Contraste, foco, toque e estados de erro/loading são conferidos visualmente.
- Typecheck e testes passam; build web passa nas etapas que alterarem o app.
- Bocaiúva mantém seus IDs, vínculos, dados e operação no domínio atual.

## Limites desta preparação

O plano inicial e, posteriormente, o briefing de design system e o diagnóstico
de CI foram documentados. Fluxos, autenticação, permissões, banco, dependências,
credenciais e deploy não foram alterados. Critérios de aceitação
acima descrevem trabalho futuro e não são apresentados como já atendidos.
