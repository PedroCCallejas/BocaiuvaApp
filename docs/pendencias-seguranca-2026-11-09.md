> Atualizacao final: migration do caixa aplicada e verificada no BocaApp em 09/11/2026, versao remota 20261109135601. Nome local alinhado sem alterar SQL. As referencias anteriores a aplicacao pendente descrevem o estado antes desta etapa. Login Firebase externo e publicacao continuam pendentes.

# Migracao Expo 58 e seguranca - 09/11/2026

## Autorizacao e escopo

Apos o diagnostico inicial, Pedro autorizou a migracao grande de Expo/Router e pediu entrega pronta para subir/deploy. Esta entrega prepara codigo local; nao autoriza nem executa publicacao automaticamente. Nenhum push, merge, deploy, alteracao de credenciais ou migration remota foi realizado.

## AS-IS atualizado

- Expo 58.0.23, Router 58.0.30, React 19.3.0, React Native 0.88.1 e TypeScript 6.0.3, alinhados pela matriz oficial Expo.
- Firebase 12.12.1, Firebase Admin 13.10.0 e Supabase 2.105.4 preservados.
- Node-forge 1.4.3 e Zod 4.6.7 corrigidos. Cadeia antiga de decode-uri-component deixou de existir no lockfile.
- Nenhum pacote Expo 55 nem @react-navigation permanece no lockfile. SDK 58 usa as entradas de navegacao do Router.
- @expo/vector-icons agora e dependencia direta; @expo/metro-runtime e expo-symbols declarados conforme peers.

## Adaptacoes de codigo

- Lineup usa useNavigation do expo-router e usePreventRemove de expo-router/react-navigation.
- APIs removidas StyleSheet.absoluteFillObject substituidas pelo equivalente absoluteFill em galeria/cards/campo de escalacao.
- Refs de TextInput/ScrollView usam ComponentRef; estrutura da tela e alteracoes paralelas de navegacao preservadas.
- Form submits invocam handleSubmit sem passar GestureResponderEvent ao React Hook Form.
- Cores dos icones das abas usam os mesmos tokens ativo/inativo definidos no tema, sem ColorValue numerico/null.
- Titulo de alerta null normalizado para string vazia e coalescencia redundante removida do selector sem alterar resultado.

## Seguranca

`npm run audit:security` passou sem excecoes: 0 altas, 0 criticas, 5 entradas moderadas. As cinco entradas se propagam de glob/minimatch pela ferramenta Expo; nao sao cinco falhas independentes no produto. Auditoria completa incluindo dev reportou 13 moderadas. Nao usar `npm audit fix --force`.

Advisories remanescentes:
- https://github.com/advisories/GHSA-3g3m-2fjr-6pw4
- https://github.com/advisories/GHSA-g3hv-75wg-m249

As excecoes antigas nao foram renovadas nem ampliadas. Braces/node-forge nao exigiram excecao no audit atual. Validade antiga: 12/11/2026 00:00 UTC = 11/11 20h Cuiaba.

## Verificacao e entrega integrada

- Resolucao limpa isolada, sem --force nem --legacy-peer-deps; nenhuma credencial copiada.
- `npm ci --ignore-scripts --no-audit --no-fund` passou antes da declaracao final de vector-icons. Uma segunda rodada com lockfile final foi iniciada para reconfirmar.
- `npx expo install --check`: dependencias alinhadas.
- `expo-doctor`: 20/20 checks passaram, inclusive apos declarar icones.
- Incompatibilidades de tipos do SDK corrigidas. Ultimo typecheck anterior a correcao paralela do caixa tinha somente erro no RPC caixa.ts; ver resultado integrado final abaixo.
- SQL: Docker Desktop foi iniciado e ficou disponivel. Teste alcancou migrations; primeira rodada detectou erro sintatico na nova migration do caixa, entregue ao responsavel. Reexecucao SQL, testes e build finais coordenados com a entrega do caixa para evitar conflitos.
- Os 618 testes/build de 87 rotas da rodada inicial pertencem ao SDK 55, nao comprovam SDK 58. Nao substituir o resultado integrado novo por essa evidencia antiga.
- CI remoto e QA autenticada em preview ainda precisam de verificacao antes de publicacao; nao houve push.
- Executar com Node 24 atualizado (validado localmente 24.22.1). Expo 58 exige pelo menos 22.13 no Node 22 ou 24.3 no Node 24; engines foi alinhado a ^22.13.0 || ^24.3.0 no manifest e lockfile.

## Pendencias fora desta migracao

- PR #4 segue draft: https://github.com/PedroCCallejas/BocaiuvaApp/pull/4 . Alteracoes locais de grants/backup e novas funcoes devem ser revisadas em conjunto antes de publicar.
- Divergencia Constitution/Firestore versus implementacao Supabase requer emenda explicita, nao realizada.
- Recuperacao de midias/identidade/offsite continua incompleta. O proprietario adiou expressamente copia externa, chave portatil e midias em 16/10; nao retomar automaticamente.

## Referencias

https://expo.dev/changelog/sdk-58
https://docs.expo.dev/router/migrate/sdk-55-to-56
Matriz node_modules/expo/bundledNativeModules.json, npm audit e expo-doctor consultados em 09/11/2026.

### Revalidacao da instalacao final

`npm ci --ignore-scripts --no-audit --no-fund` com o lockfile final (incluindo vector-icons) passou: 737 pacotes, 50 segundos. Typecheck integrado ainda falhou em codigo novo do caixa: retorno RPC com uniao objeto/array e copia de QA em tmp/cash-qa capturada pelo include global. Esses arquivos pertencem a entrega paralela, cujo responsavel foi avisado. A migracao SDK nao apresentou outros erros nesta rodada. Nao declarar typecheck integrado verde ate repetir apos essas correcoes.

Auditoria e expo-doctor repetidos apos npm ci final: ambos exit 0; audit 5 moderadas, 0 altas/criticas, nenhuma excecao usada; doctor 20/20. `git diff --check` passou.

## Fechamento integrado final (substitui os estados de verificacao anteriores)

Apos corrigir o RPC do caixa e mover a copia de QA para fora do repositorio:
- `npm run typecheck`: exit 0.
- `npm test`: exit 0, todos os 623 testes passaram.
- `npm run build:web`: exit 0, 89 rotas estaticas e 52 bundles, exportacao em dist.
- Teste separado `tests/match-poster.test.ts`: exit 0, mapping/states/fallback/dimensions/rendering aprovados.
- `npm run audit:security`: exit 0, nenhuma excecao usada, 5 moderadas, zero altas/criticas.
- `git diff --check`: exit 0.
- `tmp/cash-qa` nao existe mais no repositorio. `.expo` e `dist` ignorados pelo Git.
- Nao houve diff em .env, .env.local, firestore.rules ou vercel.json.

### Antes de subir/deploy

1. Revisar os arquivos locais e selecionar explicitamente a entrega: nao usar git add indiscriminado. Alteracoes preexistentes preservadas: docs/backup-real-2026-10-16.md, docs/monetizacao-2026-10-16/README.md, scripts/verify-postgres.mjs, tests/postgres/bootstrap.sql, tests/postgres/fingerprint.sql; arquivos preexistentes nao rastreados: docs/grants-explicitos.md, docs/plano-pro-premium-infraestrutura-2026-10-16.md, supabase/migrations/20261020162856_grants_explicitos_service_role.sql, supabase/tests/explicit_grants.sql, tests/postgres/before-explicit-grants.sql.
2. Conferir historico/grants do Supabase alvo e revisar/aplicar a nova migration 20261109135601_caixa_semanal.sql em etapa autorizada. Nao reaplicar cegamente a migration de grants antiga (documento registra aplicacao remota em outubro). Sem a nova migration, o caixa nao fica operacional.
3. Validar em ambiente equivalente autorizado os fluxos autenticados, permissao admin/membro, troca de time, escudos reais/CORS e abrir/fechar/reabrir/download da arte. QA com fixtures e PostgreSQL isolado nao substitui integracao Firebase-JWT/PostgREST real.
4. Depois do commit/push autorizado, conferir CI do SHA exato e revisar preview antes de deploy. Esta tarefa nao fez commit, push, merge, aplicacao remota ou deploy.
5. Usar Node 24 atualizado no build. Engines agora rejeita Node 22 anterior a 22.13 e Node 24 anterior a 24.3, alem de manter fora as majors 23, 25 e 26.

Cinco moderadas remanescentes sao risco declarado, nao bloqueio do gate configurado. CI remoto e integracao real nao sao afirmados como aprovados. As pendencias historicas de recuperacao completa continuam registradas, sem impedir por si so a compilacao local desta entrega.


### Correcao final de engines

package.json e package-lock.json sincronizados em `^22.13.0 || ^24.3.0`; CI permanece Node 24. Matriz semver confirmou rejeicao de 22.0/22.12/23/24.0/24.2/25/26 e aceitacao de 22.13/24.3/24.22.1. Runtime atual aceito. Nenhuma versao de dependencia ou fonte do app mudou nesta correcao.
