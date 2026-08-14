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
      // na memoria do app, sem ter sido gravado no membership.
      assert.match(block, /isCurrentMembershipPlayer\(/);

      const helper = rulesBlock(rules, 'function isCurrentMembershipPlayer');
      assert.match(helper, /currentMembershipIndex\(teamId\)\.data\.playerId == playerId/);
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
];
