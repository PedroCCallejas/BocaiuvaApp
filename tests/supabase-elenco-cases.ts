import assert from 'node:assert/strict';
import fs from 'node:fs';

import { paraJogador, paraVinculo } from '@/lib/migracao/mapear-dominio';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const MODULO = 'src/services/repository/supabase/elenco.ts';
const FIREBASE = 'src/services/repository/firebase-repository.ts';

function apenasCodigo(fonte: string) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('//'))
    .join('\n');
}

const LINHA_DE_JOGADOR = {
  id: 'p1',
  team_id: 'team-1',
  linked_user_id: 'user-1',
  linked_email: 'pedro@exemplo.com',
  full_name: 'Pedro Callejas',
  nickname: 'Callejas',
  jersey_number: 10,
  primary_position: 'striker',
  secondary_positions: ['winger', 'inventada'],
  dominant_foot: 'right',
  status: 'active',
  allow_self_edit_jersey_number: true,
  fee_exemption: { mode: 'always', reason: 'Presidente' },
  deleted_at: null,
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-08-24T12:00:00+00:00',
};

const LINHA_DE_VINCULO = {
  id: 'tm1',
  team_id: 'team-1',
  user_id: 'user-1',
  player_id: 'p1',
  roles: ['admin', 'player', 'inventado'],
  can_manage_team: true,
  can_manage_players: true,
  status: 'active',
  joined_at: '2026-01-01T00:00:00+00:00',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-01-01T00:00:00+00:00',
};

export const supabaseElencoTestCases: TestCase[] = [
  {
    name: 'jogador volta com a isencao e o vinculo',
    run() {
      const jogador = paraJogador(LINHA_DE_JOGADOR);

      assert.equal(jogador.nickname, 'Callejas');
      assert.equal(jogador.jerseyNumber, 10);
      assert.equal(jogador.linkedUserId, 'user-1');
      assert.deepEqual(jogador.feeExemption, { mode: 'always', reason: 'Presidente' });
    },
  },
  {
    name: 'posicao invalida nao entra na lista de secundarias',
    run() {
      // Renderizaria um rotulo inexistente na ficha.
      const jogador = paraJogador(LINHA_DE_JOGADOR);

      assert.deepEqual(jogador.secondaryPositions, ['winger']);
      assert.equal(
        paraJogador({ ...LINHA_DE_JOGADOR, primary_position: 'zagueirao' }).primaryPosition,
        'midfielder',
      );
    },
  },
  {
    name: 'apelido vazio cai no nome completo',
    run() {
      const jogador = paraJogador({ ...LINHA_DE_JOGADOR, nickname: '   ' });

      assert.equal(jogador.nickname, 'Pedro Callejas');
    },
  },
  {
    name: 'papel invalido no vinculo e descartado',
    run() {
      const vinculo = paraVinculo(LINHA_DE_VINCULO);

      // Papel desconhecido daria permissao imprevisivel na tela.
      assert.deepEqual(vinculo.roles, ['admin', 'player']);
      assert.equal(vinculo.canManageTeam, true);
    },
  },
  {
    name: 'vinculo sem papel nenhum vira jogador comum',
    run() {
      // Lista vazia deixaria a pessoa sem permissao nenhuma, nem de ver.
      const vinculo = paraVinculo({ ...LINHA_DE_VINCULO, roles: [] });

      assert.deepEqual(vinculo.roles, ['player']);
    },
  },
  {
    name: 'e-mail do jogador entra em minusculas',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const criar = modulo.slice(modulo.indexOf('export async function criarJogador'));

      // Cadastro com maiuscula foi o que deixou gente sem conseguir votar.
      assert.match(criar.slice(0, 1200), /email\.toLowerCase\(\)/);
    },
  },
  {
    name: 'o contexto da sessao nao repara nada',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));

      // A maquinaria de reparo existia so por causa do indice espelhado do
      // Firestore. Aqui a tabela e a unica fonte.
      for (const rotina of [
        'ensureMembershipPlayerLink',
        'repairCurrentUserMemberships',
        'reconcileDuplicateMemberships',
        'clearLinkedUserMembershipPlayer',
        'teamMembershipIndex',
      ]) {
        assert.doesNotMatch(modulo, new RegExp(rotina), `${rotina} nao deveria existir aqui`);
      }
    },
  },
  {
    name: 'a maquinaria de reparo ainda existe no Firestore, e some com ele',
    run() {
      // Registra o tamanho do que a migracao apaga: se um dia isso sumir do
      // firebase-repository, o teste avisa que o comentario ficou desatualizado.
      const firebase = fs.readFileSync(FIREBASE, 'utf8');
      const rotinas = [
        'ensureMembershipPlayerLink',
        'repairCurrentUserMembershipsByLinkedPlayers',
        'reconcileDuplicateMemberships',
        'clearLinkedUserMembershipPlayer',
      ].filter((rotina) => firebase.includes(rotina));

      assert.equal(rotinas.length, 4, `esperava 4 rotinas de reparo, achei ${rotinas.length}`);
    },
  },
  {
    name: 'apagar jogador confia na chave estrangeira, nao so na checagem do app',
    run() {
      const modulo = fs.readFileSync(MODULO, 'utf8');
      const apagar = modulo.slice(modulo.indexOf('export async function apagarJogadorDeVez'));

      // O banco recusa por conta propria se houver historico — protege mesmo
      // que a checagem do app falhe.
      assert.match(apagar.slice(0, 700), /\.delete\(\)/);
      assert.match(apagar.slice(0, 900), /so pode ser inativado|só pode ser inativado/);
    },
  },
  {
    name: 'inativar jogador nao apaga o historico',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const inativar = modulo.slice(modulo.indexOf('export async function inativarJogador'));

      assert.match(inativar.slice(0, 300), /status: 'inactive'/);
      assert.doesNotMatch(inativar.slice(0, 300), /\.delete\(\)/);
    },
  },
  {
    name: 'entrar no time distingue novo membro de quem ja estava',
    run() {
      const modulo = apenasCodigo(fs.readFileSync(MODULO, 'utf8'));
      const entrar = modulo.slice(modulo.indexOf('export async function entrarComCodigo'));

      // A RPC devolve o vinculo nos dois casos; a tela precisa saber se diz
      // "bem-vindo" ou "voce ja esta aqui".
      assert.match(entrar.slice(0, 1400), /idsAntes/);
      assert.match(entrar.slice(0, 1400), /jaEraMembro: idsAntes\.has\(vinculo\.id\)/);
    },
  },
];
