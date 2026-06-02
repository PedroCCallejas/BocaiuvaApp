import { buildPublicTeamStatsFromMatches } from '@/lib/stats';
import type {
  Match,
  Player,
  PublicTeamProfile,
  PublicTeamRosterPlayer,
  PublicTeamSummary,
  Team,
} from '@/types/domain';

const BRAZIL_COUNTRY_CODE = '55';

type TeamPublicFieldSet = Pick<
  Team,
  | 'isPublic'
  | 'city'
  | 'state'
  | 'neighborhood'
  | 'homeFieldName'
  | 'contactName'
  | 'contactPhone'
  | 'contactWhatsapp'
  | 'publicDescription'
  | 'allowFriendlyContact'
  | 'publicRosterEnabled'
>;

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeState(value?: string | null) {
  const trimmed = value?.trim().toUpperCase() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePublicPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, '') ?? '';

  if (!digits) {
    return null;
  }

  if (digits.startsWith(BRAZIL_COUNTRY_CODE) && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `${BRAZIL_COUNTRY_CODE}${digits}`;
  }

  return digits;
}

export function formatPublicPhone(value?: string | null) {
  const digits = normalizePublicPhone(value);

  if (!digits) {
    return '';
  }

  if (digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    const national = digits.slice(2);
    const areaCode = national.slice(0, 2);
    const local = national.slice(2);

    if (local.length === 8) {
      return `+55 (${areaCode}) ${local.slice(0, 4)}-${local.slice(4)}`;
    }

    if (local.length === 9) {
      return `+55 (${areaCode}) ${local.slice(0, 5)}-${local.slice(5)}`;
    }
  }

  return digits;
}

export function buildPublicTeamFriendlyMessage(teamName: string) {
  return `Olá! Vi o time ${teamName} no Professô FC e queria marcar um amistoso.`;
}

export function buildWhatsappUrl(phone: string, teamName: string) {
  const normalizedPhone = normalizePublicPhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const message = encodeURIComponent(buildPublicTeamFriendlyMessage(teamName));
  return `https://wa.me/${normalizedPhone}?text=${message}`;
}

export function buildTelephoneUrl(phone: string) {
  const normalizedPhone = normalizePublicPhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  return `tel:+${normalizedPhone}`;
}

export function resolveFriendlyContactNumber(
  team: Pick<Team, 'contactWhatsapp' | 'contactPhone'>,
) {
  return normalizePublicPhone(team.contactWhatsapp) ?? normalizePublicPhone(team.contactPhone);
}

export function normalizeTeamPublicProfileFields(input: TeamPublicFieldSet) {
  return {
    isPublic: input.isPublic === true,
    city: normalizeOptionalText(input.city),
    state: normalizeState(input.state),
    neighborhood: normalizeOptionalText(input.neighborhood),
    homeFieldName: normalizeOptionalText(input.homeFieldName),
    contactName: normalizeOptionalText(input.contactName),
    contactPhone: normalizePublicPhone(input.contactPhone),
    contactWhatsapp: normalizePublicPhone(input.contactWhatsapp),
    publicDescription: normalizeOptionalText(input.publicDescription),
    allowFriendlyContact: input.allowFriendlyContact === true,
    publicRosterEnabled: input.publicRosterEnabled === true,
  };
}

export function validateTeamPublicProfileFields(
  input: ReturnType<typeof normalizeTeamPublicProfileFields>,
) {
  if (input.isPublic && (!input.city || !input.state)) {
    throw new Error('Para aparecer na galeria, informe cidade e estado.');
  }

  if (input.allowFriendlyContact && !input.contactPhone && !input.contactWhatsapp) {
    throw new Error('Informe um telefone ou WhatsApp para liberar contato de amistoso.');
  }
}

function canExposePublicTeam(team: Team) {
  return team.isPublic === true && Boolean(normalizeOptionalText(team.city)) && Boolean(normalizeState(team.state));
}

function buildContactBlock(team: Team) {
  if (team.allowFriendlyContact !== true) {
    return {
      allowFriendlyContact: false,
      contactName: null,
      contactPhone: null,
      contactWhatsapp: null,
    };
  }

  return {
    allowFriendlyContact: true,
    contactName: team.contactName ?? null,
    contactPhone: team.contactPhone ?? null,
    contactWhatsapp: team.contactWhatsapp ?? null,
  };
}

function buildRoster(players: Player[]) {
  return players
    .filter((player) => player.status !== 'inactive' && !player.deletedAt)
    .sort((left, right) => left.jerseyNumber - right.jerseyNumber)
    .map<PublicTeamRosterPlayer>((player) => ({
      id: player.id,
      fullName: player.fullName,
      nickname: player.nickname,
      photoUrl: player.photoUrl ?? null,
      primaryPosition: player.primaryPosition,
      jerseyNumber: player.jerseyNumber,
    }));
}

export function buildPublicTeamSummary(team: Team, matches: Match[]): PublicTeamSummary | null {
  if (!canExposePublicTeam(team)) {
    return null;
  }

  const contact = buildContactBlock(team);

  return {
    id: team.id,
    slug: team.slug,
    name: team.name,
    logoUrl: team.logoUrl ?? null,
    bannerUrl: team.bannerUrl ?? null,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    accentColor: team.accentColor ?? null,
    city: team.city!.trim(),
    state: team.state!.trim().toUpperCase(),
    neighborhood: team.neighborhood ?? null,
    homeFieldName: team.homeFieldName ?? null,
    publicDescription: team.publicDescription ?? null,
    ...contact,
    stats: buildPublicTeamStatsFromMatches(matches),
  };
}

export function buildPublicTeamProfile(
  team: Team,
  matches: Match[],
  players: Player[],
): PublicTeamProfile | null {
  const summary = buildPublicTeamSummary(team, matches);

  if (!summary) {
    return null;
  }

  return {
    ...summary,
    presentationVideoUrl: team.presentationVideoUrl ?? null,
    publicRosterEnabled: team.publicRosterEnabled === true,
    roster: team.publicRosterEnabled === true ? buildRoster(players) : [],
  };
}

export function buildPublicLocationLabel(
  location: Pick<PublicTeamSummary, 'city' | 'state'>,
) {
  return `${location.city}/${location.state}`;
}

export function buildPublicAreaLabel(
  team: Pick<PublicTeamSummary, 'neighborhood' | 'homeFieldName'>,
) {
  return [team.neighborhood, team.homeFieldName].filter(Boolean).join(' - ');
}
