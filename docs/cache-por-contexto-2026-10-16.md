# Correção do cache por conta e time

Status: implementada na branch `codex/validacao-cache-backup`, sem publicação em produção nesta tarefa.

## Causa demonstrada

`src/services/repository/supabase/fatias.ts` preservava o último valor após falha de rede, mas sem separar conta e time. Depois de mudar o contexto, essa mesma política podia reaplicar a fatia anterior. A composição consultava apenas o que faltava na primeira carga; logout limpava a tela, mas não o cache das fatias.

Reprodução controlada com o código anterior (`332f5c2`): carregar A, mudar o time simulado para B e falhar a leitura de financeiro. O teste que exige falha da primeira carga B acusa `Missing expected rejection`; a implementação anterior conservava o financeiro A. É prova do componente/composição com IO simulado, **não evidência de exposição real entre usuários em produção**.

## Menor correção aplicada

- Contexto explícito por conta autenticada e ID de time ativo antes de compor o snapshot. A fonte do time continua sendo o banco.
- Invalidação das fatias e do emissor anterior ao trocar contexto e após operações que podem mudar o time; logout descarta o cache junto do snapshot.
- Número de geração e de leitura impedem respostas atrasadas de recolocar dados antigos. Retentativas pendentes são canceladas na invalidação.
- A falha de atualização no **mesmo contexto** continua preservando o último dado válido. Em outro contexto, a primeira carga deve ter sucesso, sem tratar falha como lista vazia verdadeira.
- O repositório confere novamente o time ativo após a carga e rejeita composição atravessada por troca em outra aba.
- Conta sem time carrega o contexto de elenco/onboarding; não consulta módulos que exigem time. Visitante recebe somente a base, sem dados privados.
- Trocar time força snapshot completo mesmo com Realtime conectado. Durante essa carga, o store remove os domínios do time anterior e preserva somente identidade e vínculos da mesma conta.

Não mudou login, provedor de identidade, claims, permissões, policies RLS, schema, credenciais, dependências ou regras de negócio.

## Critérios e evidência

| Critério | Verificação |
|---|---|
| Reutilizar cache somente na mesma conta/time | Teste executável das fatias |
| Falha da leitura B não reaplica dados A | Teste executável das fatias e composição real com IO simulado |
| Outra conta no mesmo time não herda cache | Testes executáveis |
| Resposta antiga depois da troca/logout é descartada | Promessas controladas nos testes das fatias |
| Emissor antigo não monta snapshot novo sobre base anterior | Teste com callback de emissão |
| Visitante e conta sem time continuam funcionando | `tests/supabase-cache-composition.mjs`, carregando o módulo real de composição |
| Mudança de time durante leitura não entrega snapshot misturado | Teste executável de composição |
| Nenhuma regressão de tipos e testes do projeto | `npm run typecheck` e `npm run test`: 618 testes aprovados nesta rodada |

O teste de integração simula somente as bordas de IO (Auth já resolvido, cliente, leitura do time e camadas de domínio); usa a implementação real de composição e cache. Não equivale a um teste do serviço Firebase, rede Supabase ou navegador físico.

## Riscos e limites

São duas consultas leves de identificação do time por snapshot para conferir o contexto antes/depois; não é cache persistido em disco. Realtime e atualização manual continuam sujeitos à rede. A correção não altera Service Worker/CDN, porque o problema demonstrado estava nas fatias em memória.

O teste real A→B→A da sessão do proprietário já havia passado antes da alteração. A nova correção precisa de conferência no preview com sessão real antes de uma eventual integração/publicação, além do CI da branch; não foi aplicada à produção.
