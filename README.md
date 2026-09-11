# Professô FC

Aplicação web para administrar times amadores, elenco, partidas, escalações,
estatísticas, avaliações, despesas e perfil público.

## Arquitetura atual

- Expo Router + React Native Web
- Publicação web estática na Vercel
- Firebase Auth para login por e-mail e Google
- Supabase Postgres para todos os dados do produto
- Supabase Storage para imagens e vídeos
- Supabase Edge Functions para Web Push, exportação e exclusões privilegiadas
- Firebase Firestore não faz parte do runtime ativo

O antigo repositório Firestore permanece somente como referência histórica de
migração. `src/services/repository/index.ts` seleciona Supabase por padrão e
usa mock apenas quando `EXPO_PUBLIC_DATA_SOURCE=mock`.

## Configuração local

Copie `.env.example` para `.env` e preencha apenas as chaves públicas do
frontend. Nunca coloque `service_role`, chave VAPID privada ou credenciais
administrativas em variáveis `EXPO_PUBLIC_*`.

Variáveis principais:

```text
EXPO_PUBLIC_DATA_SOURCE=supabase
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_VAPID_PUBLIC_KEY=
```

O Firebase é configurado apenas para autenticação. Não crie novas leituras ou
escritas no Firestore.

## Desenvolvimento e validação

```bash
npm install
npm run typecheck
npm run test
npm run build:web
```

`npm run web` inicia o ambiente web local, mas deve ser executado somente
quando houver necessidade de teste visual interativo.

O pipeline em `.github/workflows/ci.yml` executa instalação reproduzível,
typecheck, testes, build web e auditoria de dependências de produção.

## Supabase

As mudanças de banco são versionadas em `supabase/migrations/`. Antes de
publicar uma versão que dependa de migration ou Edge Function nova:

1. Revisar a migration e as policies RLS.
2. Reconstruir/testar o banco local quando o Docker estiver disponível.
3. Rodar os testes SQL em `supabase/tests/`.
4. Aplicar a migration no projeto correto.
5. Publicar as Edge Functions correspondentes.
6. Rodar Security e Performance Advisors.
7. Validar login, criação de time, convite, upload, Web Push e exclusões.

Nenhuma migration ou função é publicada automaticamente pelo build da Vercel.

## Mídias e privacidade

- `team-logos`, `team-banners` e `team-videos` são materiais institucionais
  públicos do time.
- `player-photos` e `player-videos` são privados.
- Membros recebem URLs assinadas temporárias.
- Visitantes só recebem acesso temporário quando o time e o elenco estão
  explicitamente publicados.
- A exclusão de conta remove vínculos e dados pessoais e anonimiza o histórico
  esportivo que precisa ser preservado.
- A área da conta permite baixar uma cópia autenticada dos dados em JSON.

## Web Push

O cliente envia somente eventos permitidos. A Edge Function monta conteúdo e
rota no servidor, exige gestor do time e aplica limite de frequência. As
chaves `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` ficam exclusivamente nos secrets
do Supabase.

## Legado

Documentos e scripts que mencionam Firestore descrevem a origem da migração ou
ferramentas de conferência. Eles não devem ser usados como arquitetura para
novas funcionalidades.
