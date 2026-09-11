import { supabasePublic } from '@/config/supabase/client';
import {
  resolveSignedStorageUrl,
  signStorageReferences,
} from '@/lib/storage-reference';
import { criarErroDoRepositorio, traduzirErroDoPostgres } from '@/services/repository/supabase/erros';
import type {
  Position,
  PublicTeamProfile,
  PublicTeamRosterPlayer,
  PublicTeamStats,
  PublicTeamSummary,
} from '@/types/domain';

type Linha = Record<string, unknown>;

function clientePublico() {
  if (!supabasePublic) {
    throw criarErroDoRepositorio(
      'A galeria pública está temporariamente indisponível.',
      'failed-precondition',
    );
  }

  return supabasePublic;
}

function textoOuNulo(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function estatisticas(value: unknown): PublicTeamStats {
  const stats = value && typeof value === 'object' ? (value as Linha) : {};

  return {
    games: Number(stats.games ?? 0),
    wins: Number(stats.wins ?? 0),
    draws: Number(stats.draws ?? 0),
    losses: Number(stats.losses ?? 0),
    goalsFor: Number(stats.goalsFor ?? 0),
    goalsAgainst: Number(stats.goalsAgainst ?? 0),
    pointsRate: Number(stats.pointsRate ?? 0),
  };
}

function paraResumo(linha: Linha): PublicTeamSummary {
  return {
    id: String(linha.id ?? ''),
    slug: String(linha.slug ?? ''),
    name: String(linha.name ?? ''),
    logoUrl: textoOuNulo(linha.logo_url),
    bannerUrl: textoOuNulo(linha.banner_url),
    primaryColor: String(linha.primary_color ?? '#000000'),
    secondaryColor: String(linha.secondary_color ?? '#FFFFFF'),
    accentColor: textoOuNulo(linha.accent_color),
    city: String(linha.city ?? ''),
    state: String(linha.state ?? ''),
    neighborhood: textoOuNulo(linha.neighborhood),
    homeFieldName: textoOuNulo(linha.home_field_name),
    publicDescription: textoOuNulo(linha.public_description),
    allowFriendlyContact: linha.allow_friendly_contact === true,
    contactName: textoOuNulo(linha.contact_name),
    contactPhone: textoOuNulo(linha.contact_phone),
    contactWhatsapp: textoOuNulo(linha.contact_whatsapp),
    stats: estatisticas(linha.stats),
  };
}

export async function listarTimesPublicos(): Promise<PublicTeamSummary[]> {
  const { data, error } = await clientePublico()
    .from('public_team_summaries')
    .select('*')
    .order('state')
    .order('city')
    .order('name');

  if (error) {
    throw traduzirErroDoPostgres(error, 'Não foi possível carregar a galeria de times agora.');
  }

  return ((data ?? []) as Linha[]).map(paraResumo);
}

export async function buscarPerfilPublico(teamId: string): Promise<PublicTeamProfile | null> {
  const client = clientePublico();
  const [teamResult, rosterResult] = await Promise.all([
    client.from('public_team_summaries').select('*').eq('id', teamId).maybeSingle(),
    client.from('public_team_roster').select('*').eq('team_id', teamId).order('jersey_number'),
  ]);

  if (teamResult.error) {
    throw traduzirErroDoPostgres(
      teamResult.error,
      'Não foi possível carregar o perfil público do time agora.',
    );
  }

  if (!teamResult.data) {
    return null;
  }

  if (rosterResult.error) {
    throw traduzirErroDoPostgres(
      rosterResult.error,
      'Não foi possível carregar o elenco público agora.',
    );
  }

  const linhas = (rosterResult.data ?? []) as Linha[];
  const signedUrls = await signStorageReferences(
    client,
    linhas.flatMap((linha) => [
      textoOuNulo(linha.photo_url),
      textoOuNulo(linha.presentation_video_url),
    ]),
  );
  const roster = linhas.map<PublicTeamRosterPlayer>((linha) => ({
    id: String(linha.id ?? ''),
    fullName: String(linha.full_name ?? ''),
    nickname: String(linha.nickname ?? ''),
    photoUrl: resolveSignedStorageUrl(textoOuNulo(linha.photo_url), signedUrls),
    primaryPosition: String(linha.primary_position ?? 'midfielder') as Position,
    jerseyNumber: Number(linha.jersey_number ?? 0),
    presentationVideoUrl: resolveSignedStorageUrl(
      textoOuNulo(linha.presentation_video_url),
      signedUrls,
    ),
  }));
  const resumo = paraResumo(teamResult.data as Linha);

  return {
    ...resumo,
    presentationVideoUrl: textoOuNulo(teamResult.data.presentation_video_url),
    publicRosterEnabled: teamResult.data.public_roster_enabled === true,
    roster,
  };
}
