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
- `matchStats`
- `mvpVotes`
- `playerRatings`
- `notifications`

Colecoes planejadas para as proximas etapas:

- `seasons`

## Regras de arquitetura

- Todo documento relacionado ao time deve carregar `teamId`.
- `users` mantem `activeTeamId` para indicar qual time esta aberto no app.
- `teamMembers` concentra os vinculos entre conta, time, papeis e jogador.
- `players` sempre possuem `teamId`.
- Leituras operacionais do app partem do `activeTeamId`, enquanto a navegacao de times usa as memberships da conta.
- As permissoes de pos-partida usam a membership do `activeTeamId`.
- Notificacoes internas tambem leem e gravam sempre pelo `activeTeamId`.
- A estrutura ja fica pronta para multiplos times no mesmo projeto Firebase.
- O uso em Web/PWA no iPhone reaproveita exatamente o mesmo schema e as mesmas regras de `activeTeamId`.

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
- No cadastro inicial, o app cria `appRole: 'player'`, `activeTeamId: null`, `teamId: null` e `playerId: null`.
- `canCreateTeam` permanece apenas como campo legado de compatibilidade temporaria.
- A criacao de time nao depende mais de `canCreateTeam`.
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
- A interface considera apenas uma participacao ativa por `userId + teamId`, mesmo que existam duplicatas antigas no banco.
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
- Qualquer usuario autenticado pode criar ate 2 times em que seja `adminUserId`.
- O limite conta apenas times proprios; participar de outros times nao consome vaga.
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
- `deletedAt`
- `createdAt`
- `updatedAt`

Notas:

- `teamId` e obrigatorio em todo jogador.
- `linkedUserId` guarda a conta conectada ao jogador quando ela ja entrou no app.
- `linkedEmail` permite reservar um cadastro antes da conta do jogador existir.
- `allowSelfEditJerseyNumber` permite ao admin liberar a troca da camisa pelo proprio jogador.
- `manualStats` segura o historico inicial enquanto partidas reais ainda nao sao persistidas.
- `deletedAt` marca a remocao suave do jogador do elenco ativo.
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
- Rankings e cards de estatisticas somam `manualStats` com os dados reais das partidas.

### `matches/{matchId}`

- `id`
- `teamId`
- `seasonId`
- `date`
- `time`
- `venue`
- `locationUrl`
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
- `locationUrl` e opcional e aceita links externos de mapas.
- Ao encerrar a partida, o app grava placar, gols e assistencias dos jogadores confirmados.

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

### `matchStats/{matchStatId}`

- `id`
- `teamId`
- `matchId`
- `playerId`
- `played`
- `started`
- `goals`
- `assists`
- `yellowCards`
- `redCards`
- `notes`
- `createdAt`
- `updatedAt`

Notas:

- Todo registro carrega `teamId`.
- Apenas jogadores confirmados podem receber estatisticas.
- O app salva um registro estavel por jogador participante usando o par `matchId + playerId`.
- O `id` recomendado fica no formato `matchId__playerId`.
- Ao editar o pos-jogo, o app atualiza os registros validos e remove apenas sobras antigas.

### `mvpVotes/{voteId}`

- `id`
- `teamId`
- `matchId`
- `voterPlayerId`
- `targetPlayerId`
- `createdAt`
- `updatedAt`

Notas:

- Apenas jogadores confirmados podem votar.
- Cada jogador confirmado vota uma unica vez por partida.
- Nao e permitido votar em si mesmo.
- O documento usa um identificador estavel com `matchId + voterPlayerId` para reforcar a regra de voto unico.
- O `id` recomendado fica no formato `matchId__voterPlayerId`.

### `playerRatings/{ratingId}`

- `id`
- `teamId`
- `matchId`
- `raterPlayerId`
- `targetPlayerId`
- `criteria`
- `overall`
- `createdAt`
- `updatedAt`

Notas:

- Apenas jogadores confirmados podem avaliar.
- Cada jogador confirmado pode avaliar outro jogador uma unica vez por partida.
- Nao e permitido avaliar a si mesmo.
- `overall` e a media consolidada das notas enviadas em `criteria`.
- O documento usa um identificador estavel com `matchId + raterPlayerId + targetPlayerId`.
- O `id` recomendado fica no formato `matchId__raterPlayerId__targetPlayerId`.

### `notifications/{notificationId}`

- `id`
- `teamId`
- `type`
- `title`
- `message`
- `matchId`
- `playerId`
- `actorUserId`
- `readByUserIds`
- `createdAt`
- `updatedAt`

Notas:

- Toda notificacao carrega `teamId`.
- A leitura da interface usa apenas o `activeTeamId` da conta.
- O documento guarda o estado de leitura por usuario em `readByUserIds`.
- `matchId` e opcional para abrir o detalhe da partida relacionada.
- `playerId` e opcional para destacar quem protagonizou o evento.
- `actorUserId` registra quem disparou a movimentacao principal.
- Nesta etapa nao existe push nativo; a notificacao fica somente dentro do app e da PWA.
- IDs estaveis por evento ajudam a atualizar avisos sem duplicar historico desnecessariamente.

## Colecoes futuras

- `seasons`: `teamId`, `name`, `year`, `startDate`, `endDate`, `status`

## Detalhes uteis

- `scoreboard`: `{ team: number, opponent: number, result: 'win' | 'draw' | 'loss' }`
- `lineups.starters`: array de `{ playerId, x, y, zone }`
- `playerRatings.criteria`: objeto com `marking`, `attack`, `defense`, `stamina`, `resistance`, `grit`, `flair`, `passing`, `finishing`

## Fluxos de acesso

- Cadastro novo: cria `users/{uid}` sem time ativo; `canCreateTeam` pode permanecer no documento apenas por compatibilidade.
- Criacao de time: qualquer conta autenticada pode criar ate 2 times, contando apenas documentos `teams` onde ela e `adminUserId`.
- Criacao de time: ao salvar, o app cria `teams/{teamId}`, `players/{playerId}` basico do criador e `teamMembers/{membershipId}` com papeis `admin` e `player`.
- Entrada com codigo: busca `teams` por `inviteCode`, tenta vincular por `linkedEmail` e cria ou atualiza `teamMembers`.
- Troca de time: atualiza `users/{uid}.activeTeamId` sem apagar participacoes anteriores.
- Criacao de partida: grava `matches/{matchId}` e cria `attendance` pendente para o elenco do time ativo.
- Resposta de presenca: atualiza `attendance` no time ativo.
- Escalacao visual: grava `lineups/{lineupId}` com titulares e reservas apenas dos confirmados.
- Pos-jogo: grava `matchStats/{matchStatId}` para os confirmados e fecha a partida com placar.
- MVP: grava `mvpVotes/{voteId}` com um voto por jogador confirmado.
- Avaliacoes: grava `playerRatings/{ratingId}` com uma avaliacao por alvo em cada partida.
- Estatisticas e rankings: somam `manualStats` com `matchStats`, `mvpVotes` e `playerRatings` validos do time ativo.
- Notificacoes: grava `notifications/{notificationId}` para nova partida, edicao, presenca, escalacao, encerramento, liberacao de voto/nota e destaque da partida.
- Reabertura do app: o snapshot do `activeTeamId` recarrega os dados reais de pos-jogo e notificacoes do Firestore.
- Remocao de jogador: marca `players/{playerId}` como inativo, limpa presenca e escalacao futura e preserva o historico anterior.

## Indices recomendados

- `users(activeTeamId)`
- `teamMembers(userId)`
- `teamMembers(teamId)`
- `teams(adminUserId)`
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
- `notifications(teamId, updatedAt)`
