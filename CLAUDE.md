# Instruções do projeto — Professô FC

Responda sempre em **português do Brasil**.

Este projeto deve ser evoluído com segurança, simplicidade e mudanças pequenas.

## Onde os dados vivem (leia antes de tudo)

**O banco é o Postgres (Supabase). A migração já aconteceu — não é plano.**

Em produção, estes módulos leem e gravam no Postgres: `financeiro`, `resenhas`,
`partidas`, `avaliacoes`, `elenco`. Ligados por `EXPO_PUBLIC_SUPABASE_MODULES`.

O que **continua** no Firebase:

- **Auth** — o login é Firebase e vai continuar sendo. O Supabase valida esse
  JWT como provedor de terceiros.
- **Notificações** — o módulo `notificacoes` nunca foi ligado.
- **Perfis públicos de time** — só leitura, congelados no estado da virada.
- **`users`, `teams` e `teamMembers` no bootstrap** — é o que segura a tela
  em pé enquanto o Postgres responde. Não tire isso do Firestore.

`firebase-repository.ts` ainda tem os métodos dos módulos migrados, mas eles
**não rodam em produção**: a camada de composição os intercepta. Hoje são
caminho de rollback.

Detalhe: `docs/plano-migracao-postgres.md` é histórico, não roteiro.

## Stack

- **Expo / React Native** com Expo Router (rotas em `src/app/`)
- **Supabase / Postgres** — banco principal; cliente em `src/config/supabase/client.ts`
- **Firebase** — Auth (fica), Firestore (saindo; regras em `firestore.rules`)
- **Vercel** — deploy web via `npx expo export -p web` → `dist/`
- **TypeScript** — tsconfig.json na raiz
- **AdMob** — react-native-google-mobile-ads
- **Expo Notifications** — expo-notifications

## Perfil do usuário

O usuário prefere:

- explicações práticas e diretas
- prompts prontos para copiar e colar
- mudanças pequenas e seguras
- preservação da estrutura atual
- validação antes de concluir
- evitar refatorações grandes sem necessidade

## Antes de alterar código

Sempre:

1. Entenda o problema.
2. Identifique a causa provável.
3. Liste os arquivos relacionados.
4. Explique o risco da alteração.
5. Proponha a menor correção segura.
6. Só implemente quando o pedido for claramente de implementação.

## Regras obrigatórias

**Nunca fazer sem pedido explícito:**

- alterar `firestore.rules`
- alterar autenticação (Firebase Auth, Supabase Auth, Google Auth)
- mexer em `.env`, tokens, secrets, credenciais ou `google-services.json`
- atualizar Expo SDK, Firebase SDK, Supabase ou outras dependências grandes
- rodar deploy para Vercel
- rodar `eas build`
- rodar `expo start`
- mudar regras de negócio
- refatorar o projeto inteiro
- apagar arquivos importantes

**Sempre priorizar:**

- correção mínima
- baixo risco
- TypeScript seguro
- código legível
- Git limpo
- validação com comandos existentes
- explicação clara no final

## Comandos de validação disponíveis

```bash
npm run typecheck    # tsc --noEmit — sempre preferido antes de qualquer commit
npm run test         # suite de testes interna
npm run build:web    # expo export --platform web — usar antes de deploy Vercel
```

> Não existe `npm run lint` neste projeto. Não inventar o comando.

## Regras de uso do Expo

- Não rodar `expo start` sem autorização explícita do usuário.
- Para validar build web: usar `npm run build:web`.
- Rotas ficam em `src/app/` seguindo Expo Router.
- Componentes nativos com variantes `.native.tsx` têm precedência no mobile.

## Regras do Postgres / Supabase

- A permissão mora na **RLS**, não no cliente. Não repita a checagem no app: um
  segundo lugar para decidir é um segundo lugar para divergir.
- Escrita em várias tabelas passa por **RPC**, para ser transacional.
- RPC com `security definer` só quando a policy não tem como funcionar (ex: criar
  time, onde o dono ainda não é membro). Sempre com `search_path` fixo, e sempre
  `revoke` de `public, anon`.
- Migration é aplicada com o nome carimbado pela hora da aplicação. Se aplicar
  pela API, **renomeie o arquivo local para bater com o remoto** — divergência de
  ficha já custou tempo aqui.

### Armadilhas que já morderam (todas da mesma classe)

Ausência de dado é indistinguível de ausência de acesso. Sempre que algo aparecer
"vazio" ou "zerado", suspeite de leitura, não de dado apagado.

- **PostgREST corta em 1000 linhas, sem erro.** Toda leitura de coleção que
  cresce com o tempo usa `todasAsLinhas` (`supabase/paginacao.ts`), com `order`
  estável. Sem isso o ranking somou 60% das presenças e ninguém percebeu.
- **UPDATE/DELETE sem `.eq()` é recusado.** O Supabase carrega `safeupdate` na
  conexão do PostgREST, e ela barra antes da RLS. Toda escrita diz em qual linha
  mexe.
- **Sem token, a RLS devolve zero linhas em silêncio.** `getFirebaseAccessToken`
  espera `authStateReady()` e falha se não houver sessão — vazio por falta de
  token é indistinguível de time sem dados.
- **Não rode `npm run migrar:importar`.** Sobrescreve o Postgres com o Firestore
  congelado. Há trava por tabela, mas o comando parece inofensivo.

## Regras Firebase / Firestore

- Nunca sugerir `allow read, write: if true`.
- Nunca relaxar `firestore.rules` sem explicar o risco e ter pedido explícito.
- Os documentos usam campos como `teamId`, `playerId` e `membership` para controle de acesso.
- Erros `permission-denied` geralmente indicam falha na leitura de `teamId` ou membership.

## Regras de deploy Vercel

- Build: `npx expo export -p web` → gera pasta `dist/`.
- `vercel.json` já configurado com `cleanUrls`, `trailingSlash: false` e rewrite SPA.
- Nunca fazer deploy sem pedido explícito e sem validar build antes.

## Resposta final obrigatória

Sempre finalizar com:

1. O que foi feito
2. Arquivos alterados
3. Comandos rodados
4. Resultado dos comandos
5. Riscos ou observações
6. Próximos passos sugeridos
