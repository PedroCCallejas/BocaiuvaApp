# Instruções do projeto — Professô FC

Responda sempre em **português do Brasil**.

Este projeto deve ser evoluído com segurança, simplicidade e mudanças pequenas.

## Stack

- **Expo / React Native** com Expo Router (rotas em `src/app/`)
- **Firebase** — Firestore + Auth (regras em `firestore.rules`)
- **Supabase** — cliente em `src/config/supabase/client.ts`
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
