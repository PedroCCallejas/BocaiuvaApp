import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  mockRepository,
  resetMockRepositoryState,
} from '@/services/repository/mock-repository';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const joinTeamTestCases: TestCase[] = [
  {
    name: 'entrar com codigo so le time e elenco depois de criar a membership',
    run() {
      const source = fs.readFileSync('src/services/repository/firebase-repository.ts', 'utf8');
      const start = source.indexOf('async joinTeamWithInviteCode');
      assert.equal(start > 0, true, 'metodo joinTeamWithInviteCode nao encontrado');

      const method = source.slice(start, source.indexOf('\n  async createPlayer'));

      // O caminho de quem AINDA NAO e membro comeca depois do bloco
      // `existingMembership?.status === 'active'`, que retorna cedo.
      const newMemberPath = method.slice(method.indexOf('const updatedAt = nowIso();'));
      const commitIndex = newMemberPath.indexOf('await batch.commit();');

      assert.equal(commitIndex > 0, true, 'commit da membership nao encontrado');

      const beforeCommit = newMemberPath.slice(0, commitIndex);

      // As regras exigem membership ativa para ler `teams` e `players`.
      // Ler antes do commit devolve permission-denied para quem chega com
      // o codigo de convite, que e exatamente o fluxo de entrada no time.
      assert.doesNotMatch(
        beforeCommit,
        /await fetchTeamById\(/,
        'time lido antes de existir membership: quebra a entrada por codigo',
      );
      assert.doesNotMatch(
        beforeCommit,
        /await fetchPlayersByTeamId\(/,
        'elenco lido antes de existir membership: quebra a entrada por codigo',
      );

      const afterCommit = newMemberPath.slice(commitIndex);
      assert.match(afterCommit, /await fetchTeamById\(/);
      assert.match(afterCommit, /await fetchPlayersByTeamId\(/);
    },
  },
  {
    name: 'regras confirmam que ler time exige membership ativa',
    run() {
      const rules = fs.readFileSync('firestore.rules', 'utf8');
      const teamsBlock = rules.slice(rules.indexOf('match /teams/{teamId}'));
      const block = teamsBlock.slice(0, teamsBlock.indexOf('\n    }'));

      // Se um dia isso for afrouxado, o codigo de convite vaza junto com o
      // documento do time — por isso a correcao foi na ordem das leituras.
      assert.match(block, /allow get: if canReadTeamScopedData\(teamId\)/);
    },
  },
  {
    name: 'jogador entra no time com o codigo e o vinculo por e-mail e reconhecido',
    async run() {
      resetMockRepositoryState();

      const team = await mockRepository.getSnapshot();
      assert.equal(team.teams.length >= 0, true);

      // Fluxo real: usuario novo, cadastrado com o mesmo e-mail que o admin
      // ja tinha deixado no cadastro do jogador.
      const novoUsuario = await mockRepository.register({
        email: 'convidado@bocaiuva.app',
        password: '123456',
        displayName: 'Convidado',
      });

      const admin = await mockRepository.login({
        email: 'admin@bocaiuva.app',
        password: '123456',
      });
      const snapshot = await mockRepository.getSnapshot();
      const currentTeam = snapshot.teams[0];
      assert.notEqual(currentTeam, undefined);

      const player = await mockRepository.createPlayer(
        {
          teamId: currentTeam!.id,
          fullName: 'Convidado Silva',
          nickname: 'Convidado',
          jerseyNumber: 77,
          primaryPosition: 'midfielder',
          secondaryPositions: [],
          dominantFoot: 'right',
          status: 'active',
          linkedEmail: 'convidado@bocaiuva.app',
        },
        admin.id,
      );

      const result = await mockRepository.joinTeamWithInviteCode(
        currentTeam!.inviteCode,
        novoUsuario.id,
      );

      assert.equal(result.team.id, currentTeam!.id);

      // Cadastrar o jogador com um e-mail que ja tem conta cria o vinculo na
      // hora, entao ao usar o codigo ele pode chegar como membro. O que
      // importa nos dois caminhos e o jogador certo ser reconhecido.
      assert.equal(result.playerLink.status, 'linked');
      assert.equal(result.playerLink.playerId, player.id);
    },
  },
  {
    name: 'entrar de novo com o mesmo codigo nao duplica membership',
    async run() {
      resetMockRepositoryState();

      const novoUsuario = await mockRepository.register({
        email: 'repetido@bocaiuva.app',
        password: '123456',
        displayName: 'Repetido',
      });

      await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const snapshot = await mockRepository.getSnapshot();
      const currentTeam = snapshot.teams[0];

      const primeira = await mockRepository.joinTeamWithInviteCode(
        currentTeam!.inviteCode,
        novoUsuario.id,
      );
      const segunda = await mockRepository.joinTeamWithInviteCode(
        currentTeam!.inviteCode,
        novoUsuario.id,
      );

      assert.equal(primeira.alreadyMember, false);
      assert.equal(segunda.alreadyMember, true);
    },
  },
  {
    name: 'codigo inexistente devolve erro claro',
    async run() {
      resetMockRepositoryState();

      const usuario = await mockRepository.register({
        email: 'semtime@bocaiuva.app',
        password: '123456',
        displayName: 'Sem Time',
      });

      await assert.rejects(
        () => mockRepository.joinTeamWithInviteCode('CODIGO-INVALIDO', usuario.id),
        (error) => error instanceof Error,
      );
    },
  },
];
