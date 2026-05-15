# Bocaiuva APP

Aplicativo mobile em React Native + Expo para organizar times de futebol amador, com foco em elenco, partidas, presenca, escalacao visual, estatisticas e rankings.

## Stack

- Expo SDK 55 + Expo Router
- React 19 + TypeScript
- Zustand
- React Hook Form + Zod
- Firebase Auth + AsyncStorage para sessao persistente
- Expo Auth Session + WebBrowser para login com Google
- Firestore para `users`, `teams`, `teamMembers`, `players`, `matches`, `attendance`, `lineups`, `matchStats`, `mvpVotes`, `playerRatings` e `notifications`
- Fallback local para desenvolvimento e para fluxos ainda nao migrados

## O que ja funciona

- Login e cadastro com e-mail e senha
- Recuperacao de senha
- Login com Google quando os client IDs estiverem configurados
- Controle manual de acesso para criar time
- Multi-times com troca de time atual
- Criacao e edicao de time
- Convite por codigo
- Cadastro, edicao e remocao suave de jogadores
- Partidas com presenca, escalacao visual e localizacao por link
- Pos-jogo real com placar, gols, assistencias, voto de MVP e notas anonimas
- Notificacoes internas no app para partidas, presenca, escalacao e pos-jogo
- Estatisticas e rankings somando dados manuais com dados reais das partidas
- Atualizacao em tempo real entre Web, Android e iPhone/PWA no time ativo
- Pull-to-refresh nas listas principais com botao manual de atualizar
- Formularios com melhor comportamento de teclado em Android, iPhone e Web mobile
- Fallback mock continua disponivel quando `EXPO_PUBLIC_DATA_SOURCE=mock`
- Web/PWA para Safari no iPhone com instalacao pela tela inicial

## Configuracao

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
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
# opcional:
# EXPO_PUBLIC_GOOGLE_CLIENT_ID=...
```

4. Reinicie o Expo depois de alterar o `.env`.

Observacoes:

- O login com Google usa o redirect URI baseado no `scheme` do app: `appboca://auth`.
- Se os client IDs do Google nao estiverem configurados, o botao de Google fica oculto.
- Quando `EXPO_PUBLIC_DATA_SOURCE=mock`, o app usa o fluxo local de demonstracao.
- No navegador, a sessao do Firebase Auth usa persistencia local do browser.

## Liberacao para criar time

1. O usuario cria a conta normalmente.
2. O app cria `users/{uid}` com `canCreateTeam: false`.
3. No Firebase Console, altere `users/{uid}.canCreateTeam` para `true`.
4. Ao reabrir o app, ou tocar em `Atualizar acesso`, a opcao de criar time aparece.

## Regras importantes da etapa atual

- Toda leitura operacional parte do time ativo da conta.
- Todo documento ligado ao dominio do time carrega `teamId`.
- As permissoes do pos-partida usam a membership do time ativo, nao apenas o papel global da conta.
- Jogadores inativos continuam no historico se participaram de partidas antigas.
- Jogadores removidos nao entram mais em presenca, escalacao ou partidas futuras.
- Pos-jogo real grava `matchStats`, `mvpVotes` e `playerRatings`.
- Notificacoes internas gravam `notifications` com leitura por `activeTeamId`.
- Votos e avaliacoes usam gravacao unica por jogador para evitar duplicidade no Firestore.
- `matchStats`, `mvpVotes` e `playerRatings` usam IDs estaveis por combinacao de partida e jogador para facilitar atualizacao segura.
- Notificacoes usam estado de leitura por usuario em `readByUserIds`.
- Rankings e cards somam os dados reais das partidas com `manualStats`.
- Storage e upload ainda nao foram implementados.
- Push notification nativa ainda nao foi implementada.
- O shell web usa `manifest`, `apple-touch-icon` e layout responsivo para Safari mobile.
- O app tenta manter os dados do time atual em tempo real com listeners do Firestore e ainda oferece atualizacao manual nas listas principais.
- Formularios usam ajuste automatico de teclado e rolagem para manter o campo focado visivel.

## Fluxo de pos-partida

1. O admin do time ativo encerra a partida com o placar final.
2. O admin registra gols e assistencias apenas para jogadores confirmados.
3. O app grava `matchStats` reais da partida e atualiza o resumo final da partida.
4. Jogadores confirmados votam no MVP uma unica vez, sem votar em si mesmos.
5. Jogadores confirmados avaliam outros jogadores uma unica vez, sem autoavaliacao.
6. Estatisticas, rankings e resumo da partida passam a refletir os dados reais gravados no Firestore ou no fallback mock.
7. Ao fechar e abrir o app novamente, o snapshot do time ativo volta a carregar `matchStats`, `mvpVotes`, `playerRatings` e `notifications`.

## Fluxo de notificacoes

1. O app salva notificacoes internas em `notifications`.
2. Toda notificacao carrega `teamId` e aparece apenas para o time ativo da conta.
3. A Home mostra um resumo recente e a tela `Notificacoes` concentra o historico completo.
4. Cada usuario pode marcar uma notificacao como lida ou limpar todas as pendencias do time ativo.
5. Nesta etapa nao existe push nativo; o fluxo fica todo dentro do app e da PWA.

## Atualizacao em tempo real e formularios

1. No modo Firebase, o app abre listeners do time ativo para elenco, partidas, presenca, escalacao, pos-jogo e notificacoes.
2. Ao trocar de time, os listeners antigos sao encerrados e o app passa a ouvir apenas o novo time ativo.
3. As listas principais mostram um status leve de atualizacao e aceitam `pull-to-refresh` no mobile, com botao manual de atualizar em qualquer plataforma.
4. Os formularios usam ajuste de teclado e rolagem do campo focado para evitar que inputs e botoes fiquem escondidos no Android, iPhone e Web mobile.

## Validacao recente

- `npm run typecheck`
- Validacao da colecao `notifications` no fluxo de mock e Firestore-ready
- Validacao da assinatura em tempo real do time ativo e da nova base de teclado/refresh por tipagem
- Simulacao local do fluxo mockado com:
  - criacao de partida
  - confirmacao de presenca
  - salvamento de escalacao
  - encerramento com gols e assistencias
  - bloqueio de auto-MVP e voto duplicado
  - bloqueio de autoavaliacao e avaliacao duplicada
  - atualizacao automatica de MVP, notas, estatisticas e rankings

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

## Publicacao web

O build web do Expo sai em `dist` por padrao. Esse diretorio pode ser publicado sem App Store.

### Vercel

1. Rode `npm run build:web`.
2. Crie um projeto novo na Vercel apontando para este repositorio.
3. Use:
   - Build command: `npm run build:web`
   - Output directory: `dist`
4. Configure as variaveis `EXPO_PUBLIC_*` no painel da Vercel.

### Netlify

1. Rode `npm run build:web`.
2. Crie um site novo a partir do repositorio.
3. Use:
   - Build command: `npm run build:web`
   - Publish directory: `dist`
4. Configure as variaveis `EXPO_PUBLIC_*` no painel da Netlify.

### Firebase Hosting

1. Rode `npm run build:web`.
2. Execute `firebase init hosting`.
3. Escolha `dist` como pasta publica.
4. Marque a opcao de app web com fallback para rotas.
5. Publique com `firebase deploy`.

## Instalar no iPhone

1. Abra a URL publicada no Safari.
2. Entre no app normalmente.
3. Toque no botao de compartilhar do Safari.
4. Escolha `Adicionar a Tela de Inicio`.
5. Confirme o nome `Bocaiuva APP`.
6. Abra o atalho criado como se fosse um app.

Observacoes para iPhone:

- O login por e-mail, Firestore, troca de time, partidas, presenca e escalacao funcionam no navegador.
- Links externos, como localizacao da partida, abrem pelo fluxo apropriado do Safari.
- O modo tela inicial depende de HTTPS em producao.

Mais detalhes do modelo atual estao em [docs/firestore-schema.md](./docs/firestore-schema.md).
