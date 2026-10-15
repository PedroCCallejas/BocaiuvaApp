# CI/CD — diagnóstico da auditoria de dependências

Data: 2026-10-13. Status: correção local validada; execução remota pendente de publicação autorizada.

Atualização de 14/10/2026: o usuário autorizou publicar o app na Vercel;
o gate de segurança foi reexecutado e passou, com os mesmos 14 achados moderados
e 21 altos aceitos exclusivamente pelas duas exceções aprovadas. Após corrigir
a exibição de Reclamação/Fominha, typecheck, 614 testes e build web passaram.
O build Vercel não executa o workflow GitHub Actions: sem commit/push, o CI
remoto continua sem nova execução. Resultado da publicação em
[`design-system/publicacao-2026-10-14.md`](design-system/publicacao-2026-10-14.md).
As afirmações abaixo de ausência de deploy pertencem à entrega de 13/10.

## Resultado da implementação autorizada

- Lockfile atualizado com correções transitivas compatíveis, sem `--force`.
  Versões instaladas de Expo, React Native, React, Firebase, Supabase e Router preservadas.
- Override de `@grpc/grpc-js` para `1.14.6`, versão corrigida compatível.
- Instalação limpa: `npm ci --ignore-scripts --no-fund --no-audit`, exit 0.
- Typecheck, 612 testes e exportação web de 87 rotas passaram.
- `npm run audit:security`: exit 0, nenhum bloqueio. O npm audit ainda reporta
  14 entradas moderadas e 21 altas, sem críticas. As altas se propagam de
  `braces 3.0.3` e `node-forge 1.4.0`; não foram apagadas do relatório.
- O usuário aprovou somente as duas exceções em
  [`proposta-excecoes-auditoria.md`](proposta-excecoes-auditoria.md), até 12/11/2026.
  Novos advisories, versões/caminhos diferentes, gravidade crítica, expiração
  e erro de rede/relatório continuam bloqueando. Ciclos transitivos são
  percorridos sem aceitar grafos sem origem conhecida; testes cobrem esses casos.
- Workflow passa a usar esse gate. Não houve push, deploy nem reexecução remota.
  CI remoto verde e saúde do deploy não são afirmados.

Advisories oficiais: [gRPC](https://github.com/advisories/GHSA-m9gg-hp2v-232j),
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) e
[node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

As seções seguintes preservam o diagnóstico anterior à implementação.

## Evidência

- Workflow local: `.github/workflows/ci.yml`, `Validacao web`.
- Última execução retornada pelo GitHub Actions:
  [35276199932](https://github.com/PedroCCallejas/BocaiuvaApp/actions/runs/35276199932),
  iniciada em 17/09/2026, commit `9bb9ab67703cb4838e6b7b73c40d087c4fe6132b`.
- Esse commit corresponde ao HEAD local consultado em 13/10/2026.
- `npm ci`, typecheck, testes e build web passaram nessa execução.
- A etapa que falhou foi `npm audit --omit=dev --audit-level=high`, com exit 1.
- O log histórico reportou 22 entradas vulneráveis: 1 baixa, 13 moderadas,
  6 altas e 2 críticas. São dados daquela execução, não a contagem atual.

## Reprodução anterior à correção, somente leitura

Em 13/10/2026, a mesma auditoria, com saída JSON, retornou exit 1. Resumo:

| Gravidade | Entradas reportadas |
| --- | ---: |
| Baixa | 1 |
| Moderada | 12 |
| Alta | 29 |
| Crítica | 2 |
| Total | 44 |

As entradas incluem dependências afetadas indiretamente; não significam
44 falhas exploráveis independentes em produção. A diferença em relação a
17/09 exige considerar atualizações da base de advisories e da árvore consultada.
Não foi feita análise de explorabilidade do bundle nesta entrega.

Entradas críticas atuais: `shell-quote` e `websocket-driver`. Entre as entradas
altas: `ws`, `node-forge`, `@grpc/grpc-js`, `protobufjs` e cadeias de Expo,
Metro/React Native. A correção deve ser escolhida por versão instalada e cadeia
de dependência, e não apenas pelo nome.

## Causa e menor caminho seguro

O portão de auditoria está funcionando: ele recusa a árvore com alertas altos
ou críticos. Não há evidência de que a causa seja autenticação da aplicação,
variáveis de ambiente ou erro no build. Não remover a auditoria nem tornar sua
falha aceitável como forma de deixar o CI verde.

A resposta atual do audit inclui sugestões incompatíveis, como alterar Expo
55 para `44.0.6` e React Native `0.83.10` para `0.87.1`. Isso não é um roteiro
de atualização segura. Não executar `npm audit fix --force`.

Etapa própria de correção:

1. Identificar versões e caminhos com `npm explain`/`npm ls` para cada origem.
2. Separar atualizações transitivas compatíveis das mudanças de SDK.
3. Escolher versões corrigidas e compatíveis, lendo os advisories oficiais.
4. Alterar apenas o lockfile e os manifests necessários, em diff separado.
5. Revalidar instalação limpa em ambiente isolado, typecheck, testes,
   build web e `npm audit --omit=dev --audit-level=high`.
6. Confirmar execução remota verde após publicação autorizada do diff.

Atualizações grandes continuam sujeitas às instruções do projeto. Não houve
mudança em dependências, SDKs, lockfile ou workflow nesta entrega.

## Limites registrados antes da implementação (histórico)

CI verde não foi alcançado e não deve ser anunciado. Não houve deploy,
reexecução remota, análise de CD/Vercel ou mudança de segurança. O design system
é a prioridade de produto atual; esta falha continua como portão técnico antes
de concluir uma correção de CI/CD ou publicar a evolução.
