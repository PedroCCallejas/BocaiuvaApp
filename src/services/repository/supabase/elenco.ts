/**
 * Elenco, vínculos e contexto da sessão no Postgres.
 *
 * O módulo que apaga mais código do que escreve.
 *
 * No Firestore, "quem é essa pessoa neste time" exigia um índice espelhado
 * (`teamMembershipIndex`) porque a regra não conseguia consultar coleção. Em
 * volta dele nasceram `ensureMembershipPlayerLink`,
 * `repairCurrentUserMembershipsByLinkedPlayers`, `reconcileDuplicateMemberships`
 * e `clearLinkedUserMembershipPlayer` — quatro rotinas de reparo para manter o
 * espelho de pé, e a origem dos bugs de permissão que custaram dias.
 *
 * Aqui nada disso existe. A resposta é `app.current_player_id(team_id)`, uma
 * função de quinze linhas que o banco já conhece.
 */

import { supabase } from '@/config/supabase/client';
import { paraJogador, paraVinculo } from '@/lib/migracao/mapear-dominio';
import { authService } from '@/services/auth';
import {
  criarErroDoRepositorio,
  traduzirErroDoPostgres,
} from '@/services/repository/supabase/erros';
import type { Player, Team, TeamMember, User } from '@/types/domain';

function cliente() {
  if (!supabase) {
    throw criarErroDoRepositorio(
      'A conexão com o banco não está configurada.',
      'failed-precondition',
    );
  }

  return supabase;
}

function agora() {
  return new Date().toISOString();
}

export function novoId() {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';

  for (let i = 0; i < 20; i += 1) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }

  return id;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

// ── Contexto da sessão ─────────────────────────────────────────────────────

export interface ContextoDaSessao {
  user: User | null;
  teams: Team[];
  teamMembers: TeamMember[];
}

export const CONTEXTO_VAZIO: ContextoDaSessao = { user: null, teams: [], teamMembers: [] };

function paraUsuario(linha: Record<string, unknown>): User {
  const instante = agora();

  return {
    id: String(linha.id ?? ''),
    email: String(linha.email ?? ''),
    displayName: String(linha.display_name ?? ''),
    appRole: (linha.app_role as User['appRole']) ?? 'player',
    canCreateTeam: true,
    activeTeamId: textoOuNulo(linha.active_team_id),
    avatarUrl: textoOuNulo(linha.avatar_url),
    notificationTokens: Array.isArray(linha.notification_tokens)
      ? (linha.notification_tokens as string[])
      : [],
    createdAt: String(linha.created_at ?? instante),
    updatedAt: String(linha.updated_at ?? instante),
  };
}

function paraTime(linha: Record<string, unknown>): Team {
  const instante = agora();

  return {
    id: String(linha.id ?? ''),
    name: String(linha.name ?? ''),
    slug: String(linha.slug ?? ''),
    logoUrl: textoOuNulo(linha.logo_url),
    bannerUrl: textoOuNulo(linha.banner_url),
    presentationVideoUrl: textoOuNulo(linha.presentation_video_url),
    isPublic: linha.is_public === true,
    city: textoOuNulo(linha.city),
    state: textoOuNulo(linha.state),
    neighborhood: textoOuNulo(linha.neighborhood),
    homeFieldName: textoOuNulo(linha.home_field_name),
    contactName: textoOuNulo(linha.contact_name),
    contactPhone: textoOuNulo(linha.contact_phone),
    contactWhatsapp: textoOuNulo(linha.contact_whatsapp),
    publicDescription: textoOuNulo(linha.public_description),
    allowFriendlyContact: linha.allow_friendly_contact === true,
    publicRosterEnabled: linha.public_roster_enabled === true,
    primaryColor: String(linha.primary_color ?? '#000000'),
    secondaryColor: String(linha.secondary_color ?? '#FFFFFF'),
    accentColor: textoOuNulo(linha.accent_color),
    description: textoOuNulo(linha.description),
    inviteCode: String(linha.invite_code ?? ''),
    inviteCodeUpdatedAt: String(linha.invite_code_updated_at ?? instante),
    coachName: String(linha.coach_name ?? ''),
    adminUserId: String(linha.admin_user_id ?? ''),
    activeSeasonId: textoOuNulo(linha.active_season_id),
    defaultMatchCostCents:
      linha.default_match_cost_cents == null ? null : Number(linha.default_match_cost_cents),
    createdAt: String(linha.created_at ?? instante),
    updatedAt: String(linha.updated_at ?? instante),
  };
}

/**
 * Cria a linha da conta em `public.users` na primeira vez.
 *
 * No Firestore isto era `ensureCurrentUserDocumentAfterLogin`, chamada nos três
 * caminhos de entrada. Aqui não existia ninguém equivalente — e o efeito era
 * grave: quem se cadastrasse depois da importação ficava sem linha, e sem linha
 * o contexto volta vazio. A própria RPC de entrar no time já avisava
 * ("Crie o perfil da conta antes de entrar no time"), mas nada criava.
 *
 * Fica aqui, e não em `login`/`register`/`loginWithGoogle`, porque quem já está
 * com sessão aberta nunca mais passa por esses três. Todo mundo passa por
 * `buscarContextoDaSessao`.
 *
 * O `id` vem da sessão do Firebase e a policy `users_insert_self` confere
 * contra o uid do token: não dá para criar perfil no nome de outra pessoa.
 */
async function criarPerfilDaSessao(): Promise<Record<string, unknown> | null> {
  const supabaseClient = cliente();
  const sessao = authService.getCurrentUser() ?? (await authService.restoreSession());

  if (!sessao) {
    return null;
  }

  const instante = agora();

  const { data, error } = await supabaseClient
    .from('users')
    .insert({
      id: sessao.authId,
      // Minúsculo por padrão: a resolução de jogador por e-mail compara
      // normalizado, e cadastro com maiúscula já deixou gente sem votar.
      email: sessao.email.trim().toLowerCase(),
      display_name: sessao.displayName,
      // A policy exige exatamente 'player': ninguém nasce admin por conta
      // própria.
      app_role: 'player',
      avatar_url: sessao.avatarUrl ?? null,
      created_at: instante,
      updated_at: instante,
    })
    .select()
    .maybeSingle();

  if (error) {
    // Duas abas abrindo ao mesmo tempo criam a mesma linha. A segunda perde a
    // corrida e só precisa reler.
    if (error.code === '23505') {
      const { data: existente } = await supabaseClient.from('users').select('*').maybeSingle();
      return existente ?? null;
    }

    throw traduzirErroDoPostgres(error, 'Não foi possível criar o perfil da sua conta.');
  }

  return data ?? null;
}

/**
 * Quem é a pessoa, de que times ela participa.
 *
 * Três consultas, sem reparo nenhum. A RLS já devolve só o que a pessoa pode
 * ver: `users` filtra pelo próprio uid, `team_members` pelo vínculo, `teams`
 * pelos times onde ela é membro.
 *
 * No Firestore isto era `ensureMembershipsForUser` com mais de duzentas linhas,
 * porque precisava consertar o espelho enquanto lia.
 */
export async function buscarContextoDaSessao(): Promise<ContextoDaSessao> {
  const supabaseClient = cliente();

  const [usuario, vinculos] = await Promise.all([
    supabaseClient.from('users').select('*').maybeSingle(),
    supabaseClient.from('team_members').select('*'),
  ]);

  if (usuario.error) {
    throw traduzirErroDoPostgres(usuario.error, 'Não foi possível carregar sua conta agora.');
  }

  if (vinculos.error) {
    throw traduzirErroDoPostgres(vinculos.error, 'Não foi possível carregar seus times agora.');
  }

  // Primeira vez desta conta no Postgres: cria o perfil e segue. Sem isso a
  // pessoa entra, ve tela vazia e nem com codigo de convite consegue avancar.
  const linhaDoUsuario = usuario.data ?? (await criarPerfilDaSessao());

  if (!linhaDoUsuario) {
    return CONTEXTO_VAZIO;
  }

  const membros = (vinculos.data ?? []).map(paraVinculo);
  const idsDosTimes = [...new Set(membros.map((membro) => membro.teamId))];

  if (idsDosTimes.length === 0) {
    return { user: paraUsuario(linhaDoUsuario), teams: [], teamMembers: membros };
  }

  const { data: times, error } = await supabaseClient
    .from('teams')
    .select('*')
    .in('id', idsDosTimes);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar seus times agora.');
  }

  return {
    user: paraUsuario(linhaDoUsuario),
    teams: (times ?? []).map(paraTime),
    teamMembers: membros,
  };
}

export async function definirTimeAtivo(teamId: string): Promise<User> {
  const sessao = authService.getCurrentUser() ?? (await authService.restoreSession());

  if (!sessao) {
    throw criarErroDoRepositorio('Sessão expirada.', 'permission-denied');
  }

  // O `.eq('id', ...)` não é redundante com a RLS.
  //
  // A policy `users_update_self` já limita a linha, e por isso este update foi
  // escrito sem filtro. Só que o Supabase carrega a extensão `safeupdate` na
  // conexão do PostgREST, e ela recusa UPDATE sem WHERE — a troca de time
  // falhava com "não foi possível trocar de time agora" e nunca chegava na RLS.
  //
  // Vale como regra: escrita sempre diz em qual linha mexe. A RLS é a segunda
  // tranca, não a primeira.
  const { data, error } = await cliente()
    .from('users')
    .update({ active_team_id: teamId, updated_at: agora() })
    .eq('id', sessao.authId)
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível trocar de time agora.');
  }

  return paraUsuario(data);
}

// ── Elenco ─────────────────────────────────────────────────────────────────

export async function buscarJogadores(teamId: string): Promise<Player[]> {
  const { data, error } = await cliente()
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .order('nickname');

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar o elenco agora.');
  }

  return (data ?? []).map(paraJogador);
}

export async function criarJogador(
  teamId: string,
  input: Record<string, unknown>,
): Promise<Player> {
  const instante = agora();
  const email = textoOuNulo(input.linkedEmail);

  const { data, error } = await cliente()
    .from('players')
    .insert({
      id: novoId(),
      team_id: teamId,
      full_name: input.fullName,
      nickname: input.nickname,
      // Minúsculo na entrada: a resolução por e-mail compara normalizado, e
      // cadastro com maiúscula já deixou gente sem conseguir votar.
      linked_email: email ? email.toLowerCase() : null,
      jersey_number: input.jerseyNumber ?? 0,
      primary_position: input.primaryPosition ?? 'midfielder',
      secondary_positions: input.secondaryPositions ?? [],
      dominant_foot: input.dominantFoot ?? 'right',
      status: 'active',
      created_at: instante,
      updated_at: instante,
    })
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível cadastrar o jogador agora.');
  }

  return paraJogador(data);
}

export async function atualizarJogador(
  playerId: string,
  mudancas: Record<string, unknown>,
): Promise<Player> {
  const { data, error } = await cliente()
    .from('players')
    .update({ ...mudancas, updated_at: agora() })
    .eq('id', playerId)
    .select()
    .single();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível salvar o jogador agora.');
  }

  return paraJogador(data);
}

/** Inativa. O histórico de jogos e estatísticas continua de pé. */
export async function inativarJogador(playerId: string): Promise<Player> {
  return await atualizarJogador(playerId, { status: 'inactive' });
}

export async function reativarJogador(playerId: string): Promise<Player> {
  return await atualizarJogador(playerId, { status: 'active' });
}

/** Desfaz o vínculo com a conta, sem apagar a ficha. */
export async function desvincularConta(playerId: string): Promise<Player> {
  return await atualizarJogador(playerId, { linked_user_id: null, linked_email: null });
}

/**
 * Apaga a ficha de vez.
 *
 * Só para quem nunca jogou. As chaves estrangeiras de `attendance`,
 * `match_stats`, `mvp_votes` e `player_ratings` recusam por conta própria se
 * houver histórico — o banco protege mesmo que a checagem do app falhe.
 */
export async function apagarJogadorDeVez(playerId: string): Promise<void> {
  const { error } = await cliente().from('players').delete().eq('id', playerId);

  if (error) {
    throw traduzirErroDoPostgres(
      error,
      'Não foi possível apagar o cadastro. Jogador com histórico só pode ser inativado.',
    );
  }
}

// ── Vínculo ────────────────────────────────────────────────────────────────

/**
 * Entrar no time com o código de convite.
 *
 * Passa pela RPC porque cria vínculo e resolve o jogador correspondente numa
 * transação. Meia entrada — vínculo sem jogador — é exatamente o estado que
 * causava o `permission-denied` no Firestore.
 */
export async function entrarComCodigo(inviteCode: string): Promise<{
  vinculo: TeamMember;
  jaEraMembro: boolean;
}> {
  const supabaseClient = cliente();

  // Antes de chamar: já sou membro deste time? A RPC devolve o vínculo tanto
  // quando cria quanto quando ele já existia, e a tela precisa distinguir
  // "bem-vindo" de "você já está aqui".
  const { data: antes } = await supabaseClient.from('team_members').select('id');
  const idsAntes = new Set(
    (antes ?? []).map((linha) => String((linha as { id?: unknown }).id ?? '')),
  );

  const { data, error } = await supabaseClient.rpc('join_team_with_invite_code', {
    p_invite_code: inviteCode.trim(),
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível entrar no time agora.');
  }

  if (!data) {
    throw criarErroDoRepositorio('Código de convite inválido.', 'not-found');
  }

  // A função devolve a linha de `team_members`, não um resumo.
  const vinculo = paraVinculo(data as Record<string, unknown>);

  return { vinculo, jaEraMembro: idsAntes.has(vinculo.id) };
}

// ── Time ───────────────────────────────────────────────────────────────────

/**
 * Cria o time com o dono já dentro.
 *
 * Passa por RPC por um motivo específico: `team_members_insert_admin` exige
 * `app.can_manage_team(team_id)`, e quem acabou de criar o time ainda não tem
 * vínculo — não conseguiria criar o próprio vínculo de admin. O time nasceria
 * sem dono.
 *
 * A RPC cria time, ficha do dono e vínculo numa transação só. Os critérios de
 * avaliação padrão ficam de fora de propósito: são criados pelo app logo depois,
 * quando o vínculo já existe e a policy deixa.
 */
export async function criarTime(input: {
  name: string;
  coachName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  presentationVideoUrl?: string | null;
}): Promise<Team> {
  const { data, error } = await cliente().rpc('create_team_with_admin', {
    p_name: input.name,
    p_coach_name: input.coachName,
    p_primary_color: input.primaryColor,
    p_secondary_color: input.secondaryColor,
    p_accent_color: input.accentColor ?? null,
    p_description: input.description ?? null,
    p_logo_url: input.logoUrl ?? null,
    p_banner_url: input.bannerUrl ?? null,
    p_presentation_video_url: input.presentationVideoUrl ?? null,
  });

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível criar o time agora.');
  }

  if (!data) {
    throw criarErroDoRepositorio('Não foi possível criar o time agora.', 'unknown');
  }

  return paraTime(data as Record<string, unknown>);
}

async function atualizarTimeERetornar(
  teamId: string,
  mudancas: Record<string, unknown>,
  mensagemDeErro: string,
): Promise<Team> {
  const { data, error } = await cliente()
    .from('teams')
    .update({ ...mudancas, updated_at: agora() })
    .eq('id', teamId)
    .select()
    .single();

  if (error) {
    // `teams_slug_key` e unico: dois times com o mesmo nome batem aqui. No
    // Firestore nao havia essa restricao, entao a mensagem precisa explicar.
    if (error.code === '23505') {
      throw criarErroDoRepositorio(
        'Já existe um time com esse nome. Escolha outro.',
        'already-exists',
      );
    }

    throw traduzirErroDoPostgres(error, mensagemDeErro);
  }

  return paraTime(data);
}

/** Converte o input do contrato para as colunas do Postgres. */
function mudancasDoTime(input: Record<string, unknown>): Record<string, unknown> {
  const mapa: Record<string, string> = {
    name: 'name',
    slug: 'slug',
    coachName: 'coach_name',
    logoUrl: 'logo_url',
    bannerUrl: 'banner_url',
    presentationVideoUrl: 'presentation_video_url',
    isPublic: 'is_public',
    city: 'city',
    state: 'state',
    neighborhood: 'neighborhood',
    homeFieldName: 'home_field_name',
    contactName: 'contact_name',
    contactPhone: 'contact_phone',
    contactWhatsapp: 'contact_whatsapp',
    publicDescription: 'public_description',
    allowFriendlyContact: 'allow_friendly_contact',
    publicRosterEnabled: 'public_roster_enabled',
    primaryColor: 'primary_color',
    secondaryColor: 'secondary_color',
    accentColor: 'accent_color',
    description: 'description',
  };

  const mudancas: Record<string, unknown> = {};

  for (const [campo, coluna] of Object.entries(mapa)) {
    if (input[campo] !== undefined) {
      mudancas[coluna] = input[campo];
    }
  }

  return mudancas;
}

export async function atualizarTime(
  teamId: string,
  input: Record<string, unknown>,
): Promise<Team> {
  return await atualizarTimeERetornar(
    teamId,
    mudancasDoTime(input),
    'Não foi possível salvar o time agora.',
  );
}

export async function definirCustoPadraoDoTime(
  teamId: string,
  centavos: number | null,
): Promise<Team> {
  return await atualizarTimeERetornar(
    teamId,
    { default_match_cost_cents: centavos },
    'Não foi possível salvar o valor padrão agora.',
  );
}

/**
 * Gera um código de convite novo.
 *
 * Sorteia e tenta gravar, em vez de consultar antes: `teams_invite_code_unico_idx`
 * é quem garante a unicidade, e ler antes de escrever abriria a janela entre a
 * leitura e a gravação. Com 32^6 combinações, a colisão é rara o bastante para
 * a segunda tentativa quase nunca acontecer.
 */
export async function gerarNovoCodigoDeConvite(teamId: string): Promise<Team> {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    let codigo = '';

    for (let i = 0; i < 6; i += 1) {
      codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    }

    const { data, error } = await cliente()
      .from('teams')
      .update({
        invite_code: codigo,
        invite_code_updated_at: agora(),
        updated_at: agora(),
      })
      .eq('id', teamId)
      .select()
      .single();

    if (!error) {
      return paraTime(data);
    }

    if (error.code !== '23505') {
      throw traduzirErroDoPostgres(error, 'Não foi possível gerar um novo código agora.');
    }
  }

  throw criarErroDoRepositorio(
    'Não foi possível gerar um novo código agora. Tente de novo.',
    'unavailable',
  );
}

/**
 * O vínculo da conta autenticada num time.
 *
 * Filtra pelo próprio uid de propósito: a RLS deixa qualquer membro enxergar
 * todos os vínculos do time, então uma busca sem filtro devolveria o primeiro
 * da lista — e o app gravaria voto e avaliação no nome de outra pessoa.
 */
export async function buscarMeuVinculo(teamId: string): Promise<TeamMember | null> {
  const sessao = authService.getCurrentUser() ?? (await authService.restoreSession());

  if (!sessao) {
    throw criarErroDoRepositorio('Sessão expirada.', 'permission-denied');
  }

  const { data, error } = await cliente()
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', sessao.authId)
    .maybeSingle();

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar seu vínculo agora.');
  }

  return data ? paraVinculo(data) : null;
}

export async function buscarVinculosDoTime(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await cliente()
    .from('team_members')
    .select('*')
    .eq('team_id', teamId);

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar os membros agora.');
  }

  return (data ?? []).map(paraVinculo);
}
