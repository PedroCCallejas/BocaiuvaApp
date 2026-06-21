# Professô FC

Aplicativo mobile em React Native + Expo para organizar times de futebol amador, com foco em elenco, partidas, presença, escalação visual, estatísticas, ranking e amistosos.

## Stack

- Expo SDK 55 + Expo Router
- React 19 + TypeScript
- Zustand
- React Hook Form + Zod
- Firebase Auth + AsyncStorage para sessão persistente
- Expo Auth Session + WebBrowser para login com Google
- Firestore para `users`, `teams`, `teamMembers`, `players`, `matches`, `attendance`, `lineups`, `matchStats`, `mvpVotes`, `playerRatings` e `notifications`
- Fallback local para desenvolvimento e para fluxos ainda não migrados

## O que já funciona

- Login e cadastro com e-mail e senha
- Recuperação de senha
- Login com Google quando os client IDs estiverem configurados
- Criação de time para qualquer conta autenticada, com limite de 2 times por conta
- Multi-times com troca de time atual
- Criação e edição de time
- Convite por código
- Cadastro, edição e remoção suave de jogadores
- Partidas com presença, escalação visual e localização por link
- Pós-jogo real com placar, gols, assistências, voto de MVP e notas anônimas
- Notificações internas no app para partidas, presença, escalação e pós-jogo
- Estatísticas e rankings somando dados manuais com dados reais das partidas
- Atualização em tempo real entre Web, Android e iPhone/PWA no time ativo
- Pull-to-refresh nas listas principais com botão manual de atualizar
- Formulários com melhor comportamento de teclado em Android, iPhone e Web mobile
- Fallback mock continua disponível quando `EXPO_PUBLIC_DATA_SOURCE=mock`
- Web/PWA para Safari no iPhone com instalação pela tela inicial

## Configuração

1. Habilite `Email/Password` no Firebase Authentication.
2. Para Google, habilite o provedor `Google` no Firebase Authentication.
3. Preencha o `.env`:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_DATA_SOURCE=firebase
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_ADS_ENABLED=false
EXPO_PUBLIC_ADS_WEB_ENABLED=false
EXPO_PUBLIC_ADS_MOBILE_ENABLED=false
# opcional:
# EXPO_PUBLIC_GOOGLE_CLIENT_ID=...
# EXPO_PUBLIC_SUPABASE_KEY=... # fallback legado
# EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=...
# EXPO_PUBLIC_ADMOB_IOS_APP_ID=...
# EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID=...
# EXPO_PUBLIC_ADMOB_IOS_BANNER_ID=...
# EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID=...
# EXPO_PUBLIC_ADSENSE_CLIENT_ID=...
# EXPO_PUBLIC_ADSENSE_SLOT_BANNER=...
# EXPO_PUBLIC_ADSENSE_SLOT_TOOLS_AFTER_RESULT=...
# EXPO_PUBLIC_ADSENSE_SLOT_TOOLS_HUB_AFTER_CARDS=...
```

4. Reinicie o Expo depois de alterar o `.env`.

Observações:

- O login com Google usa o redirect URI baseado no `scheme` do app: `appboca://auth`.
- Se os client IDs do Google não estiverem configurados, o botão de Google fica oculto.
- Quando `EXPO_PUBLIC_DATA_SOURCE=mock`, o app usa o fluxo local de demonstração.
- No navegador, a sessão do Firebase Auth usa persistência local do browser.
- Para upload e mídia no Supabase, prefira `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `EXPO_PUBLIC_SUPABASE_KEY` fica apenas como fallback legado.
- Para beta web, prefira `EXPO_PUBLIC_ADS_ENABLED=true`, `EXPO_PUBLIC_ADS_WEB_ENABLED=false` e `EXPO_PUBLIC_ADS_MOBILE_ENABLED=false` para manter o placeholder sem puxar AdMob nativo.

## Criação de time

1. O usuário cria a conta normalmente.
2. Qualquer conta autenticada pode criar um time sem liberação manual.
3. Cada conta pode ser dona de, no máximo, 2 times.
4. O limite conta apenas times em que a conta é `adminUserId`.
5. Participar de outros times como jogador não entra nessa conta.

## Regras importantes da etapa atual

- Toda leitura operacional parte do time ativo da conta.
- Todo documento ligado ao dominio do time carrega `teamId`.
- As permissões do pós-partida usam a membership do time ativo, não apenas o papel global da conta.
- Jogadores inativos continuam no historico se participaram de partidas antigas.
- Jogadores removidos não entram mais em presença, escalação ou partidas futuras.
- Pos-jogo real grava `matchStats`, `mvpVotes` e `playerRatings`.
- Notificacoes internas gravam `notifications` com leitura por `activeTeamId`.
- Votos e avaliações usam gravação única por jogador para evitar duplicidade no Firestore.
- `matchStats`, `mvpVotes` e `playerRatings` usam IDs estáveis por combinação de partida e jogador para facilitar atualização segura.
- Notificações usam estado de leitura por usuário em `readByUserIds`.
- Rankings e cards somam os dados reais das partidas com `manualStats`.
- Storage e upload ainda não foram implementados.
- Push notification nativa ainda não foi implementada.
- O shell web usa `manifest`, `apple-touch-icon` e layout responsivo para Safari mobile.
- O app tenta manter os dados do time atual em tempo real com listeners do Firestore e ainda oferece atualização manual nas listas principais.
- Formularios usam ajuste automatico de teclado e rolagem para manter o campo focado visivel.

## Fluxo de pós-partida

1. O admin do time ativo encerra a partida com o placar final.
2. O admin registra gols e assistências apenas para jogadores confirmados.
3. O app grava `matchStats` reais da partida e atualiza o resumo final da partida.
4. Jogadores confirmados votam no MVP uma única vez, sem votar em si mesmos.
5. Jogadores confirmados avaliam outros jogadores uma única vez, sem autoavaliação.
6. Estatísticas, rankings e resumo da partida passam a refletir os dados reais gravados no Firestore ou no fallback mock.
7. Ao fechar e abrir o app novamente, o snapshot do time ativo volta a carregar `matchStats`, `mvpVotes`, `playerRatings` e `notifications`.

## Fluxo de notificações

1. O app salva notificações internas em `notifications`.
2. Toda notificação carrega `teamId` e aparece apenas para o time ativo da conta.
3. A Home mostra um resumo recente e a tela `Notificações` concentra o histórico completo.
4. Cada usuário pode marcar uma notificação como lida ou limpar todas as pendências do time ativo.
5. Nesta etapa não existe push nativo; o fluxo fica todo dentro do app e da PWA.

## Atualização em tempo real e formulários

1. No modo Firebase, o app abre listeners do time ativo para elenco, partidas, presença, escalação, pós-jogo e notificações.
2. Ao trocar de time, os listeners antigos são encerrados e o app passa a ouvir apenas o novo time ativo.
3. As listas principais mostram um status leve de atualização e aceitam `pull-to-refresh` no mobile, com botão manual de atualizar em qualquer plataforma.
4. Os formulários usam ajuste de teclado e rolagem do campo focado para evitar que inputs e botões fiquem escondidos no Android, iPhone e Web mobile.

## Validação recente

- `npm run typecheck`
- Validação da coleção `notifications` no fluxo de mock e Firestore-ready
- Validação da assinatura em tempo real do time ativo e da nova base de teclado/refresh por tipagem
- Simulação local do fluxo mockado com:
  - criação de partida
  - confirmação de presença
  - salvamento de escalação
  - encerramento com gols e assistências
  - bloqueio de auto-MVP e voto duplicado
  - bloqueio de autoavaliação e avaliação duplicada
  - atualização automática de MVP, notas, estatísticas e rankings

## Como rodar

```bash
npm install
npm run start
```

Para abrir no navegador:

```bash
npm run web
# ou
npx expo start --web
```

Para gerar o build estatico da PWA:

```bash
npm run build:web
```

Para conferir tipagem:

```bash
npm run typecheck
```

## Publicação web

O build web do Expo sai em `dist` por padrão. Esse diretório pode ser publicado sem App Store.

### Vercel

1. Este deploy beta sobe apenas o front web. Não publique Firestore Rules novas antes do backfill de `teamMembershipIndex`.
2. Rode `npx expo export -p web`.
3. Crie um projeto novo na Vercel apontando para este repositorio.
4. Use:
   - Build command: `npx expo export -p web`
   - Output directory: `dist`
5. Configure no painel da Vercel:
   - Obrigatorias para web Firebase: `EXPO_PUBLIC_DATA_SOURCE`, `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`
   - Obrigatorias para mídia Supabase: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Opcional para login Google no navegador: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   - Opcional para ads web: `EXPO_PUBLIC_ADS_ENABLED`, `EXPO_PUBLIC_ADS_WEB_ENABLED`, `EXPO_PUBLIC_ADSENSE_CLIENT_ID`, `EXPO_PUBLIC_ADSENSE_SLOT_BANNER`
   - Opcional para ads mobile: `EXPO_PUBLIC_ADS_MOBILE_ENABLED`, `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, `EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID`, `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID`, `EXPO_PUBLIC_ADMOB_IOS_APP_ID`, `EXPO_PUBLIC_ADMOB_IOS_BANNER_ID`
6. Para o beta controlado, prefira:
   - `EXPO_PUBLIC_ADS_ENABLED=true`
   - `EXPO_PUBLIC_ADS_WEB_ENABLED=false`
   - `EXPO_PUBLIC_ADS_MOBILE_ENABLED=false`
   - conta nova ou time novo criado pelo fluxo atual

### Netlify

1. Rode `npm run build:web`.
2. Crie um site novo a partir do repositorio.
3. Use:
   - Build command: `npm run build:web`
   - Publish directory: `dist`
4. Configure as variáveis `EXPO_PUBLIC_*` no painel da Netlify.

### Firebase Hosting

1. Rode `npm run build:web`.
2. Execute `firebase init hosting`.
3. Escolha `dist` como pasta pública.
4. Marque a opção de app web com fallback para rotas.
5. Publique com `firebase deploy`.

## Instalar no iPhone

1. Abra a URL publicada no Safari.
2. Entre no app normalmente.
3. Toque no botão de compartilhar do Safari.
4. Escolha `Adicionar a Tela de Inicio`.
5. Confirme o nome `Professô FC`.
6. Abra o atalho criado como se fosse um app.

Observações para iPhone:

- O login por e-mail, Firestore, troca de time, partidas, presença e escalação funcionam no navegador.
- Links externos, como localização da partida, abrem pelo fluxo apropriado do Safari.
- O modo tela inicial depende de HTTPS em produção.

Mais detalhes do modelo atual estão em [docs/firestore-schema.md](./docs/firestore-schema.md).
