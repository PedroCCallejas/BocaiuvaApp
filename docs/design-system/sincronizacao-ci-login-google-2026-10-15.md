# Sincronização Git, CI e login Google — 15/10/2026

## Estado confirmado (AS-IS)

- Branch enviada: `codex/professo-fc-design-system-ci`.
- PR em rascunho: https://github.com/PedroCCallejas/BocaiuvaApp/pull/3.
- `88c8daf`: correção do gate de auditoria com as exceções aprovadas.
- `404bf997d3b8aa30b27fc748348ed1c0301afb49`: design system, navegação,
  loading, ferramentas e exibição original de Reclamação/Fominha.
- CI remoto **SUCCESS** nesse commit:
  https://github.com/PedroCCallejas/BocaiuvaApp/actions/runs/38764895748.
  Instalação pelo lockfile, TypeScript, testes, exportação web e auditoria
  passaram. A execução terminou às 15:59:35 UTC (11:59:35 em Cuiabá).
- Check de preview Vercel **SUCCESS** no mesmo commit.
- Os 294 arquivos de aplicação enviados à Vercel em 14/10 foram comparados
  com o checkout em 15/10: nenhum conteúdo diferente. Esta etapa sincroniza
  no Git a aplicação já publicada; o registro anterior permanece histórico.
- `main` não foi integrada nesta etapa. Integrá-la aciona publicação em produção;
  a Constituição V exige aprovação explícita para cada nova publicação.

## Validações locais

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run test` | 614 testes passaram |
| `npm run build:web` | Passou, 87 rotas |
| `npm run audit:security` | Passou com as duas exceções aprovadas |
| `git diff --check` | Passou |

O primeiro build local falhou com `EPERM` ao criar `dist/(app)/lineup`
no ambiente restrito. O mesmo comando, executado com permissão de escrita,
concluiu sem mudança de código. O build remoto também passou.

A auditoria ainda reporta 14 entradas moderadas e 21 altas, zero críticas.
As altas propagam as duas causas cobertas pelas exceções aprovadas para
`braces@3.0.3` e `node-forge@1.4.0`, até **12/11/2026**. CI verde não significa
ausência de vulnerabilidades. Não houve atualização dos SDKs principais.

## Login Google: evidência e limite da validação

1. No navegador integrado, a tentativa terminou com mensagem de falha de conexão.
   Esse resultado isolado não estabelece um defeito da aplicação.
2. No Edge, o botão abriu o seletor oficial de conta Google para o Firebase Auth.
3. A conta Google apresentada diferia da conta que estava no app. A escolha foi
   entregue ao usuário, sem vincular contas ou escolher outra identidade.
4. O usuário informou que concluiu a entrada. Na inspeção posterior disponível
   ao agente, o Edge ainda mostrava o seletor e o app em `/login`; recarregar
   o app não demonstrou sessão autenticada. Foi solicitada a confirmação da
   tela e do navegador usados para resolver essa divergência.

**Resultado atual: autenticação completa e persistência da sessão Google ainda
não confirmadas de forma independente.** Não foi alterado o fluxo OAuth,
credenciais, provedores ou configuração do Firebase. Nenhuma senha, código
ou URL completa de OAuth integra este registro. Capturas locais de verificação
ficam em `.expo/verification/`, fora do Git.

## Próximos passos propostos (TO-BE)

1. Confirmar retorno do Google à conta/time esperado e restauração após recarga.
   Se houver falha real, registrar mensagem/código antes de propor correção.
2. Com o critério de login atendido, revisar o PR e obter aprovação para integrar
   `main`, acompanhando CI e publicação automática da Vercel.
3. Validar em celular real a jornada de conta sem time, convite, permissões,
   troca de time e retorno das ferramentas, preservando dados do Bocaiúva.
4. Resolver as dependências excepcionadas antes de 12/11 e verificar backup,
   restauração e diagnóstico de erros antes de cobrar de outros times.
5. Definir cobrança por conta ou time, recursos gratuitos e limites pagos.
   Especificar titularidade e direitos verificados no servidor antes de
   implementar pagamento, cancelamento e inadimplência; começar com piloto.
6. Tratar app nativo e eventual VPS em etapas próprias. O banco atual já é
   PostgreSQL no Supabase; não é necessário migrar para iniciar a cobrança.

A divergência histórica entre a Constituição (bootstrap Firestore) e o estado
operacional documentado em `CLAUDE.md` (dados no Supabase, Firebase para Auth)
continua relatada. Nenhuma emenda de governança foi feita nesta entrega.
