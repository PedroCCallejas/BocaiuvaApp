# Skill: revisao-firebase

**Ativação:** `/revisao-firebase`

## Objetivo

Revisar o que ainda é Firebase neste projeto: **Auth** (ativo) e **Firestore**
(legado). Não altera arquivos.

Para permissão de dados — RLS, policies, RPC, Storage do Supabase — use o agente
`firebase-guardian`, que cobre o caminho vivo.

## Contexto do projeto

- **Firebase é só autenticação.** O banco é o Supabase Postgres.
- Auth em `src/services/auth/`; cliente em `src/config/firebase/client.ts`;
  Google Auth em `src/config/auth/google.ts`
- O Supabase valida o JWT do Firebase como provedor de terceiros, e isso depende
  do custom claim `role: authenticated` (`npm run auth:claim`). Sem o claim, o
  usuário chega como `anon` e as policies recusam tudo.
- **Legado:** `firestore.rules`, `src/types/firestore.ts`,
  `src/config/firebase/legacy-firestore-client.ts` e
  `src/services/repository/firebase-repository.ts`. O app ativo não os importa —
  existem para as ferramentas de migração.

## O que verificar

### Firebase Auth
- Sessão pronta antes de qualquer leitura (`authStateReady()`)
- UID disponível quando necessário
- Logout limpa o estado local
- Google Auth configurado corretamente
- Token nunca exposto em log

### Ponte Auth → Postgres
- `getFirebaseAccessToken` falha em silêncio quando não há sessão; sem token a
  RLS devolve zero linhas, e vazio vira "sumiu o dado"
- Custom claim presente para usuários novos

### Firestore legado
- **Código novo lendo ou escrevendo no Firestore é regressão.** Aponte.
- Import de `legacy-firestore-client` fora de script de migração
- Scripts que escrevem no Firestore (`backfill:membership-index`,
  `repair:players-linked-email`) sendo sugeridos como rotina

### Firestore Rules
- Regras muito abertas (ex.: `allow read, write: if true`)
- Falta de validação de `request.auth.uid`

## O que NUNCA fazer

- Não sugerir `allow read, write: if true`
- Não relaxar rules sem explicar o risco completo
- Não alterar `firestore.rules` sem pedido explícito
- Não propor voltar dado para o Firestore

## Formato de resposta

```
## Revisão Firebase (Auth + legado)

### Riscos críticos
- ...

### Riscos médios
- ...

### Riscos baixos
- ...

### Uso indevido do Firestore legado
- ...

### Correções mínimas sugeridas
- ...

### O que NÃO alterar
- ...
```
