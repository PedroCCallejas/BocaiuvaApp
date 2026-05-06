# Firestore Schema

## Etapa atual

Colecoes implementadas nesta etapa atual:

- `users`
- `teams`
- `teamMembers`
- `players`
- `matches`
- `attendance`
- `lineups`

Colecoes planejadas para as proximas etapas:

- `matchStats`
- `mvpVotes`
- `playerRatings`
- `seasons`

## Regras de arquitetura

- Todo documento relacionado ao time deve carregar `teamId`.
- `users` mantem `activeTeamId` para indicar qual time esta aberto no app.
- `teamMembers` concentra os vinculos entre conta, time, papeis e jogador.
- `players` sempre possuem `teamId`.
- Leituras operacionais do app partem do `activeTeamId`, enquanto a navegacao de times usa as memberships da conta.
- A estrutura ja fica pronta para multiplos times no mesmo projeto Firebase.

## Campos por colecao

### `users/{uid}`

- `id`
- `displayName`
- `email`
- `appRole`
- `canCreateTeam`
- `activeTeamId`
- `teamId`
- `playerId`
- `avatarUrl`
- `createdAt`
- `updatedAt`

Notas:

- O documento usa o mesmo `uid` do Firebase Auth.
- `appRole` pode ser `owner`, `team_admin` ou `player`.
- No cadastro inicial, o app cria `appRole: 'player'`, `canCreateTeam: false`, `activeTeamId: null`, `teamId: null` e `playerId: null`.
- O campo `canCreateTeam` controla quem pode abrir um time novo no app.
- Quando o acesso e liberado manualmente, o usuario passa a enxergar a opcao de criar time na tela sem time.
- `activeTeamId` aponta para o time que esta carregado no momento.
- `teamId` e `playerId` continuam como espelho temporario do time atual para compatibilidade.
- Ao criar um time, a conta passa a apontar para esse time em `activeTeamId` e ganha uma membership com papel de admin e jogador.
- Ao entrar com codigo em um time existente, a conta passa a apontar esse time em `activeTeamId`, sem perder outras memberships.
- Se existir um jogador com `linkedEmail` igual ao e-mail da conta, o app faz a vinculacao automaticamente.

### `teamMembers/{membershipId}`

- `id`
- `userId`
- `teamId`
- `playerId`
- `roles`
- `canManageTeam`
- `canManagePlayers`
- `joinedAt`
- `status`
- `createdAt`
- `updatedAt`

Notas:

- Cada documento representa a participacao de uma conta em um time.
- `roles` aceita `admin`, `player` ou ambos ao mesmo tempo.
- `canManageTeam` libera edicao do time e convites.
- `canManagePlayers` libera cadastro, edicao de jogadores e ajuste de estatisticas manuais.
- `playerId` aponta para o cadastro esportivo do usuario dentro daquele time.
- Ao criar um novo time, o app cria uma membership com `roles: ['admin', 'player']`.
- Ao entrar com codigo, o app cria uma membership com `roles: ['player']`, a menos que ela ja exista.
- Se o usuario ja participar do time, o app apenas troca o time atual aberto na conta.

### `teams/{teamId}`

- `id`
- `name`
- `slug`
- `description`
- `logoUrl`
- `primaryColor`
- `secondaryColor`
- `accentColor`
- `coachName`
- `adminUserId`
- `inviteCode`
- `inviteCodeUpdatedAt`
- `activeSeasonId`
- `createdAt`
- `updatedAt`

Notas:

- `adminUserId` referencia o usuario responsavel pelo time.
- `description` e opcional e serve para apresentar o estilo ou proposta do time no app.
- `logoUrl` e opcional e aceita apenas URL nesta etapa.
- `accentColor` prepara a identidade visual do time para componentes de destaque.
- `inviteCode` e um codigo curto usado para entrada de novos jogadores no time.
- `inviteCodeUpdatedAt` registra quando o ultimo codigo passou a valer.
- A criacao do time so pode acontecer quando `users/{uid}.canCreateTeam` estiver `true`.
- Nesta etapa, `activeSeasonId` fica `null`.

### `players/{playerId}`

- `id`
- `teamId`
- `linkedUserId`
- `linkedEmail`
- `fullName`
- `nickname`
- `photoUrl`
- `jerseyNumber`
- `primaryPosition`
- `secondaryPositions`
- `dominantFoot`
- `status`
- `bio`
- `preferredPosition`
- `allowSelfEditJerseyNumber`
- `manualStats`
- `introVideoUrl`
- `celebrationVideoUrl`
- `createdAt`
- `updatedAt`

Notas:

- `teamId` e obrigatorio em todo jogador.
- `linkedUserId` guarda a conta conectada ao jogador quando ela ja entrou no app.
- `linkedEmail` permite reservar um cadastro antes da conta do jogador existir.
- `allowSelfEditJerseyNumber` permite ao admin liberar a troca da camisa pelo proprio jogador.
- `manualStats` segura o historico inicial enquanto partidas reais ainda nao sao persistidas.
- Nada de foto, video, upload ou Storage entra nesta fase.

### `players/{playerId}.manualStats`

- `matches`
- `goals`
- `assists`
- `wins`
- `draws`
- `losses`
- `mvps`

Notas:

- Todos os campos sao numericos e comecam em `0`.
- Nesta etapa, rankings e cards de estatisticas usam `manualStats` como fonte principal no modo com Firestore.
- Quando `matchStats` real for migrado, a ideia e somar os dados manuais com os dados vindos das partidas.

### `matches/{matchId}`

- `id`
- `teamId`
- `seasonId`
- `date`
- `time`
- `venue`
- `opponentName`
- `opponentLogoUrl`
- `linePlayersCount`
- `matchType`
- `notes`
- `status`
- `createdBy`
- `scoreboard`
- `finishedAt`
- `mvpWinnerPlayerIds`
- `mvpTotalVotes`
- `createdAt`
- `updatedAt`

Notas:

- Todo documento de partida pertence a um `teamId`.
- A leitura parte do `activeTeamId` da conta.
- Admin do time pode criar, editar, cancelar e encerrar a partida.
- Nesta etapa, o modo com conta conectada salva placar e status final, mas ainda nao persiste `matchStats`, MVP ou notas.

### `attendance/{attendanceId}`

- `id`
- `teamId`
- `matchId`
- `playerId`
- `userId`
- `status`
- `respondedAt`
- `createdAt`
- `updatedAt`

Notas:

- Cada resposta de presenca tambem carrega `teamId`.
- Ao criar a partida, o app gera registros pendentes para o elenco do time.
- Jogadores respondem a propria presenca.
- Admin pode acompanhar confirmados, ausentes e pendentes do time ativo.

### `lineups/{lineupId}`

- `id`
- `teamId`
- `matchId`
- `formationKey`
- `starters`
- `benchPlayerIds`
- `createdAt`
- `updatedAt`

Notas:

- A escalacao fica vinculada ao `teamId` e `matchId`.
- `starters` guarda o jogador e sua posicao visual no campo.
- `benchPlayerIds` guarda os reservas.
- A escalacao aceita apenas jogadores confirmados para a partida.
- Admin e jogador no mesmo time tambem pode aparecer normalmente na escalacao se estiver confirmado.

## Colecoes futuras

- `matchStats`: `teamId`, `matchId`, `playerId`, `played`, `started`, `goals`, `assists`, `yellowCards`, `redCards`, `notes`
- `mvpVotes`: `teamId`, `matchId`, `voterPlayerId`, `targetPlayerId`
- `playerRatings`: `teamId`, `matchId`, `raterPlayerId`, `targetPlayerId`, `criteria`, `overall`
- `seasons`: `teamId`, `name`, `year`, `startDate`, `endDate`, `status`

## Detalhes uteis

- `scoreboard`: `{ team: number, opponent: number, result: 'win' | 'draw' | 'loss' }`
- `lineups.starters`: array de `{ playerId, x, y, zone }`
- `playerRatings.criteria`: objeto com `marking`, `attack`, `defense`, `stamina`, `resistance`, `grit`, `flair`, `passing`, `finishing`

## Fluxos de acesso

- Cadastro novo: cria `users/{uid}` sem time ativo e com `canCreateTeam: false`.
- Liberacao manual: alterar `users/{uid}.canCreateTeam` para `true` no Console.
- Criacao de time: cria `teams/{teamId}`, `players/{playerId}` basico do criador e `teamMembers/{membershipId}` com papeis `admin` e `player`.
- Entrada com codigo: busca `teams` por `inviteCode`, tenta vincular por `linkedEmail` e cria ou atualiza `teamMembers`.
- Troca de time: atualiza `users/{uid}.activeTeamId` sem apagar participacoes anteriores.
- Criacao de partida: grava `matches/{matchId}` e cria `attendance` pendente para o elenco do time ativo.
- Resposta de presenca: atualiza `attendance` no time ativo.
- Escalacao visual: grava `lineups/{lineupId}` com titulares e reservas apenas dos confirmados.

## Indices recomendados

- `users(activeTeamId)`
- `teamMembers(userId)`
- `teamMembers(teamId)`
- `teams(inviteCode)`
- `players(teamId)`
- `players(teamId, jerseyNumber)`
- `matches(teamId, date)`
- `matches(teamId, status, date)`
- `attendance(matchId, status)`
- `attendance(teamId, matchId)`
- `lineups(matchId)`
- `matchStats(teamId, playerId)`
- `mvpVotes(matchId, targetPlayerId)`
- `playerRatings(matchId, targetPlayerId)`
