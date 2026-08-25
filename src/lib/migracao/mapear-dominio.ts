/**
 * Conversão linha do Postgres → objeto do domínio.
 *
 * É o caminho inverso de `mapear-postgres.ts`, e existe pelo mesmo motivo: é
 * onde o erro passa despercebido. Uma coluna lida errado não quebra nada — só
 * mostra o número errado na tela, e ninguém desconfia.
 *
 * Três diferenças que o Postgres impõe e o domínio não conhece:
 *
 * 1. `snake_case` nas colunas, `camelCase` no domínio;
 * 2. `timestamptz` volta como ISO com fuso; o domínio espera a string ISO;
 * 3. o rateio virou tabela (`expense_shares`), mas o domínio ainda espera três
 *    listas paralelas. A remontagem acontece aqui, num lugar só.
 */

import type {
  AttendanceRecord,
  Player,
  TeamMember,
  Expense,
  ExpenseCategory,
  ExpenseSplitMode,
  Lineup,
  Match,
  MatchDiaryEntry,
  MatchDiaryMood,
  MatchStat,
} from '@/types/domain';

type Linha = Record<string, unknown>;

export interface LinhaDeCota {
  expense_id?: unknown;
  player_id?: unknown;
  amount_cents?: unknown;
  settled_at?: unknown;
}

function texto(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : padrao;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

function inteiro(valor: unknown, padrao = 0): number {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;

  return Number.isFinite(numero) ? Math.trunc(numero) : padrao;
}

/**
 * `timestamptz` volta como `2026-08-13T20:00:00+00:00`. O domínio compara e
 * ordena essas strings, então normalizar para o formato com `Z` evita duas
 * representações do mesmo instante convivendo no app.
 */
export function instanteOuNulo(valor: unknown): string | null {
  const bruto = textoOuNulo(valor);

  if (!bruto) {
    return null;
  }

  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export function instante(valor: unknown, padrao: string): string {
  return instanteOuNulo(valor) ?? padrao;
}

/** `date` volta como `YYYY-MM-DD`, que é o que o domínio usa. */
export function dataOuNulo(valor: unknown): string | null {
  const bruto = textoOuNulo(valor);

  if (!bruto) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}/.test(bruto) ? bruto.slice(0, 10) : null;
}

function listaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

export function paraCategoriaDeDespesa(linha: Linha): ExpenseCategory {
  const agora = new Date().toISOString();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    label: texto(linha.label, 'Categoria'),
    archivedAt: instanteOuNulo(linha.archived_at),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

/**
 * Remonta a despesa a partir da linha e das cotas.
 *
 * `participantPlayerIds`, `settledPlayerIds` e `manualSharesCents` deixaram de
 * existir como colunas: viraram `expense_shares`. O domínio ainda espera as três
 * listas, então a reconstrução mora aqui — e some no dia em que as telas
 * passarem a consultar as cotas direto.
 *
 * A ordem das cotas importa: no rateio igual, o centavo que sobra vai para os
 * primeiros. Ordenar por `player_id` mantém o resultado estável entre leituras,
 * em vez de depender da ordem que o Postgres devolveu.
 */
export function paraDespesa(linha: Linha, cotas: LinhaDeCota[] = []): Expense {
  const agora = new Date().toISOString();
  const id = texto(linha.id);

  const minhasCotas = cotas
    .filter((cota) => texto(cota.expense_id) === id)
    .map((cota) => ({
      playerId: texto(cota.player_id),
      amountCents: inteiro(cota.amount_cents),
      settledAt: instanteOuNulo(cota.settled_at),
    }))
    .filter((cota) => cota.playerId.length > 0)
    .sort((esquerda, direita) => esquerda.playerId.localeCompare(direita.playerId));

  const splitMode: ExpenseSplitMode =
    linha.split_mode === 'manual' ? 'manual' : 'equal';

  const manualSharesCents: Record<string, number> = {};

  for (const cota of minhasCotas) {
    manualSharesCents[cota.playerId] = cota.amountCents;
  }

  return {
    id,
    teamId: texto(linha.team_id),
    categoryId: texto(linha.category_id),
    matchId: textoOuNulo(linha.match_id),
    description: textoOuNulo(linha.description),
    date: dataOuNulo(linha.date) ?? agora.slice(0, 10),
    totalAmountCents: inteiro(linha.total_amount_cents),
    paidByPlayerId: textoOuNulo(linha.paid_by_player_id),
    splitMode,
    participantPlayerIds: minhasCotas.map((cota) => cota.playerId),
    extraSharesCount: inteiro(linha.extra_shares_count),
    // Só faz sentido no modo manual. No igual, o valor é derivado do total e
    // devolver o mapa faria a tela achar que houve rateio à mão.
    manualSharesCents: splitMode === 'manual' ? manualSharesCents : undefined,
    settledPlayerIds: minhasCotas
      .filter((cota) => cota.settledAt !== null)
      .map((cota) => cota.playerId),
    createdBy: textoOuNulo(linha.created_by),
    deletedAt: instanteOuNulo(linha.deleted_at),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

// ── Elenco e vínculo ───────────────────────────────────────────────────────

const POSICOES = [
  'goalkeeper',
  'right-back',
  'center-back',
  'left-back',
  'wing-back',
  'defensive-midfielder',
  'midfielder',
  'attacking-midfielder',
  'winger',
  'forward',
  'striker',
] as const;

export function paraJogador(linha: Linha): Player {
  const agora = new Date().toISOString();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    linkedUserId: textoOuNulo(linha.linked_user_id),
    linkedEmail: textoOuNulo(linha.linked_email),
    fullName: texto(linha.full_name, 'Jogador'),
    nickname: texto(linha.nickname) || texto(linha.full_name, 'Jogador'),
    photoUrl: textoOuNulo(linha.photo_url),
    presentationVideoUrl: textoOuNulo(linha.presentation_video_url),
    introVideoUrl: textoOuNulo(linha.intro_video_url),
    celebrationVideoUrl: textoOuNulo(linha.celebration_video_url),
    jerseyNumber: inteiro(linha.jersey_number),
    primaryPosition: opcao(linha.primary_position, POSICOES, 'midfielder'),
    secondaryPositions: listaDeTextos(linha.secondary_positions).filter((posicao) =>
      (POSICOES as readonly string[]).includes(posicao),
    ) as Player['secondaryPositions'],
    preferredPosition: textoOuNulo(linha.preferred_position) as Player['preferredPosition'],
    dominantFoot: opcao(linha.dominant_foot, ['right', 'left', 'both'] as const, 'right'),
    status: opcao(
      linha.status,
      ['active', 'injured', 'suspended', 'inactive'] as const,
      'active',
    ),
    bio: texto(linha.bio),
    allowSelfEditJerseyNumber: linha.allow_self_edit_jersey_number === true,
    manualStats: (objetoOuNulo(linha.manual_stats) ?? undefined) as Player['manualStats'],
    feeExemption: (objetoOuNulo(linha.fee_exemption) ?? null) as Player['feeExemption'],
    deletedAt: instanteOuNulo(linha.deleted_at),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

/**
 * Vínculo da pessoa com o time.
 *
 * No Firestore isto tinha um espelho (`teamMembershipIndex`) só porque a regra
 * não conseguia consultar coleção. Aqui a tabela é a única fonte, e toda a
 * maquinaria de reparo daquele espelho deixa de existir.
 */
export function paraVinculo(linha: Linha): TeamMember {
  const agora = new Date().toISOString();

  const papeis = listaDeTextos(linha.roles).filter((papel) =>
    ['admin', 'player'].includes(papel),
  ) as TeamMember['roles'];

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    userId: texto(linha.user_id),
    playerId: textoOuNulo(linha.player_id),
    inviteCodeUsed: textoOuNulo(linha.invite_code_used),
    roles: papeis.length > 0 ? papeis : ['player'],
    canManageTeam: linha.can_manage_team === true,
    canManagePlayers: linha.can_manage_players === true,
    joinedAt: instante(linha.joined_at, agora),
    status: opcao(linha.status, ['active', 'inactive'] as const, 'active'),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

// ── Partida ────────────────────────────────────────────────────────────────

const STATUS_DE_PARTIDA = ['scheduled', 'confirmed', 'finished', 'canceled'] as const;
const TIPOS_DE_PARTIDA = ['society', 'futsal', 'field', 'training'] as const;
const STATUS_DE_PRESENCA = ['confirmed', 'absent', 'pending'] as const;

function opcao<T extends string>(valor: unknown, permitidos: readonly T[], padrao: T): T {
  const bruto = textoOuNulo(valor);
  return bruto && (permitidos as readonly string[]).includes(bruto) ? (bruto as T) : padrao;
}

/** Objeto para campo `jsonb`. Array e primitivo não entram. */
function objetoOuNulo(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return null;
  }

  return valor as Record<string, unknown>;
}

export interface LinhaDeCustoDeCampo {
  match_id?: unknown;
  total_amount_cents?: unknown;
  split_count?: unknown;
  amount_per_player_cents?: unknown;
  note?: unknown;
  pix_key?: unknown;
  responsible_name?: unknown;
  paid_guest_count?: unknown;
  updated_at?: unknown;
  updated_by_user_id?: unknown;
}

export interface LinhaDeParticipanteDoCampo {
  match_id?: unknown;
  player_id?: unknown;
  role?: unknown;
}

/**
 * Remonta a partida.
 *
 * `fieldCost` e `fieldPayment` deixaram de ser `jsonb` dentro da partida: viraram
 * `match_field_costs` e `match_field_participants`. O domínio ainda espera os
 * dois objetos, então a reconstrução mora aqui.
 *
 * O valor volta para **reais** porque é o que o domínio usa hoje. No banco ele
 * está em centavos inteiros — a conversão de ida arredondou uma vez, e refazer
 * a divisão aqui só acumularia erro.
 */
export function paraPartida(
  linha: Linha,
  custo?: LinhaDeCustoDeCampo | null,
  participantes: LinhaDeParticipanteDoCampo[] = [],
): Match {
  const agora = new Date().toISOString();
  const id = texto(linha.id);

  const meusParticipantes = participantes.filter(
    (item) => texto(item.match_id) === id,
  );

  const porPapel = (papel: 'payer' | 'exempt') =>
    meusParticipantes
      .filter((item) => texto(item.role) === papel)
      .map((item) => texto(item.player_id))
      .filter((playerId) => playerId.length > 0)
      .sort((esquerda, direita) => esquerda.localeCompare(direita));

  const temCusto = Boolean(custo) && inteiro(custo?.total_amount_cents) > 0;

  return {
    id,
    teamId: texto(linha.team_id),
    seasonId: textoOuNulo(linha.season_id),
    date: dataOuNulo(linha.date) ?? agora.slice(0, 10),
    time: texto(linha.time),
    venue: texto(linha.venue),
    locationUrl: textoOuNulo(linha.location_url),
    opponentName: texto(linha.opponent_name),
    opponentLogoUrl: textoOuNulo(linha.opponent_logo_url),
    opponentTeamId: textoOuNulo(linha.opponent_team_id),
    opponentTeamName: textoOuNulo(linha.opponent_team_name),
    opponentTeamLogoUrl: textoOuNulo(linha.opponent_team_logo_url),
    opponentSource: opcao(
      linha.opponent_source,
      ['manual', 'public_team'] as const,
      'manual',
    ),
    linePlayersCount: inteiro(linha.line_players_count),
    matchType: opcao(linha.match_type, TIPOS_DE_PARTIDA, 'society'),
    notes: texto(linha.notes),
    status: opcao(linha.status, STATUS_DE_PARTIDA, 'scheduled'),
    createdBy: texto(linha.created_by),
    scoreboard: objetoOuNulo(linha.scoreboard) as Match['scoreboard'],
    fieldCost: temCusto
      ? {
          totalAmount: inteiro(custo?.total_amount_cents) / 100,
          splitCount: inteiro(custo?.split_count),
          amountPerPlayer: inteiro(custo?.amount_per_player_cents) / 100,
          currency: 'BRL',
          note: textoOuNulo(custo?.note),
          updatedAt: instante(custo?.updated_at, agora),
          updatedByUserId: textoOuNulo(custo?.updated_by_user_id) ?? undefined,
        }
      : null,
    fieldPayment:
      meusParticipantes.length > 0 || custo
        ? {
            payerPlayerIds: porPapel('payer'),
            exemptPlayerIds: porPapel('exempt'),
            paidGuestCount: inteiro(custo?.paid_guest_count),
            pixKey: textoOuNulo(custo?.pix_key),
            responsibleName: textoOuNulo(custo?.responsible_name),
            updatedAt: instante(custo?.updated_at, agora),
            updatedByUserId: textoOuNulo(custo?.updated_by_user_id) ?? undefined,
          }
        : null,
    finishedAt: instanteOuNulo(linha.finished_at),
    mvpWinnerPlayerIds: listaDeTextos(linha.mvp_winner_player_ids),
    mvpTotalVotes: inteiro(linha.mvp_total_votes),
    manualMvpPlayerId: textoOuNulo(linha.manual_mvp_player_id),
    manualMvpSelectedBy: textoOuNulo(linha.manual_mvp_selected_by),
    manualMvpSelectedAt: instanteOuNulo(linha.manual_mvp_selected_at),
    deletedAt: instanteOuNulo(linha.deleted_at),
    deletedBy: textoOuNulo(linha.deleted_by),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

export function paraPresenca(linha: Linha): AttendanceRecord {
  const agora = new Date().toISOString();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    playerId: texto(linha.player_id),
    userId: textoOuNulo(linha.user_id),
    status: opcao(linha.status, STATUS_DE_PRESENCA, 'pending'),
    respondedAt: instanteOuNulo(linha.responded_at),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

export function paraEstatistica(linha: Linha): MatchStat {
  const agora = new Date().toISOString();

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    playerId: texto(linha.player_id),
    played: linha.played === true,
    started: linha.started === true,
    goals: inteiro(linha.goals),
    assists: inteiro(linha.assists),
    yellowCards: inteiro(linha.yellow_cards),
    redCards: inteiro(linha.red_cards),
    notes: texto(linha.notes),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

/**
 * Escalação.
 *
 * `starters` é `jsonb` de propósito: são coordenadas x/y para desenhar o campo,
 * não relação. O que vem do banco é validado aqui porque um nó sem `playerId`
 * quebraria o desenho.
 */
export function paraEscalacao(linha: Linha): Lineup {
  const agora = new Date().toISOString();

  const titulares = Array.isArray(linha.starters)
    ? linha.starters
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => ({
          playerId: texto(item.playerId),
          x: decimal(item.x),
          y: decimal(item.y),
          zone: opcao(
            item.zone,
            ['goalkeeper', 'defense', 'midfield', 'attack'] as const,
            'midfield',
          ),
          label: textoOuNulo(item.label),
        }))
        .filter((no) => no.playerId.length > 0)
    : [];

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    formationKey: texto(linha.formation_key),
    starters: titulares,
    benchPlayerIds: listaDeTextos(linha.bench_player_ids),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

function decimal(valor: unknown, padrao = 0): number {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;

  return Number.isFinite(numero) ? numero : padrao;
}

const HUMORES: MatchDiaryMood[] = ['funny', 'highlight', 'warning', 'praise', 'neutral'];

/**
 * Resenha da partida.
 *
 * `authorName` é cópia denormalizada de propósito: vive na resenha para o
 * histórico não mudar quando a pessoa troca o nome depois.
 */
export function paraResenha(linha: Linha): MatchDiaryEntry {
  const agora = new Date().toISOString();
  const humor = textoOuNulo(linha.mood);

  return {
    id: texto(linha.id),
    teamId: texto(linha.team_id),
    matchId: texto(linha.match_id),
    authorUserId: texto(linha.author_user_id),
    authorName: texto(linha.author_name),
    title: textoOuNulo(linha.title),
    content: texto(linha.content),
    mentionedPlayerIds: listaDeTextos(linha.mentioned_player_ids),
    visibility: 'team',
    pinned: linha.pinned === true,
    // Valor fora da lista renderizaria um ícone inexistente na tela.
    mood: humor && HUMORES.includes(humor as MatchDiaryMood) ? (humor as MatchDiaryMood) : null,
    emoji: textoOuNulo(linha.emoji),
    createdAt: instante(linha.created_at, agora),
    updatedAt: instante(linha.updated_at, agora),
  };
}

/**
 * Cotas a gravar para uma despesa.
 *
 * Inverso de `paraDespesa`. No modo manual respeita o valor informado; no igual
 * distribui o total entre participantes e cotas extras, com o resto indo para
 * os primeiros — a mesma regra de `splitEqualCents`, para a soma fechar.
 */
export function paraCotasDaDespesa(
  expense: Expense,
  dividirIgual: (totalCents: number, shareCount: number) => number[],
): { expense_id: string; player_id: string; amount_cents: number; settled_at: string | null }[] {
  const participantes = [...new Set(expense.participantPlayerIds)];

  if (participantes.length === 0) {
    return [];
  }

  const quitados = new Set(expense.settledPlayerIds);
  const agora = new Date().toISOString();
  const divisoes = participantes.length + Math.max(0, expense.extraSharesCount ?? 0);
  const iguais = dividirIgual(expense.totalAmountCents, divisoes);

  return participantes.map((playerId, indice) => {
    const manual =
      expense.splitMode === 'manual' ? expense.manualSharesCents?.[playerId] : undefined;

    return {
      expense_id: expense.id,
      player_id: playerId,
      amount_cents: Math.max(0, Math.trunc(manual ?? iguais[indice] ?? 0)),
      settled_at: quitados.has(playerId) ? agora : null,
    };
  });
}
