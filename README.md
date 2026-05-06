# Bocaiuva APP

Aplicativo mobile em React Native + Expo para organizar times de futebol amador, com foco em elenco, partidas, presenca, escalacao visual, estatisticas e rankings.

## Stack

- Expo SDK 55 + Expo Router
- TypeScript
- Zustand
- React Hook Form + Zod
- Firebase Auth + AsyncStorage para sessao persistente
- Expo Auth Session + WebBrowser para login com Google
- Firestore incremental para `users`, `teams`, `teamMembers`, `players`, `matches`, `attendance` e `lineups`
- Fallback `mock` para desenvolvimento e para fluxos ainda nao migrados

## O que ja esta funcional

- Login com fallback mock e suporte a Firebase Auth
- Login com Google no modo com conta conectada
- Cadastro com fallback mock e suporte a Firebase Auth
- Logout com redirecionamento para login
- Recuperacao de senha
- Persistencia de sessao no app
- Controle de acesso para criar time com liberacao manual
- Multi-times com seletor de time atual
- Criacao de time real no Firestore quando `EXPO_PUBLIC_DATA_SOURCE=firebase`
- Onboarding do time com paletas visuais predefinidas
- Edicao do time com nome, responsavel, paleta, descricao e escudo por URL
- Convite de jogadores por codigo do time
- Entrada em time existente por codigo apos o login
- Papel por time com combinacao de admin e jogador
- Vinculo automatico entre conta e jogador reservado pelo e-mail
- Escudo/logo do time por URL opcional
- Lista e edicao real de jogadores no Firestore quando `EXPO_PUBLIC_DATA_SOURCE=firebase`
- Remocao suave de jogador do elenco com preservacao do historico
- Estatisticas iniciais por jogador com edicao manual para jogos, gols, assistencias e MVPs
- Partidas reais com agenda, presenca e escalacao persistidas quando `EXPO_PUBLIC_DATA_SOURCE=firebase`
- Link de localizacao da partida para abrir no app de mapas
- Dashboard do time
- Lista de jogadores
- Cadastro e edicao de jogadores com regras por perfil
- Criacao de partidas
- Confirmacao de presenca
- Escalacao visual com titulares, reservas e troca entre areas
- Pos-jogo com placar, gols, assistencias e resultado automatico
- Votacao de MVP para jogadores confirmados
- Notas anonimas por criterio com media por jogador
- Estatisticas e rankings atualizados a partir de partidas encerradas

## Arquitetura atual

- `src/app`: rotas e telas com Expo Router
- `src/components`: cards, formularios, lineup, estatisticas e UI base
- `src/config/firebase`: inicializacao validada do Firebase Auth
- `src/constants`: temas, labels e opcoes do dominio
- `src/hooks`: hooks de tema e utilitarios de apresentacao
- `src/lib`: regras puras de partida, lineup e estatisticas
- `src/mocks`: seed e dados iniciais
- `src/services/auth`: camada de autenticacao com implementacoes `mock` e `firebase`
- `src/services/repository`: contrato de dados, mock repository e implementacao incremental do Firestore
- `src/store`: Zustand global, actions e selectors
- `src/types`: modelos TypeScript do dominio e Firestore

## Fluxos entregues nesta etapa

- Cadastro em `Firebase Auth` com criacao automatica do documento `users/{uid}`
- Cadastro inicial cria `appRole: 'player'`, `canCreateTeam: false`, `activeTeamId: null`, `teamId: null` e `playerId: null`
- Tela inicial sem time focada em convite por codigo, atualizacao de acesso e criacao protegida de novo time
- Criacao de time protegida por `canCreateTeam`
- Primeiro acesso com criacao de time real em `teams/{teamId}` quando o acesso e liberado
- Criacao de `teamMembers/{membershipId}` para unir usuario, time, papeis e jogador vinculado
- Vinculo do administrador ao novo time com papeis `admin` e `player`
- Entrada em time por codigo sem sobrescrever outros times ja vinculados na conta
- Seletor "Meus times" para trocar o time atual do app
- Escolha visual de paleta com `primaryColor`, `secondaryColor` e `accentColor`
- Edicao do time com `name`, `coachName`, `slug`, `description`, `logoUrl` e paleta
- Codigo de convite salvo em `teams/{teamId}.inviteCode` com regeneracao sob demanda
- Entrada no time por codigo com atualizacao de `users/{uid}.activeTeamId`
- Vinculo automatico de conta com jogador reservado por `linkedEmail`
- Criacao automatica de jogador basico quando a conta entra no time sem cadastro previo
- `logoUrl` opcional salvo no documento do time
- Cadastro, listagem e edicao de jogadores reais em `players/{playerId}`
- Campo `linkedEmail` para reservar o futuro vinculo de um jogador com a conta dele
- Campo `allowSelfEditJerseyNumber` para liberar ou nao a troca da camisa pelo jogador
- Criacao real de partidas em `matches/{matchId}` a partir do time ativo
- Geracao e atualizacao real de presenca em `attendance/{attendanceId}`
- Escalacao visual salva em `lineups/{lineupId}` com titulares e reservas
- Edicao e cancelamento de partida antes do encerramento
- Formulario de partida com numero livre de jogadores de linha entre `1` e `15`
- Data de partida exibida e preenchida em `DD/MM/AAAA` e `DD/MM/AAAA HH:mm`
- Campo `locationUrl` opcional em partidas para abrir Google Maps ou Waze
- Encerramento simplificado da partida com placar salvo no modo com conta conectada
- Remocao de jogador faz soft delete com limpeza de presenca e escalacao de partidas futuras
- Estatisticas manuais em `players/{playerId}.manualStats` para jogos, gols, assistencias, campanha e MVPs
- Leituras do Firestore carregadas a partir do `activeTeamId`, com `teamId` em todo documento do dominio
- Admin pode adicionar e editar jogadores com validacao de nome, apelido, numero, posicoes, pe dominante e status
- Jogador vinculado pode editar apelido, foto, bio, posicao preferida, posicoes secundarias, pe dominante e videos por URL
- Jogador pode editar a camisa quando o admin liberar essa opcao
- Jogadores confirmam presenca ou ausencia na propria conta
- Escalacao aceita apenas jogadores confirmados no time ativo
- Rankings e cards de estatisticas passam a considerar `manualStats` nesta etapa
- Admin pode encerrar a partida e registrar gols e assistencias apenas dos confirmados
- Resultado da partida e estatisticas do time/jogadores sao recalculados automaticamente
- MVP libera apenas apos encerramento, bloqueia voto duplicado e restringe o alvo a participantes confirmados
- Avaliacoes anonimas usam notas de `0` a `5` e nao exibem o autor do voto
- Escalacao visual suporta diferentes quantidades de linha, arraste no campo e area de reservas

## Credenciais demo

- `admin@bocaiuva.app` / `123456`
- `gestor@bocaiuva.app` / `123456`
- `atacante@bocaiuva.app` / `123456`
- `zagueiro@bocaiuva.app` / `123456`

## Configuracao da conta conectada

1. No Firebase Console, habilite o provedor `Email/Password` em `Authentication`.
2. Para entrar com Google, habilite o provedor `Google` em `Authentication`.
2. Preencha o arquivo `.env` com as variaveis publicas do seu projeto:

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
# opcional como fallback geral:
# EXPO_PUBLIC_GOOGLE_CLIENT_ID=...
```

3. Reinicie o Expo apos alterar o `.env`.
4. O login com Google usa o redirect URI baseado no `scheme` do app (`appboca://auth`).
5. Se os client IDs do Google nao estiverem preenchidos, o botao de Google fica oculto na tela de login.

## Liberacao manual para criar time

1. O usuario cria a conta normalmente com e-mail/senha ou Google.
2. O app cria `users/{uid}` com:

```json
{
  "appRole": "player",
  "canCreateTeam": false,
  "activeTeamId": null,
  "teamId": null,
  "playerId": null
}
```

3. No Firebase Console, abra o documento `users/{uid}` dessa conta.
4. Altere `canCreateTeam` para `true`.
5. Quando o usuario abrir o app novamente, ou tocar em `Atualizar acesso` na tela sem time, a opcao `Criar meu time` passa a aparecer.

Observacoes importantes:

- Quando `EXPO_PUBLIC_DATA_SOURCE=mock`, o app usa o fluxo mockado original.
- Quando `EXPO_PUBLIC_DATA_SOURCE=firebase`, o login, cadastro, login com Google, logout, recuperacao de senha e sessao persistente usam Firebase Auth real.
- Nesta etapa do Firestore, `users`, `teams`, `teamMembers`, `players`, `matches`, `attendance` e `lineups` sao persistidos de verdade.
- A criacao do time usa paletas visuais predefinidas e aceita `logoUrl` opcional.
- Quem entra no app sem `activeTeamId` ve primeiro a tela de convite por codigo.
- A opcao `Criar meu time` ou `Criar novo time` so aparece quando `canCreateTeam` estiver liberado manualmente.
- Uma mesma conta pode participar de varios times e trocar o time atual na tela `Meus times`.
- Os papeis do usuario agora sao avaliados por time, a partir da colecao `teamMembers`.
- Duplicidades antigas de participacao no mesmo time sao deduplicadas automaticamente na leitura e na interface.
- Se houver um jogador do time com `linkedEmail` igual ao e-mail da conta, o app vincula esse jogador automaticamente no primeiro acesso.
- Se ainda nao existir cadastro para esse e-mail, o app cria um jogador basico e o admin pode completar os dados depois.
- O time atual da sessao fica em `users/{uid}.activeTeamId`, enquanto `teamId` e `playerId` continuam como espelho de compatibilidade do time aberto no momento.
- Partidas, presenca e escalacao sempre carregam a partir do time ativo.
- Jogadores removidos saem do elenco ativo e deixam de aparecer nas proximas partidas, sem apagar o historico anterior.
- O local da partida pode exibir apenas o nome do lugar ou tambem um link externo para abrir a rota.
- O modo com conta conectada ja salva placar e status final da partida, mas gols, assistencias, MVP e notas continuam para a proxima migracao.
- Enquanto `matchStats`, MVP e notas ainda nao migram para Firestore, rankings e estatisticas usam `manualStats` como base principal.
- `matchStats`, `MVP` e `ratings` ainda nao foram migrados para Firestore.
- O login com Google exige os client IDs do seu projeto Google para Android, iOS e, se necessario, Web.

## Como rodar

```bash
npm install
npm run start
```

Para conferir tipagem:

```bash
npm run typecheck
```

O schema sugerido para Firestore esta em [docs/firestore-schema.md](./docs/firestore-schema.md).
