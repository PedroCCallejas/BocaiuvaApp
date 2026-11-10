# SEO e descoberta por buscadores com IA

Status: plano preparado em 16/10/2026; não houve submissão em buscadores, registro de domínio ou mudança de indexação nesta rodada. Prioridade: páginas públicas úteis e privacidade da área dos times. SEO é otimização para busca; não cria garantia de posição ou citação por IA.

## O que o código já possui (AS-IS)

| Evidência local | Situação e limite |
|---|---|
| `src/lib/public-seo.ts` | Canonical usa `https://bocaiuva-app.vercel.app`; domínio de produto ainda precisa ser escolhido |
| `src/components/seo/PublicSeoHead.tsx` | Título, descrição, canonical, Open Graph e Twitter; imagem é opcional, sem imagem padrão garantida |
| `src/lib/seo-routes.ts` e `src/app/_layout.tsx` | Área `(app)` e `(auth)` recebe noindex/nofollow; somente determinadas rotas públicas são indexáveis |
| `src/app/teams/[teamId]/public.tsx` | Perfis públicos têm condição própria de noindex; acesso depende das configurações públicas do time |
| `public/robots.txt` | `User-agent: *`, `Allow: /` e referência ao sitemap; não constitui controle de acesso |
| `public/sitemap.xml` | Cinco URLs estáticas: início, galeria, privacidade, termos e suporte; não lista automaticamente perfis de times |
| `src/components/tools/ToolSeoHead.tsx` | Ferramentas definem metadata pública, mas `/ferramentas` não está na lista indexável atual; metadata sozinha não garante indexação |
| `replica/bugs.md`, B01 | Título de página anterior permaneceu ao navegar em SPA; gap já observado, não corrigido neste escopo de cache |

Não foi consultada uma propriedade Search Console ou Bing Webmaster autenticada. Não conhecemos impressões, páginas indexadas, buscas de marca ou tráfego orgânico real. Exportar 87 rotas não significa ter 87 páginas úteis indexadas.

## Etapa 1 — domínio e hospedagem

1. Escolher o domínio definitivo e conferir disponibilidade/preço no registrador, sem comprar antes da decisão do proprietário. HTTPS obrigatório. Não é necessário migrar Postgres para uma VPS para ter domínio próprio.
2. Manter inicialmente Vercel + Supabase, evitando uma migração operacional junto do lançamento. O produto já usa Postgres; VPS adicionaria administração de atualizações, rede e recuperação.
3. Conferir o plano Vercel antes de receita por assinatura, anúncios ou patrocínio. O [Hobby é restrito a uso pessoal não comercial](https://vercel.com/docs/plans/hobby). Não foi contratado ou presumido plano pago.
4. Ao mudar o domínio: atualizar uma única fonte de URL, canonical, sitemap, robots, URLs compartilhadas e destinos públicos. Preparar redirecionamentos permanentes do domínio antigo e conferir se preservam rotas.
5. Conferir domínios autorizados e redirects do login em tarefa própria, com aprovação explícita para Auth antes de alterar. Comprar domínio não configura Google login automaticamente.

Aceite: domínio principal responde por HTTPS; cada URL antiga abre o equivalente novo com redirecionamento apropriado; canonical aponta para uma URL final 200; privacidade e suporte funcionam; login validado após qualquer alteração autorizada.

## Etapa 2 — corrigir indexação e metadata pública

1. Separar explicitamente páginas públicas e privadas. **Nunca colocar no sitemap** painel, login/cadastro, convites, códigos, elenco privado, financeiro, exportações ou páginas administrativas.
2. Corrigir B01 e verificar navegação início → ferramenta → galeria → painel: título/canonical/robots correspondem à rota atual; metadata de uma página não permanece na seguinte.
3. Decidir se haverá ferramentas públicas como aquisição. Se sim, criar páginas úteis com explicação curta, resultado acessível e conteúdo textual original e revisar a regra que hoje as torna noindex. Se continuarem restritas à conta, aceitar o noindex e produzir guias públicos separados. **Não remover noindex em lote.**
4. Conferir HTML exportado e DOM renderizado: título único, descrição específica, um título principal claro, links reais rastreáveis e canonical absoluto. Uma chamada que só funciona com sessão não é conteúdo público para SEO.
5. Perfis dinâmicos: incluir em sitemap somente times com publicação autorizada; retirar ao despublicar, não expor contatos privados. Conferir estado 404/indisponível e noindex para IDs literais/placeholder, inexistentes ou privados. Não tratar HTML genérico “carregando” como perfil indexado.
6. Usar `lastmod` somente quando houver mudança real relevante. Sitemap com URLs canônicas 200, sem duplicação por query string ou aliases de exportação.
7. Adicionar imagem social padrão própria e metadados por página; verificar compartilhamento com URL pública, sem depender da sessão do dono.

Aceite: matriz documentada por rota e teste visitante sem sessão; sitemap contém apenas páginas aprovadas; URL pública renderiza conteúdo suficiente; rotas privadas mantêm proteção de servidor e noindex. [Robots não substitui autenticação nem impede necessariamente que uma URL apareça na busca](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## Etapa 3 — Search Console e Bing

1. Proprietário verifica domínio no Google Search Console e Bing Webmaster Tools; usar a integração/DNS autorizada, sem colar credenciais na conversa.
2. Enviar o sitemap público e inspecionar início, galeria, um perfil autorizado e uma página privada de controle. Conferir canonical selecionada, noindex e conteúdo renderizado.
3. Revisar cobertura/exclusões após o rastreamento; distinguir “descoberta”, “rastreada” e “indexada”. Não prometer indexação imediata.
4. Considerar [IndexNow](https://www.indexnow.org/documentation) para informar criação/alteração/remoção de URLs públicas aos buscadores participantes. Implementar chave de propriedade e envio somente após domínio estável; não usar como garantia de inclusão e não presumir suporte do Google.
5. Registrar semanalmente impressões, cliques, consultas, landing pages e conversão em organizador/time ativado. Não enviar e-mail, nome, elenco ou dados financeiros a ferramentas de analytics. Instalação de medição/consentimento é etapa futura aprovada separadamente.

O [sitemap ajuda a descoberta, mas não garante rastreamento ou indexação](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview).

## Etapa 4 — conteúdo que pode trazer organizadores

Publicar poucos materiais realmente úteis, ligados à rotina do produto: organizar presença no futebol society, montar escalação, ratear campo, acompanhar temporada e convidar jogadores com privacidade. Demonstrar funções que existem e usar exemplos fictícios ou autorizados.

Cada página deve responder uma pergunta específica com instrução curta, exemplo, limitações e link para experimentar o produto. Manter página “Sobre”, suporte, autoria/responsável e datas quando relevantes. Não gerar centenas de páginas por cidade/time sem conteúdo próprio ou inventar depoimentos.

Dados estruturados possíveis: `Organization` para a marca, `WebSite`, `BreadcrumbList` onde exista navegação correspondente e `SoftwareApplication` somente com atributos verdadeiros e requisitos atuais. Não inventar avaliações, número de clientes, preço ou estrelas para rich results. [Documentação oficial de software apps](https://developers.google.com/search/docs/appearance/structured-data/software-app).

Aceite: conteúdo visível corresponde aos dados estruturados; páginas úteis em mobile; links funcionam; nenhum contato privado ou benefício ainda não lançado é usado como promessa.

## Etapa 5 — busca com IA, sem promessa de “atalho”

- **Google AI Overviews/AI Mode:** trabalhar a mesma base técnica e editorial de SEO. O [Google não exige arquivo especial de IA nem schema adicional](https://developers.google.com/search/docs/appearance/ai-features). A página precisa estar indexada e elegível para snippet; aparecer não é garantido.
- **ChatGPT Search:** conferir se `OAI-SearchBot` pode acessar as páginas públicas no robots e na infraestrutura. A [OpenAI distingue esse robô de busca do `GPTBot`, usado para treinamento](https://developers.openai.com/api/docs/bots). A decisão de treinamento é independente; não alterar essa preferência silenciosamente. Não liberar áreas privadas para robôs.
- **Bing/Copilot:** preparar páginas rastreáveis, verificar Bing Webmaster e acompanhar referências reais; IndexNow é uma opção de notificação, não uma garantia de citação.
- Usar texto claro sobre o que é o Professô FC, para quem serve, recursos reais e como começar, com URLs estáveis e fontes primárias quando citar fatos. Nenhum mecanismo precisa ler dados internos de times para explicar o produto.
- `llms.txt` é opcional e não é condição comprovada de posicionamento. Não priorizá-lo acima de corrigir noindex/canonical/conteúdo. Não criar API pública de dados de usuários para “agradar IA”.

Aceite: crawlers autorizados acessam páginas públicas; conteúdo é compreensível sem login; referências de buscadores/IA são medidas quando ocorrerem, sem confundir visita de robô com aquisição de cliente.

## Ordem prática

1. CI/cache/recuperação e piloto.
2. Decisão de domínio + custo de hospedagem comercial.
3. Metadata/rotas públicas e sitemap corretos.
4. Verificação dos buscadores e conteúdo inicial útil.
5. Medir organizadores que criam time e usam o produto; só depois investir em publicidade ou volume de conteúdo.

Todo deploy de produção, alteração de Auth, credenciais e DNS depende do escopo e da aprovação correspondente. Este documento prepara as tarefas; não registra esses passos como executados.
