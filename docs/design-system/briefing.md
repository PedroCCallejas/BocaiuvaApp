# Professô FC — briefing do design system

Atualizado: 2026-10-13. Status: proposta visual v0.1 para configurar o design
system na ferramenta apresentada pelo usuário. Nenhuma tela do app foi alterada.

## 1. Company name and blurb

Copiar este texto para o primeiro campo:

```text
Professô FC — Design System

Plataforma brasileira para organizar futebol amador, society e futsal. Administradores gerenciam times, jogadores, partidas, presença, escalações, estatísticas e financeiro. Jogadores acompanham sua participação. A plataforma também oferece sorteador de times, cronômetro com placar, rodízio e campeonato rápido.

O produto já existe como aplicação web e deve evoluir para aplicativo e assinatura paga. Queremos uma interface esportiva, clara e profissional, com tema escuro, navegação previsível, pouco texto e prioridade às tarefas. A marca do produto é Professô FC; Bocaiúva é um dos times e tem sua própria identidade. Criar uma base visual consistente que preserve essa separação.
```

## 2. Link code from GitHub

URL real do repositório:

```text
https://github.com/PedroCCallejas/BocaiuvaApp
```

O nome do repositório é histórico; o nome atual do produto é Professô FC.
Se a ferramenta não tiver acesso ao repositório, usar a pasta selecionada abaixo.
Não é necessário enviar o projeto completo e não usar as duas fontes sem
necessidade: o pacote local torna o contexto menor e mais direcionado.

## 3. Link code from your computer

Selecionar a pasta `01-codigo` do pacote `professo-fc-design-system`, preparada
nos artefatos locais desta sessão. Contém cópias dos arquivos de tema,
componentes e telas relevantes. É referência de código, não projeto executável.

Fontes selecionadas:

- `src/constants/theme.ts`, `branding.ts` e `src/hooks/use-app-theme.ts`.
- Componentes `src/components/ui/` e `src/lib/color-contrast.ts`.
- Shells público e de ferramentas; cabeçalho web.
- Entrada, galeria e hub de ferramentas, com seus padrões atuais.
- `src/types/domain.ts`, `package.json`, `app.config.ts` e este briefing.

O pacote não contém credenciais, `.env`, dados de jogadores, dump do Firestore,
configurações de acesso, banco ou histórico Git. Importações externas aos
arquivos selecionados podem não resolver: a pasta serve à análise de design.

## 4. Upload a .fig file

Deixar vazio: não há arquivo Figma fornecido ou confirmado. O campo é opcional.
Não renomear imagens ou ZIP para `.fig`.

## 5. Add fonts, logos and assets

Selecionar os arquivos das pastas `02-assets` e `03-referencias`:

1. `professo-fc-logo.png`: marca atual copiada de `assets/images/icon.png`.
2. `professo-fc-simbolo.png`: símbolo atual copiado de `assets/images/favicon.png`.
3. `situacao-atual-inicio.png`: captura fornecida pelo usuário, como diagnóstico
   da repetição e densidade atuais; não é o layout a reproduzir.
4. `01-direcao-visual.jpg`: prancha original com paleta, tipografia, componentes
   e exemplo de painel de ferramentas.
5. `02-fluxos-e-mobile.jpg`: prancha original com entrada pública simplificada,
   ferramentas e estados de carregamento/erro.

As pranchas são propostas de direção, com dados ilustrativos. Não comprovam
funcionalidades implementadas. Os HTML correspondentes permitem rever o layout.

Fontes: não há família customizada instalada ou anexada. Na primeira versão,
manter fontes do sistema e os fallbacks atuais por plataforma. A prancha web usa
`system-ui`/Segoe UI. Inter pode ser avaliada depois como decisão independente,
com licença e carregamento verificados, sem prometer que já existe no projeto.

## 6. Any other notes?

Copiar o bloco abaixo inteiro:

```text
OBJETIVO
Consolidar o design system existente do Professô FC e criar uma experiência esportiva, profissional e fácil de usar. Melhorar principalmente entrada, galeria e ferramentas. Usar o código anexado como evidência do estado atual; as pranchas são a direção desejada. Documentar diferenças e aplicar a evolução gradualmente.

IDENTIDADE E CORES
Preservar o nome Professô FC e a marca anexada. A marca do produto não deve ser confundida com escudos ou cores de times. O tema de um time pode variar, preservando legibilidade e hierarquia. Tema escuro como base: fundo #070A0D; fundo elevado #0B1016; superfície #111820; superfície secundária #17212B; texto principal #F7F9F8; texto secundário #A2AFBA. Verde #1E6A45 para identidade esportiva; verde-limão #D7FF64 para ações principais; azul #6EDBFF para informação e apoio. Sucesso #5DE38B, alerta #FFC857, erro #FF717D. Usar um destaque principal por contexto e cores de estado com significado. Não usar verde escuro com texto escuro em ações.

TIPOGRAFIA E ESPAÇAMENTO
Começar com as fontes do sistema já usadas, com fallback por plataforma. Texto corrente 15–16 px; legendas úteis 13–14 px; títulos de seção 20–24 px; títulos de página 28–32 px. Números de placar e cronômetro podem ser maiores e devem usar algarismos tabulares quando disponíveis. Usar pesos 400/500 para texto e 600/700 para títulos e ações; evitar peso 900 em toda a interface. Espaçamentos por tokens, com base de 4 px; propor uma evolução compatível com os valores existentes, sem migração global obrigatória. Bordas discretas, raios moderados, poucos níveis de superfície. Não colocar cada frase em um card separado.

ENTRADA PÚBLICA E GALERIA
Entrada curta: marca, uma frase sobre organizar futebol e três ações — Criar conta, Entrar e Galeria. Privacidade, Termos e Suporte ficam no rodapé e continuam acessíveis sem login. Remover apresentações e navegação duplicadas na proposta. A galeria dá destaque aos times e à ação de abrir o perfil; usar apenas os dados públicos já autorizados. Não adicionar exposição de dados privados.

AMBIENTE DA CONTA E FERRAMENTAS
Uma conta pode utilizar ferramentas mesmo sem criar ou participar de um time. Preservar painel e gestão para quem tem time. Navegação sempre mostra um caminho direto para Início e Ferramentas; acesso por link direto também precisa permitir retorno. Cada ferramenta começa com título, descrição de uma frase e seus controles. Ajuda adicional pode ficar recolhida. No celular, priorizar toque, teclado virtual e ações principais visíveis. Não alterar sorteio, cálculo, placar, rodízio, regras de negócio ou permissões durante o design.

ESTADOS E COMPONENTES
Definir tokens semânticos e componentes de botão, campo, seção, card quando necessário, linha de lista, badge, navegação, modal de confirmação e estados loading/vazio/erro. Reutilizar e evoluir AppButton, AppInput, Screen, EmptyState, Pill e SectionHeader existentes. Cobrir default, foco, hover no web, pressed no touch, disabled e loading. Preparar tela inicial de carregamento de sessão e erro com Tentar novamente. Não tratar ausência temporária de dados como logout ou como lista vazia. A galeria e as páginas públicas não dependem da carga dos dados privados.

ACESSIBILIDADE E MOVIMENTO
Texto normal com contraste mínimo 4,5:1; elementos essenciais não textuais com 3:1. Estados também precisam de texto/ícone, não apenas cor. Alvos de toque com pelo menos 44 px, foco visível e uso por teclado. Animações curtas de 120–200 ms apenas para feedback e continuidade; respeitar movimento reduzido. Evitar glow constante, partículas, 3D decorativo, vídeos automáticos e animações que atrasem o uso. Cronômetro e placar devem manter a leitura estável.

REFERÊNCIAS
Refero Styles / Linear: inspiração para hierarquia de superfícies, navegação discreta e destaque de ações, adaptando à marca do Professô FC. Spell UI: inspiração para resposta dos controles; usar comportamento equivalente compatível com a stack, sem importar efeitos decorativos ou dependências automaticamente. Inspora: repertório complementar de composição e branding. Os sites são inspiração, não especificação obrigatória. As pranchas originais anexadas são a referência prioritária do resultado desejado.

STACK E LIMITES
Expo SDK 55, React Native, Expo Router e TypeScript; web em produção e versão nativa futura. Não converter o projeto para Next.js, Tailwind, shadcn ou HTML puro. Na aplicação, preservar src/constants/theme.ts e src/components/ui/ como base; não criar sistema paralelo. CSS pode existir em protótipos web de referência, não como substituição dos componentes compartilhados do app. Não atualizar SDKs, adicionar bibliotecas grandes, alterar autenticação, banco, RLS, credenciais ou fazer deploy. Cobrança e eventual VPS serão etapas separadas.

ENTREGÁVEIS
Guia da identidade; tokens semânticos documentados; componentes e variantes; estados; navegação; exemplos mobile e desktop de entrada, galeria, ferramentas, cronômetro e painel do time. Explicar o que já existe, o que muda e como adotar em etapas. Validar 375/768/1024/1440 px, textos longos, foco, toque, contraste e movimento reduzido. Uma imagem bonita não substitui um fluxo funcional. Priorizar clareza e velocidade de uso.
```

## Referências consultadas e limites

| Origem | Evidência observada | Adaptação proposta | Custo/limite |
| --- | --- | --- | --- |
| [Refero / Linear](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1) | Catálogo de superfícies escuras, tipografia e ações; prancha renderizada conferida no navegador | Reduzir ruído, separar níveis de superfície e reservar destaque para ação | Tokens existentes; não copiar o sistema completo, fontes proprietárias ou identidade. |
| [Spell / Pop Button](https://spell.sh/docs/pop-button) | Componente React de resposta à interação | Feedback curto no botão existente, com teclado/touch e movimento reduzido | React web não implica compatibilidade React Native; não adicionar pacote nesta etapa. |
| [Inspora](https://www.inspora.design/) | Categorias públicas de web, branding, produto e motion | Repertório complementar, sem escolher projeto específico como obrigação | Não foi feita auditoria de um case completo; nenhum asset de terceiros incorporado. |

As pranchas produzidas são originais e usam a paleta do próprio app. Não foi
necessário baixar imagens ou fontes de terceiros. Logos e screenshot do app
foram copiados sem alteração.

## Contrato de adoção

- Manter: identidade Professô FC, cores dos times, stack, componentes e lógica.
- Melhorar: hierarquia, densidade, tokens usados, navegação e textos repetidos.
- Criar: documentação e exemplos dos estados que ainda faltam.
- Remover da proposta: duplicação promocional e de navegação identificada.
- Validar antes de aplicar: contraste, uso real, mobile, web e testes do projeto.

## Orçamento de interação proposto

| Padrão | Gatilho | Duração | Movimento reduzido | Risco |
| --- | --- | --- | --- | --- |
| Botão | Pressionar/foco | 120–160 ms | Resposta por cor/borda | Sem mudar largura ou altura. |
| Navegação | Seleção de destino | 160–200 ms | Estado selecionado imediato | Não atrasar navegação. |
| Expandir ajuda | Ação explícita | Até 180 ms | Expandir sem animação | Não esconder controles essenciais. |
| Loading | Estado real de sessão/dados | Enquanto pendente | Texto de estado estático | Sempre prever erro recuperável. |

## Critérios desta entrega

- Textos correspondem aos cinco blocos do formulário e ao campo de notas.
- URL de repositório real, pasta local selecionada e assets identificados.
- Pranchas não apresentam telas futuras como implementação atual.
- Pacote não inclui segredos, dados pessoais do time nem o backend.
- Estado atual e direção desejada estão explicitamente separados.
- CI/CD tem registro independente; falha de auditoria não é declarada corrigida.
