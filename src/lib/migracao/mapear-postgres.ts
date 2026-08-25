/**
 * Conversão documento do Firestore → linha do Postgres.
 *
 * Tudo aqui é função pura: entra o documento cru, sai a linha. É de propósito —
 * o mapeamento é onde uma migração erra, e erro de mapeamento em produção é
 * silencioso. Sendo puro, dá para testar cada caso torto sem banco nenhum.
 *
 * Três coisas que o Firestore permite e o Postgres não:
 * 1. campo ausente / `undefined` — aqui virou `null` explícito;
 * 2. data em qualquer formato (ISO, Timestamp, número) — aqui virou ISO ou nulo;
 * 3. referência pendurada, apontando para documento que não existe mais.
 *
 * A terceira é a que derruba a importação: FK do Postgres recusa a linha
 * inteira. Por isso `resolverReferencias` existe.
 */

import { splitEqualCents } from '@/lib/expenses';

/** Ordem obrigatória de importação: a chave estrangeira depende dela. */
export const ORDEM_DAS_TABELAS = [
  'users',
  'teams',
  'players',
  'team_members',
  'seasons',
  'matches',
  'lineups',
  'attendance',
  'match_stats',
  'mvp_votes',
  'player_ratings',
  'match_diary_entries',
  'notifications',
  'expense_categories',
  'expenses',
  'rating_criteria',
] as const;

/**
 * Tabelas preenchidas a partir do mesmo documento que gerou o pai.
 *
 * No Firestore isso vivia dentro do documento — array em `expenses`, jsonb em
 * `matches`. Aqui viraram relação, mas continuam sendo lidas de uma vez só: são
 * derivadas do documento que já está na mão, sem gastar leitura a mais.
 */
export const TABELAS_FILHAS = [
  'expense_shares',
  'match_field_costs',
  'match_field_participants',
] as const;

export type NomeDaTabelaFilha = (typeof TABELAS_FILHAS)[number];

/**
 * Tabelas cujo módulo já roda no Postgres em produção.
 *
 * Reimportar essas do Firestore **apaga dado real**: o app grava aqui agora, e
 * o Firestore só tem a versão congelada de antes da virada. Uma despesa criada
 * hoje sumiria; uma quitação marcada voltaria a aberta.
 *
 * O importador recusa essas tabelas por padrão. Documentar não bastaria — este
 * é exatamente o tipo de detalhe que se esquece meses depois, quando quem
 * migrou não está mais por perto.
 *
 * Ao migrar um módulo novo, acrescente as tabelas dele aqui **no mesmo commit**
 * que liga a flag em produção.
 */
export const TABELAS_DE_MODULO_JA_MIGRADO: Partial<Record<NomeDaTabela, string>> = {
  expenses: 'financeiro',
  expense_categories: 'financeiro',

  match_diary_entries: 'resenhas',

  matches: 'partidas',
  lineups: 'partidas',
  attendance: 'partidas',
  match_stats: 'partidas',

  mvp_votes: 'avaliacoes',
  player_ratings: 'avaliacoes',
  rating_criteria: 'avaliacoes',

  // O elenco arrasta `users`, `teams` e `team_members` junto: são o contexto da
  // sessão, e reimportar qualquer um deles desfaria vínculo criado depois da
  // virada — a pessoa abriria o app sem time.
  players: 'elenco',
  users: 'elenco',
  teams: 'elenco',
  team_members: 'elenco',
};

// As tabelas filhas não precisam entrar aqui: elas só são gravadas dentro do
// laço da tabela pai, então proteger o pai já as protege. `expense_shares`
// segue `expenses`; `match_field_costs` e `match_field_participants` seguem
// `matches`.

/** Chave usada no `upsert`. Tabela filha tem chave composta, não `id`. */
export const CHAVE_DE_CONFLITO: Record<NomeDaTabelaFilha, string> = {
  expense_shares: 'expense_id,player_id',
  match_field_costs: 'match_id',
  match_field_participants: 'match_id,player_id',
};

export type NomeDaTabela = (typeof ORDEM_DAS_TABELAS)[number];

type Documento = Record<string, unknown> & { id?: unknown };

export type Linha = Record<string, unknown> & { id: string };

/** Linha de tabela filha: chave composta, sem coluna `id`. */
export type LinhaFilha = Record<string, unknown>;

// ── Conversores de valor ───────────────────────────────────────────────────

export function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') {
    return null;
  }

  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

export function texto(valor: unknown, padrao = ''): string {
  return textoOuNulo(valor) ?? padrao;
}

export function booleano(valor: unknown, padrao = false): boolean {
  return typeof valor === 'boolean' ? valor : padrao;
}

/**
 * Inteiro não negativo. As colunas de gol, cartão e centavo têm `check >= 0`:
 * um número negativo vindo de dado antigo recusaria a linha toda.
 */
export function inteiro(valor: unknown, padrao = 0, minimo = 0): number {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;

  if (!Number.isFinite(numero)) {
    return padrao;
  }

  return Math.max(minimo, Math.trunc(numero));
}

export function decimal(valor: unknown, padrao = 0): number {
  const numero =
    typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : Number.NaN;

  return Number.isFinite(numero) ? numero : padrao;
}

/**
 * Data e hora em ISO, aceitando os três formatos que aparecem no banco atual:
 * string ISO (o normal), `Timestamp` do Firestore e número em milissegundos.
 */
export function instanteOuNulo(valor: unknown): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return new Date(valor).toISOString();
  }

  if (valor && typeof valor === 'object') {
    const candidato = valor as { toDate?: () => Date; seconds?: unknown; _seconds?: unknown };

    if (typeof candidato.toDate === 'function') {
      try {
        return instanteOuNulo(candidato.toDate());
      } catch {
        return null;
      }
    }

    // Timestamp já serializado para JSON perde o `toDate`.
    const segundos = candidato.seconds ?? candidato._seconds;

    if (typeof segundos === 'number' && Number.isFinite(segundos)) {
      return new Date(segundos * 1000).toISOString();
    }
  }

  const bruto = textoOuNulo(valor);

  if (!bruto) {
    return null;
  }

  const data = new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

/**
 * `created_at` e `updated_at` são NOT NULL. Documento sem data válida não pode
 * derrubar a linha: cai no instante de referência da importação.
 */
export function instante(valor: unknown, referencia: string): string {
  return instanteOuNulo(valor) ?? referencia;
}

/** Só a data, YYYY-MM-DD. O app compara essas strings direto. */
export function dataOuNulo(valor: unknown): string | null {
  const bruto = textoOuNulo(valor);

  if (bruto && /^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    return bruto;
  }

  const instanteIso = instanteOuNulo(valor);
  return instanteIso ? instanteIso.slice(0, 10) : null;
}

/** Lista de ids: descarta vazio e repetido, e nunca devolve `null`. */
export function listaDeIds(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  const vistos = new Set<string>();

  for (const item of valor) {
    const id = textoOuNulo(item);

    if (id) {
      vistos.add(id);
    }
  }

  return [...vistos];
}

/** Objeto para coluna `jsonb`. Array e primitivo não entram. */
export function objetoOuNulo(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return null;
  }

  return valor as Record<string, unknown>;
}

export function listaDeObjetos(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) {
    return [];
  }

  return valor.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

/** Valor tem de estar na lista permitida, senão vai o padrão (ou nulo). */
export function opcao<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
  padrao: T | null = null,
): T | null {
  const bruto = textoOuNulo(valor);
  return bruto && (permitidos as readonly string[]).includes(bruto) ? (bruto as T) : padrao;
}

function idOuNulo(documento: Documento): string | null {
  return textoOuNulo(documento.id);
}

// ── Mapeadores ─────────────────────────────────────────────────────────────

type Contexto = { referencia: string };

const POSICOES_VALIDAS = [
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

export function mapearUsuario(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);

  if (!id) {
    return null;
  }

  // Conta sem e-mail existe no banco atual (`normalizeUserDocument` não
  // garante o campo). Descartar levaria junto os times onde a pessoa é dona e
  // as partidas que ela criou.
  const email = textoOuNulo(documento.email);

  return {
    id,
    email: email ? email.toLowerCase() : null,
    display_name: texto(documento.displayName),
    app_role: opcao(documento.appRole, ['owner', 'team_admin', 'player'], 'player'),
    active_team_id: textoOuNulo(documento.activeTeamId),
    avatar_url: textoOuNulo(documento.avatarUrl),
    notification_tokens: listaDeIds(documento.notificationTokens),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearTime(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);

  if (!id) {
    return null;
  }

  // Dono ausente não descarta o time: um time sem dono se conserta depois, um
  // time que sumiu leva junto elenco, partidas e histórico.
  const adminUserId = textoOuNulo(documento.adminUserId);

  return {
    id,
    name: texto(documento.name, 'Time sem nome'),
    // `slug` é UNIQUE e NOT NULL: cair no id garante que nunca colide.
    slug: textoOuNulo(documento.slug) ?? id,
    logo_url: textoOuNulo(documento.logoUrl),
    banner_url: textoOuNulo(documento.bannerUrl),
    presentation_video_url: textoOuNulo(documento.presentationVideoUrl),
    is_public: booleano(documento.isPublic),
    city: textoOuNulo(documento.city),
    state: textoOuNulo(documento.state),
    neighborhood: textoOuNulo(documento.neighborhood),
    home_field_name: textoOuNulo(documento.homeFieldName),
    contact_name: textoOuNulo(documento.contactName),
    contact_phone: textoOuNulo(documento.contactPhone),
    contact_whatsapp: textoOuNulo(documento.contactWhatsapp),
    public_description: textoOuNulo(documento.publicDescription),
    allow_friendly_contact: booleano(documento.allowFriendlyContact),
    public_roster_enabled: booleano(documento.publicRosterEnabled),
    primary_color: texto(documento.primaryColor, '#000000'),
    secondary_color: texto(documento.secondaryColor, '#FFFFFF'),
    accent_color: textoOuNulo(documento.accentColor),
    description: textoOuNulo(documento.description),
    invite_code: texto(documento.inviteCode, id),
    invite_code_updated_at: instante(documento.inviteCodeUpdatedAt, referencia),
    coach_name: texto(documento.coachName),
    admin_user_id: adminUserId,
    active_season_id: textoOuNulo(documento.activeSeasonId),
    default_match_cost_cents:
      documento.defaultMatchCostCents == null ? null : inteiro(documento.defaultMatchCostCents),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearTemporada(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const inicio = dataOuNulo(documento.startDate);
  const fim = dataOuNulo(documento.endDate);

  if (!id || !teamId || !inicio || !fim) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    name: texto(documento.name, 'Temporada'),
    year: inteiro(documento.year, new Date(inicio).getUTCFullYear(), 0),
    start_date: inicio,
    end_date: fim,
    status: opcao(documento.status, ['planned', 'active', 'completed'], 'planned'),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearJogador(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);

  if (!id || !teamId) {
    return null;
  }

  const email = textoOuNulo(documento.linkedEmail);

  return {
    id,
    team_id: teamId,
    linked_user_id: textoOuNulo(documento.linkedUserId),
    // Minúsculo na entrada: a resolução por e-mail compara normalizado, e
    // cadastro com maiúscula já deixou gente sem conseguir votar.
    linked_email: email ? email.toLowerCase() : null,
    full_name: texto(documento.fullName, 'Jogador'),
    nickname: texto(documento.nickname) || texto(documento.fullName, 'Jogador'),
    photo_url: textoOuNulo(documento.photoUrl),
    presentation_video_url: textoOuNulo(documento.presentationVideoUrl),
    intro_video_url: textoOuNulo(documento.introVideoUrl),
    celebration_video_url: textoOuNulo(documento.celebrationVideoUrl),
    jersey_number: inteiro(documento.jerseyNumber),
    primary_position: opcao(documento.primaryPosition, POSICOES_VALIDAS, 'midfielder'),
    secondary_positions: listaDeIds(documento.secondaryPositions).filter((posicao) =>
      (POSICOES_VALIDAS as readonly string[]).includes(posicao),
    ),
    preferred_position: opcao(documento.preferredPosition, POSICOES_VALIDAS),
    dominant_foot: opcao(documento.dominantFoot, ['right', 'left', 'both'], 'right'),
    status: opcao(documento.status, ['active', 'injured', 'suspended', 'inactive'], 'active'),
    bio: textoOuNulo(documento.bio),
    allow_self_edit_jersey_number: booleano(documento.allowSelfEditJerseyNumber),
    manual_stats: objetoOuNulo(documento.manualStats),
    fee_exemption: objetoOuNulo(documento.feeExemption),
    deleted_at: instanteOuNulo(documento.deletedAt),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearVinculo(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const userId = textoOuNulo(documento.userId);

  if (!id || !teamId || !userId) {
    return null;
  }

  const papeis = listaDeIds(documento.roles).filter((papel) =>
    ['admin', 'player'].includes(papel),
  );

  return {
    id,
    team_id: teamId,
    user_id: userId,
    player_id: textoOuNulo(documento.playerId),
    invite_code_used: textoOuNulo(documento.inviteCodeUsed),
    roles: papeis.length > 0 ? papeis : ['player'],
    can_manage_team: booleano(documento.canManageTeam),
    can_manage_players: booleano(documento.canManagePlayers),
    joined_at: instante(documento.joinedAt, referencia),
    status: opcao(documento.status, ['active', 'inactive'], 'active'),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearCriterio(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);

  if (!id || !teamId) {
    return null;
  }

  const peso = decimal(documento.weight, 1);

  return {
    id,
    team_id: teamId,
    label: texto(documento.label, 'Critério'),
    description: textoOuNulo(documento.description),
    type: opcao(documento.type, ['positive', 'negative'], 'positive'),
    // A coluna tem `check (weight > 0)`.
    weight: peso > 0 ? peso : 1,
    active: booleano(documento.active, true),
    order: inteiro(documento.order),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearPartida(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const data = dataOuNulo(documento.date);

  // Sem data a partida não significa nada; sem autor ela ainda vale.
  if (!id || !teamId || !data) {
    return null;
  }

  const criadoPor = textoOuNulo(documento.createdBy);

  return {
    id,
    team_id: teamId,
    season_id: textoOuNulo(documento.seasonId),
    date: data,
    time: texto(documento.time),
    venue: texto(documento.venue),
    location_url: textoOuNulo(documento.locationUrl),
    opponent_name: texto(documento.opponentName),
    opponent_logo_url: textoOuNulo(documento.opponentLogoUrl),
    opponent_team_id: textoOuNulo(documento.opponentTeamId),
    opponent_team_name: textoOuNulo(documento.opponentTeamName),
    opponent_team_logo_url: textoOuNulo(documento.opponentTeamLogoUrl),
    opponent_source: opcao(documento.opponentSource, ['manual', 'public_team']),
    line_players_count: inteiro(documento.linePlayersCount),
    match_type: opcao(
      documento.matchType,
      ['society', 'futsal', 'field', 'training'],
      'society',
    ),
    notes: textoOuNulo(documento.notes),
    status: opcao(
      documento.status,
      ['scheduled', 'confirmed', 'finished', 'canceled'],
      'scheduled',
    ),
    created_by: criadoPor,
    scoreboard: objetoOuNulo(documento.scoreboard),
    // `field_cost` e `field_payment` saíram desta tabela: viraram
    // `match_field_costs` e `match_field_participants`, preenchidas por
    // `derivarCustoDoCampo` e `derivarParticipantesDoCampo`.
    finished_at: instanteOuNulo(documento.finishedAt),
    mvp_winner_player_ids: listaDeIds(documento.mvpWinnerPlayerIds),
    mvp_total_votes: inteiro(documento.mvpTotalVotes),
    manual_mvp_player_id: textoOuNulo(documento.manualMvpPlayerId),
    manual_mvp_selected_by: textoOuNulo(documento.manualMvpSelectedBy),
    manual_mvp_selected_at: instanteOuNulo(documento.manualMvpSelectedAt),
    deleted_at: instanteOuNulo(documento.deletedAt),
    deleted_by: textoOuNulo(documento.deletedBy),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearEscalacao(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const matchId = textoOuNulo(documento.matchId);

  if (!id || !teamId || !matchId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    match_id: matchId,
    formation_key: texto(documento.formationKey),
    starters: listaDeObjetos(documento.starters),
    bench_player_ids: listaDeIds(documento.benchPlayerIds),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearPresenca(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const matchId = textoOuNulo(documento.matchId);
  const playerId = textoOuNulo(documento.playerId);

  if (!id || !teamId || !matchId || !playerId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    match_id: matchId,
    player_id: playerId,
    user_id: textoOuNulo(documento.userId),
    status: opcao(documento.status, ['confirmed', 'absent', 'pending'], 'pending'),
    responded_at: instanteOuNulo(documento.respondedAt),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearEstatistica(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const matchId = textoOuNulo(documento.matchId);
  const playerId = textoOuNulo(documento.playerId);

  if (!id || !teamId || !matchId || !playerId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    match_id: matchId,
    player_id: playerId,
    played: booleano(documento.played),
    started: booleano(documento.started),
    goals: inteiro(documento.goals),
    assists: inteiro(documento.assists),
    yellow_cards: inteiro(documento.yellowCards),
    red_cards: inteiro(documento.redCards),
    notes: textoOuNulo(documento.notes),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearVoto(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const matchId = textoOuNulo(documento.matchId);
  const voterPlayerId = textoOuNulo(documento.voterPlayerId);
  const targetPlayerId = textoOuNulo(documento.targetPlayerId);

  // A tabela tem `check (voter <> target)`: voto em si mesmo recusaria a linha.
  if (!id || !teamId || !matchId || !voterPlayerId || !targetPlayerId) {
    return null;
  }

  if (voterPlayerId === targetPlayerId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    match_id: matchId,
    voter_player_id: voterPlayerId,
    target_player_id: targetPlayerId,
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearNota(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const matchId = textoOuNulo(documento.matchId);
  const raterPlayerId = textoOuNulo(documento.raterPlayerId);
  const targetPlayerId = textoOuNulo(documento.targetPlayerId);

  if (!id || !teamId || !matchId || !raterPlayerId || !targetPlayerId) {
    return null;
  }

  if (raterPlayerId === targetPlayerId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    match_id: matchId,
    rater_player_id: raterPlayerId,
    target_player_id: targetPlayerId,
    criteria_scores: objetoOuNulo(documento.criteriaScores) ?? {},
    criteria_snapshot: objetoOuNulo(documento.criteriaSnapshot) ?? {},
    // Avaliação antiga usava ids fixos de critério; guardar em coluna separada
    // preserva o histórico sem misturar com o modelo novo.
    legacy_criteria: objetoOuNulo(documento.criteria),
    overall: decimal(documento.overall),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearResenha(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const matchId = textoOuNulo(documento.matchId);
  const conteudo = textoOuNulo(documento.content);

  if (!id || !teamId || !matchId || !conteudo) {
    return null;
  }

  // O texto é a resenha. Autor desconhecido não apaga o que foi escrito.
  const authorUserId = textoOuNulo(documento.authorUserId);

  return {
    id,
    team_id: teamId,
    match_id: matchId,
    author_user_id: authorUserId,
    author_name: texto(documento.authorName),
    title: textoOuNulo(documento.title),
    content: conteudo,
    mentioned_player_ids: listaDeIds(documento.mentionedPlayerIds),
    visibility: 'team',
    pinned: booleano(documento.pinned),
    mood: opcao(documento.mood, ['funny', 'highlight', 'warning', 'praise', 'neutral']),
    emoji: textoOuNulo(documento.emoji),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearAviso(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const tipo = textoOuNulo(documento.type);
  const titulo = textoOuNulo(documento.title);

  if (!id || !teamId || !tipo || !titulo) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    type: tipo,
    title: titulo,
    message: texto(documento.message),
    match_id: textoOuNulo(documento.matchId),
    player_id: textoOuNulo(documento.playerId),
    entry_id: textoOuNulo(documento.entryId),
    actor_user_id: textoOuNulo(documento.actorUserId),
    target_user_id: textoOuNulo(documento.targetUserId),
    read_by_user_ids: listaDeIds(documento.readByUserIds),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearCategoria(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);

  if (!id || !teamId) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    label: texto(documento.label, 'Categoria'),
    archived_at: instanteOuNulo(documento.archivedAt),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

export function mapearDespesa(documento: Documento, { referencia }: Contexto): Linha | null {
  const id = idOuNulo(documento);
  const teamId = textoOuNulo(documento.teamId);
  const categoryId = textoOuNulo(documento.categoryId);
  const data = dataOuNulo(documento.date);

  if (!id || !teamId || !categoryId || !data) {
    return null;
  }

  return {
    id,
    team_id: teamId,
    category_id: categoryId,
    match_id: textoOuNulo(documento.matchId),
    description: textoOuNulo(documento.description),
    date: data,
    total_amount_cents: inteiro(documento.totalAmountCents),
    paid_by_player_id: textoOuNulo(documento.paidByPlayerId),
    split_mode: opcao(documento.splitMode, ['equal', 'manual'], 'equal'),
    extra_shares_count: inteiro(documento.extraSharesCount),
    created_by: textoOuNulo(documento.createdBy),
    deleted_at: instanteOuNulo(documento.deletedAt),
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  };
}

// ── Tabelas filhas ─────────────────────────────────────────────────────────

/**
 * Cota de cada participante da despesa.
 *
 * O valor é congelado na importação em vez de recalculado toda vez. É de
 * propósito: o rateio já foi combinado e cobrado no mundo real, e recalcular
 * depois — com participante removido, ou com a lógica evoluindo — mudaria
 * quanto alguém deve num acerto que já aconteceu.
 *
 * A divisão usa a mesma distribuição de resto de `splitEqualCents`: sobrando
 * centavo, ele vai para os primeiros, e a soma fecha exatamente.
 */
export function derivarCotasDaDespesa(
  documento: Documento,
  { referencia }: Contexto,
): LinhaFilha[] {
  const expenseId = idOuNulo(documento);
  const participantes = listaDeIds(documento.participantPlayerIds);

  if (!expenseId || participantes.length === 0) {
    return [];
  }

  const total = inteiro(documento.totalAmountCents);
  const extras = inteiro(documento.extraSharesCount);
  const manuais = objetoOuNulo(documento.manualSharesCents);
  const manual = opcao(documento.splitMode, ['equal', 'manual'], 'equal') === 'manual';
  const quitados = new Set(listaDeIds(documento.settledPlayerIds));

  // Cotas extras (convidado que ninguém cadastrou) entram na divisão mas não
  // viram linha: não há jogador a quem cobrar.
  const divisoes = participantes.length + Math.max(0, extras);
  const iguais = splitEqualCents(total, divisoes);

  return participantes.map((playerId, indice) => {
    const valorManual = manual && manuais ? inteiro(manuais[playerId], 0) : null;

    return {
      expense_id: expenseId,
      player_id: playerId,
      amount_cents: valorManual ?? iguais[indice] ?? 0,
      settled_at: quitados.has(playerId) ? instante(documento.updatedAt, referencia) : null,
      created_at: instante(documento.createdAt, referencia),
      updated_at: instante(documento.updatedAt, referencia),
    };
  });
}

/** Custo do campo, que era jsonb dentro da partida. */
export function derivarCustoDoCampo(
  documento: Documento,
  { referencia }: Contexto,
): LinhaFilha[] {
  const matchId = idOuNulo(documento);
  const custo = objetoOuNulo(documento.fieldCost);
  const pagamento = objetoOuNulo(documento.fieldPayment);

  if (!matchId || (!custo && !pagamento)) {
    return [];
  }

  // No Firestore o valor era float em reais. Dinheiro em float fecha conta
  // errada; aqui entra em centavos inteiros.
  const emCentavos = (valor: unknown) => Math.max(0, Math.round(decimal(valor) * 100));

  return [
    {
      match_id: matchId,
      total_amount_cents: custo ? emCentavos(custo.totalAmount) : 0,
      split_count: custo ? inteiro(custo.splitCount) : 0,
      amount_per_player_cents: custo ? emCentavos(custo.amountPerPlayer) : 0,
      note: custo ? textoOuNulo(custo.note) : null,
      pix_key: pagamento ? textoOuNulo(pagamento.pixKey) : null,
      responsible_name: pagamento ? textoOuNulo(pagamento.responsibleName) : null,
      paid_guest_count: pagamento ? inteiro(pagamento.paidGuestCount) : 0,
      updated_by_user_id:
        textoOuNulo(pagamento?.updatedByUserId) ?? textoOuNulo(custo?.updatedByUserId),
      created_at: instante(documento.createdAt, referencia),
      updated_at: instante(documento.updatedAt, referencia),
    },
  ];
}

/**
 * Quem pagou e quem está isento do rateio do campo.
 *
 * Pagante vence isento quando a pessoa aparece nas duas listas. A chave
 * primária só aceita um papel — e quem pagou, pagou: apagar esse fato criaria
 * um devedor que já acertou.
 */
export function derivarParticipantesDoCampo(
  documento: Documento,
  { referencia }: Contexto,
): LinhaFilha[] {
  const matchId = idOuNulo(documento);
  const pagamento = objetoOuNulo(documento.fieldPayment);

  if (!matchId || !pagamento) {
    return [];
  }

  const pagantes = listaDeIds(pagamento.payerPlayerIds);
  const pagantesSet = new Set(pagantes);
  const isentos = listaDeIds(pagamento.exemptPlayerIds).filter(
    (playerId) => !pagantesSet.has(playerId),
  );

  const linha = (playerId: string, role: 'payer' | 'exempt') => ({
    match_id: matchId,
    player_id: playerId,
    role,
    created_at: instante(documento.createdAt, referencia),
    updated_at: instante(documento.updatedAt, referencia),
  });

  return [
    ...pagantes.map((playerId) => linha(playerId, 'payer')),
    ...isentos.map((playerId) => linha(playerId, 'exempt')),
  ];
}

// ── Conferência pós-gravação ───────────────────────────────────────────────

/**
 * Quantos caracteres de id cabem numa consulta antes de a URL virar problema.
 *
 * A conferência usa `.in('id', [...])`, que o PostgREST recebe como query
 * string. Com id composto — `attendance` usa `matchId__playerId`, 42 caracteres
 * — um lote de 400 gera ~18 KB de URL e o gateway recusa a requisição antes de
 * ela chegar no banco. O erro chega como `fetch failed`, sem nenhuma pista.
 */
export const LIMITE_DE_URL = 4000;

/**
 * Teto de itens por lote, independente do tamanho.
 *
 * O PostgREST devolve no máximo 1000 linhas por resposta. Um lote maior que
 * isso voltaria truncado e a conferência acusaria ids "ausentes" que na verdade
 * foram gravados — falso alarme pior que alarme nenhum.
 */
export const MAXIMO_POR_LOTE = 500;

/**
 * Fatia os ids pelo espaço que ocupam na URL, não por quantidade fixa.
 *
 * Assim id curto continua indo em lote grande e id longo é fatiado sozinho,
 * sem ninguém precisar escolher um número mágico que serve para os dois.
 */
export function lotesQueCabemNaUrl(ids: string[]): string[][] {
  const lotes: string[][] = [];
  let atual: string[] = [];
  let tamanho = 0;

  for (const id of ids) {
    // +3 cobre a vírgula e o escape que a serialização acrescenta.
    const custo = id.length + 3;
    const estouraUrl = tamanho + custo > LIMITE_DE_URL;
    const estouraContagem = atual.length >= MAXIMO_POR_LOTE;

    if (atual.length > 0 && (estouraUrl || estouraContagem)) {
      lotes.push(atual);
      atual = [];
      tamanho = 0;
    }

    atual.push(id);
    tamanho += custo;
  }

  if (atual.length > 0) {
    lotes.push(atual);
  }

  return lotes;
}

// ── Integridade referencial ────────────────────────────────────────────────

/**
 * Referência para documento que não existe mais.
 *
 * O Firestore aceita: o campo é só uma string. O Postgres recusa a linha
 * inteira. Sem tratar isso, uma partida apontando para uma temporada apagada
 * derrubaria a importação de todas as partidas do time.
 *
 * `obrigatorias` — se estiver pendurada, a linha não entra (e é relatada).
 * `opcionais` — se estiver pendurada, o campo vira nulo e a linha entra.
 */
export interface RegraDeReferencia {
  obrigatorias?: Record<string, NomeDaTabela>;
  opcionais?: Record<string, NomeDaTabela>;
}

export const REGRAS_DE_REFERENCIA: Partial<Record<NomeDaTabela, RegraDeReferencia>> = {
  // `admin_user_id` é opcional de propósito: time sem dono se conserta, time
  // descartado leva junto elenco, partidas e histórico.
  teams: { opcionais: { admin_user_id: 'users' } },
  seasons: { obrigatorias: { team_id: 'teams' } },
  players: {
    obrigatorias: { team_id: 'teams' },
    opcionais: { linked_user_id: 'users' },
  },
  team_members: {
    obrigatorias: { team_id: 'teams', user_id: 'users' },
    opcionais: { player_id: 'players' },
  },
  rating_criteria: { obrigatorias: { team_id: 'teams' } },
  matches: {
    obrigatorias: { team_id: 'teams' },
    opcionais: {
      created_by: 'users',
      season_id: 'seasons',
      opponent_team_id: 'teams',
      manual_mvp_player_id: 'players',
      manual_mvp_selected_by: 'users',
      deleted_by: 'users',
    },
  },
  lineups: { obrigatorias: { team_id: 'teams', match_id: 'matches' } },
  attendance: {
    obrigatorias: { team_id: 'teams', match_id: 'matches', player_id: 'players' },
    opcionais: { user_id: 'users' },
  },
  match_stats: {
    obrigatorias: { team_id: 'teams', match_id: 'matches', player_id: 'players' },
  },
  mvp_votes: {
    obrigatorias: {
      team_id: 'teams',
      match_id: 'matches',
      voter_player_id: 'players',
      target_player_id: 'players',
    },
  },
  player_ratings: {
    obrigatorias: {
      team_id: 'teams',
      match_id: 'matches',
      rater_player_id: 'players',
      target_player_id: 'players',
    },
  },
  match_diary_entries: {
    obrigatorias: { team_id: 'teams', match_id: 'matches' },
    opcionais: { author_user_id: 'users' },
  },
  notifications: {
    obrigatorias: { team_id: 'teams' },
    opcionais: {
      match_id: 'matches',
      player_id: 'players',
      actor_user_id: 'users',
      target_user_id: 'users',
    },
  },
  expense_categories: { obrigatorias: { team_id: 'teams' } },
  expenses: {
    obrigatorias: { team_id: 'teams', category_id: 'expense_categories' },
    opcionais: { match_id: 'matches', paid_by_player_id: 'players', created_by: 'users' },
  },
};

export interface ResultadoDeReferencias {
  aceitas: Linha[];
  descartadas: { id: string; campo: string; valor: string }[];
  ajustadas: { id: string; campo: string; valor: string }[];
}

export function classificarReferenciasDescartadas(
  descartadas: ResultadoDeReferencias['descartadas'],
  timesConhecidos: Set<string> | undefined,
) {
  const deTimesAusentes = descartadas.filter(
    (item) =>
      item.campo === 'team_id' &&
      Boolean(timesConhecidos) &&
      !timesConhecidos!.has(item.valor),
  );
  const idsDeTimesAusentes = new Set(deTimesAusentes.map((item) => item.id));

  return {
    deTimesAusentes,
    inesperadas: descartadas.filter((item) => !idsDeTimesAusentes.has(item.id)),
  };
}

/**
 * Tabelas de que esta depende e que estão vazias — ou seja, ainda não
 * importadas.
 *
 * `resolverReferencias` trata conjunto vazio como "esse alvo não existe" e
 * descarta a linha. Se `players` ainda não foi importado, pedir
 * `--only=player_ratings` descartaria as milhares de notas em silêncio, e a
 * importação terminaria dizendo que deu certo com o banco vazio.
 *
 * Conjunto **ausente** é diferente de vazio: ausente significa "não sei quais
 * existem", e aí não dá para verificar nada. Só o vazio acusa.
 */
export function dependenciasVazias(
  tabela: NomeDaTabela,
  idsConhecidos: Partial<Record<NomeDaTabela, Set<string>>>,
): NomeDaTabela[] {
  const obrigatorias = REGRAS_DE_REFERENCIA[tabela]?.obrigatorias ?? {};
  const faltando = new Set<NomeDaTabela>();

  for (const alvo of Object.values(obrigatorias)) {
    // Auto-referência não conta: a própria tabela está sendo preenchida agora.
    if (alvo === tabela) {
      continue;
    }

    const conhecidos = idsConhecidos[alvo];

    if (conhecidos && conhecidos.size === 0) {
      faltando.add(alvo);
    }
  }

  return [...faltando];
}

export function resolverReferencias(
  tabela: NomeDaTabela,
  linhas: Linha[],
  idsConhecidos: Partial<Record<NomeDaTabela, Set<string>>>,
): ResultadoDeReferencias {
  const regra = REGRAS_DE_REFERENCIA[tabela];
  const resultado: ResultadoDeReferencias = { aceitas: [], descartadas: [], ajustadas: [] };

  if (!regra) {
    resultado.aceitas = linhas;
    return resultado;
  }

  for (const linha of linhas) {
    let descartar: { campo: string; valor: string } | null = null;

    for (const [campo, alvo] of Object.entries(regra.obrigatorias ?? {})) {
      const valor = textoOuNulo(linha[campo]);
      const conhecidos = idsConhecidos[alvo];

      if (!valor || (conhecidos && !conhecidos.has(valor))) {
        descartar = { campo, valor: valor ?? '(vazio)' };
        break;
      }
    }

    if (descartar) {
      resultado.descartadas.push({ id: linha.id, ...descartar });
      continue;
    }

    const ajustada: Linha = { ...linha };

    for (const [campo, alvo] of Object.entries(regra.opcionais ?? {})) {
      const valor = textoOuNulo(ajustada[campo]);
      const conhecidos = idsConhecidos[alvo];

      if (valor && conhecidos && !conhecidos.has(valor)) {
        ajustada[campo] = null;
        resultado.ajustadas.push({ id: linha.id, campo, valor });
      }
    }

    resultado.aceitas.push(ajustada);
  }

  return resultado;
}

// ── Registro por tabela ────────────────────────────────────────────────────

export interface DefinicaoDeTabela {
  tabela: NomeDaTabela;
  /** Coleção no Firestore. */
  colecao: string;
  mapear: (documento: Documento, contexto: Contexto) => Linha | null;
  /**
   * Tabelas derivadas do mesmo documento, gravadas logo depois do pai.
   *
   * Deriva do documento que já está na mão: normalizar não custa leitura a
   * mais no Firestore, que é o recurso racionado.
   */
  filhas?: {
    tabela: NomeDaTabelaFilha;
    /** Coluna que aponta para o pai, usada para descartar órfã. */
    colunaDoPai: string;
    derivar: (documento: Documento, contexto: Contexto) => LinhaFilha[];
  }[];
}

export const DEFINICOES: DefinicaoDeTabela[] = [
  { tabela: 'users', colecao: 'users', mapear: mapearUsuario },
  { tabela: 'teams', colecao: 'teams', mapear: mapearTime },
  { tabela: 'players', colecao: 'players', mapear: mapearJogador },
  { tabela: 'team_members', colecao: 'teamMembers', mapear: mapearVinculo },
  { tabela: 'seasons', colecao: 'seasons', mapear: mapearTemporada },
  {
    tabela: 'matches',
    colecao: 'matches',
    mapear: mapearPartida,
    filhas: [
      {
        tabela: 'match_field_costs',
        colunaDoPai: 'match_id',
        derivar: derivarCustoDoCampo,
      },
      {
        tabela: 'match_field_participants',
        colunaDoPai: 'match_id',
        derivar: derivarParticipantesDoCampo,
      },
    ],
  },
  { tabela: 'lineups', colecao: 'lineups', mapear: mapearEscalacao },
  { tabela: 'attendance', colecao: 'attendance', mapear: mapearPresenca },
  { tabela: 'match_stats', colecao: 'matchStats', mapear: mapearEstatistica },
  { tabela: 'mvp_votes', colecao: 'mvpVotes', mapear: mapearVoto },
  { tabela: 'player_ratings', colecao: 'playerRatings', mapear: mapearNota },
  { tabela: 'match_diary_entries', colecao: 'matchDiaryEntries', mapear: mapearResenha },
  { tabela: 'notifications', colecao: 'notifications', mapear: mapearAviso },
  { tabela: 'expense_categories', colecao: 'expenseCategories', mapear: mapearCategoria },
  {
    tabela: 'expenses',
    colecao: 'expenses',
    mapear: mapearDespesa,
    filhas: [
      {
        tabela: 'expense_shares',
        colunaDoPai: 'expense_id',
        derivar: derivarCotasDaDespesa,
      },
    ],
  },
  { tabela: 'rating_criteria', colecao: 'ratingCriteria', mapear: mapearCriterio },
];
