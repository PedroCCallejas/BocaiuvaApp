import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const RULES = 'firestore.rules';
const REPO = 'src/services/repository/firebase-repository.ts';

function rulesBlock(source: string, matcher: string) {
  const start = source.indexOf(matcher);
  assert.equal(start > 0, true, `bloco ${matcher} nao encontrado`);
  return source.slice(start, source.indexOf('\n    }', start));
}

export const mvpVotePermissionTestCases: TestCase[] = [
  {
    name: 'voto de MVP depende do playerId gravado no indice de membership',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const block = rulesBlock(rules, 'match /mvpVotes/{voteId}');

      // Esta e a condicao que negava o voto quando o vinculo existia apenas
      // na memoria do app, sem ter sido gravado no membership. Hoje ela e o
      // caminho principal dentro de isTeamPlayerForCurrentUser.
      assert.match(block, /isTeamPlayerForCurrentUser\(/);

      const helper = rulesBlock(rules, 'function isCurrentMembershipPlayer');
      assert.match(helper, /currentMembershipIndex\(teamId\)\.data\.playerId == playerId/);
    },
  },
  {
    name: 'ler voto que ainda nao existe e permitido',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const bloco = rulesBlock(rules, 'match /mvpVotes/{voteId}');

      // A transacao le o proprio voto antes de grava-lo, para barrar voto
      // duplicado. Nesse instante `resource` e nulo, e `resource.data.teamId`
      // derrubava a regra — a transacao morria antes de escrever.
      assert.match(bloco, /allow get: if isSignedIn\(\) &&/);
      assert.match(bloco, /resource == null \|\| canReadTeamScopedData\(resource\.data\.teamId\)/);

      // `list` continua exigindo vinculo: ali `resource` nunca e nulo.
      assert.match(bloco, /allow list: if canReadTeamScopedData\(resource\.data\.teamId\);/);
    },
  },
  {
    name: 'ler avaliacao que ainda nao existe e permitido',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const bloco = rulesBlock(rules, 'match /playerRatings/{ratingId}');

      assert.match(bloco, /resource == null \|\| canReadTeamScopedData\(resource\.data\.teamId\)/);
      assert.match(bloco, /allow list: if canReadTeamScopedData\(resource\.data\.teamId\);/);
    },
  },
  {
    name: 'toda transacao que le antes de criar tem a regra correspondente',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const rules = fs.readFileSync(RULES, 'utf8');

      // Se alguem adicionar outra transacao com get de documento novo, esta
      // conta acusa: hoje sao duas, voto e avaliacao, e as duas tem a excecao.
      const transacoes = (repo.match(/await transaction\.get\(/g) ?? []).length;
      const excecoes = (rules.match(/resource == null \|\| canReadTeamScopedData/g) ?? []).length;

      assert.equal(
        excecoes >= transacoes,
        true,
        `${transacoes} transacoes leem documento novo, mas so ${excecoes} regras permitem`,
      );
    },
  },
  {
    name: 'presenca, voto e nota nao dependem so do indice de membership',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');

      // O indice so ganha `playerId` depois de uma escrita que jogador comum
      // quase nunca consegue fazer. Enquanto isso era a unica fonte, parte do
      // elenco levava permission-denied e a outra parte nao — mesmo perfil.
      for (const bloco of [
        'function isOwnAttendanceWrite',
        'match /mvpVotes/{voteId}',
        'match /playerRatings/{ratingId}',
      ]) {
        assert.match(
          rulesBlock(rules, bloco),
          /isTeamPlayerForCurrentUser\(/,
          `${bloco} ainda depende so do indice`,
        );
      }
    },
  },
  {
    name: 'a segunda fonte e o cadastro que o admin reservou para a conta',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const helper = rulesBlock(rules, 'function isTeamPlayerForCurrentUser');

      // O indice continua valendo como caminho principal.
      assert.match(helper, /isCurrentMembershipPlayer\(teamId, playerId\)/);

      // E a alternativa exige vinculo ativo no time, jogador daquele time,
      // ativo, e reservado para esta conta — nenhuma confianca nova.
      assert.match(helper, /hasActiveTeamMembership\(teamId\)/);
      assert.match(helper, /playerDoc\(playerId\)\.data\.teamId == teamId/);
      assert.match(helper, /isPlayerActiveForSelfEdit\(playerDoc\(playerId\)\.data\)/);
      assert.match(helper, /isLinkedPlayerForCurrentUser\(playerDoc\(playerId\)\.data\)/);
    },
  },
  {
    name: 'e-mail de cadastro antigo e comparado normalizado',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const helper = rulesBlock(rules, 'function isLinkedPlayerForCurrentUser');

      // `currentUserEmail()` ja vem em minusculas; sem normalizar o outro lado,
      // quem foi cadastrado com maiuscula nunca casava.
      assert.match(helper, /playerData\.linkedEmail\.lower\(\) == currentUserEmail\(\)/);
    },
  },
  {
    name: 'jogador pode reivindicar o proprio playerId no membership',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const membersBlock = rulesBlock(rules, 'match /teamMembers/{membershipId}');

      assert.match(membersBlock, /isSelfPlayerLinkClaim\(membershipId\)/);
    },
  },
  {
    name: 'a reivindicacao so sai de vazio e nao muda mais nada',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const claim = rulesBlock(rules, 'function isSelfPlayerLinkClaim');

      // Precisa ser o proprio usuario, com membership ativa.
      assert.match(claim, /resource\.data\.userId == currentUserId\(\)/);
      assert.match(claim, /resource\.data\.status == 'active'/);

      // Só preenche o que estava vazio: nunca troca um vinculo existente.
      assert.match(claim, /resource\.data\.playerId == null \|\| resource\.data\.playerId == ''/);
      assert.match(claim, /request\.resource\.data\.playerId\.size\(\) > 0/);

      // Papeis, permissoes e status ficam intactos - senao seria escalada
      // de privilegio disfarcada de vinculo.
      for (const campo of [
        'roles',
        'canManageTeam',
        'canManagePlayers',
        'status',
        'createdAt',
        'joinedAt',
        'teamId',
      ]) {
        assert.match(
          claim,
          new RegExp(`request\\.resource\\.data\\.${campo} == resource\\.data\\.${campo}`),
          `campo ${campo} deveria ser imutavel na reivindicacao`,
        );
      }
    },
  },
  {
    name: 'so da para reivindicar jogador que o admin reservou para a conta',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const check = rulesBlock(rules, 'function claimedPlayerBelongsToCurrentUser');

      // Ou o jogador ja aponta para este uid, ou esta livre e com o e-mail
      // que o admin cadastrou. Sem isso, qualquer um se vincularia a qualquer
      // jogador do time.
      assert.match(check, /playerDoc\(playerId\)\.data\.linkedUserId == currentUserId\(\)/);
      assert.match(check, /linkedEmail\.lower\(\) == currentUserEmail\(\)/);
      assert.match(check, /playerDoc\(playerId\)\.data\.teamId == teamId/);
      assert.match(check, /playerDoc\(playerId\)\.data\.status == 'active'/);
    },
  },
  {
    name: 'escrita do membership e tentada sozinha quando o lote e recusado',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');

      // O lote e tudo-ou-nada: a escrita do player costuma ser negada para
      // jogador comum e derrubava junto a do membership, que e a que destrava
      // voto de MVP, notas e autoedicao.
      assert.match(repo, /const membershipOnlyBatch = writeBatch\(firestore\);/);
      assert.match(repo, /await membershipOnlyBatch\.commit\(\);/);

      const trecho = repo.slice(repo.indexOf('const membershipOnlyBatch'));
      assert.match(trecho.slice(0, 900), /buildTeamMembershipIndexMutation\(membership\)/);

      // Se ate isso for negado, o app segue sem quebrar.
      assert.match(
        trecho.slice(0, 1200),
        /extractErrorCode\(membershipOnlyError\) !== 'permission-denied'/,
      );
    },
  },
  {
    name: 'efeitos colaterais do voto nao viajam mais no mesmo lote do voto',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const bloco = repo.slice(
        repo.indexOf('async submitMvpVote('),
        repo.indexOf('async submitPlayerRating('),
      );

      assert.equal(bloco.length > 0, true, 'submitMvpVote nao encontrado');

      // O lote e tudo-ou-nada: juntar o agregado da partida com a notificacao
      // fazia o voto do jogador comum falhar em `matches`, que so aceita admin.
      assert.doesNotMatch(bloco, /writeBatch\(firestore\)/);
      assert.match(bloco, /runBestEffort\('submitMvpVote:matchAggregate'/);
      assert.match(bloco, /runBestEffort\('submitMvpVote:winnerNotification'/);
    },
  },
  {
    name: 'agregado da partida grava so os campos do MVP',
    run() {
      const repo = fs.readFileSync(REPO, 'utf8');
      const trecho = repo.slice(repo.indexOf("runBestEffort('submitMvpVote:matchAggregate'"));

      // `setDoc` reescreveria o documento inteiro e a regra recusaria por
      // mexer em campo fora do agregado.
      assert.match(trecho.slice(0, 500), /updateDoc\(/);

      for (const campo of ['mvpWinnerPlayerIds', 'mvpTotalVotes', 'updatedAt']) {
        assert.match(trecho.slice(0, 500), new RegExp(campo));
      }
    },
  },
  {
    name: 'partida aceita escrita de membro apenas para o agregado do MVP',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const bloco = rulesBlock(rules, 'match /matches/{matchId}');

      assert.match(bloco, /isMvpAggregateUpdate\(resource\.data\.teamId\)/);
      // Apagar partida continua sendo so do admin.
      assert.match(bloco, /allow delete: if canManageTeamData\(resource\.data\.teamId\);/);
    },
  },
  {
    name: 'a excecao do agregado nao deixa mudar mais nada da partida',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const regra = rulesBlock(rules, 'function isMvpAggregateUpdate');

      assert.match(regra, /hasActiveTeamMembership\(teamId\)/);
      // Votacao so existe em partida encerrada.
      assert.match(regra, /resource\.data\.status == 'finished'/);
      assert.match(regra, /affectedKeys\(\)\.hasOnly\(\[/);

      for (const campo of ['mvpWinnerPlayerIds', 'mvpTotalVotes', 'updatedAt']) {
        assert.match(regra, new RegExp(`'${campo}'`));
      }

      // Placar, escalacao e custo do campo ficam fora da brecha.
      for (const campo of ['scoreboard', 'status', 'date', 'fieldCost']) {
        assert.doesNotMatch(regra, new RegExp(`'${campo}'`));
      }
    },
  },
  {
    name: 'cadastro com linkedUserId vazio nao trava a reivindicacao',
    run() {
      const rules = fs.readFileSync(RULES, 'utf8');
      const check = rulesBlock(rules, 'function claimedPlayerBelongsToCurrentUser');

      // O restante das regras trata null e '' como "sem vinculo"; aqui so o
      // null era aceito, e o jogador ficava sem conseguir votar.
      assert.match(check, /playerDoc\(playerId\)\.data\.linkedUserId == ''/);
    },
  },
];
