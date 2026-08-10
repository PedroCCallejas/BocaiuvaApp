import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Pill } from '@/components/ui/Pill';
import { canEditOwnPlayerProfile } from '@/lib/player-profile-access';
import { fonts } from '@/constants/theme';
import { APP_NAME } from '@/constants/branding';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManagePlayers,
  selectCanManageTeam,
  selectCurrentMembership,
  selectCurrentTeam,
  selectCurrentUser,
} from '@/store/selectors';
import type { Match, Player, TeamMember, User } from '@/types/domain';

interface HeaderBreadcrumb {
  label: string;
  href?: string;
}

interface HeaderAction {
  label: string;
  href: string;
}

interface WebRouteMeta {
  title: string;
  subtitle?: string;
  breadcrumbs: HeaderBreadcrumb[];
  backHref?: string;
  action?: HeaderAction;
}

function splitPath(pathname: string) {
  return pathname.split('/').filter(Boolean);
}

function buildHomeCrumb() {
  return { label: 'Início', href: '/home' } satisfies HeaderBreadcrumb;
}

export function WebScreenHeader() {
  const pathname = usePathname();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const currentTeam = useAppStore(selectCurrentTeam);
  const currentUser = useAppStore(selectCurrentUser);
  const currentMembership = useAppStore(selectCurrentMembership);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const canManagePlayers = useAppStore(selectCanManagePlayers);

  const meta = resolveWebRouteMeta({
    pathname,
    currentTeamName: currentTeam?.name ?? null,
    canManageTeam,
    canManagePlayers,
    currentUser,
    currentMembership,
    players: snapshot.players,
    matches: snapshot.matches,
  });

  if (!meta) {
    return null;
  }

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: theme.colors.backgroundElevated,
          borderBottomColor: theme.colors.border,
        },
      ]}>
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={styles.breadcrumbRow}>
            {meta.backHref ? (
              <Pressable
                onPress={() => router.push(meta.backHref! as never)}
                style={[
                  styles.backChip,
                  {
                    backgroundColor: theme.colors.backgroundElevated,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Ionicons
                  name="arrow-back"
                  size={14}
                  color={theme.colors.text}
                />
                <Text style={[styles.backText, { color: theme.colors.text }]}>Voltar</Text>
              </Pressable>
            ) : null}

            <View style={styles.breadcrumbWrap}>
              {meta.breadcrumbs.map((item, index) => (
                <View key={`${item.label}-${index}`} style={styles.breadcrumbItem}>
                  {index > 0 ? (
                    <Text style={[styles.breadcrumbDivider, { color: theme.colors.textMuted }]}>
                      /
                    </Text>
                  ) : null}
                  {item.href && index < meta.breadcrumbs.length - 1 ? (
                    <Pressable onPress={() => router.push(item.href! as never)}>
                      <Text
                        style={[
                          styles.breadcrumbText,
                          { color: theme.colors.textMuted },
                        ]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      style={[
                        styles.breadcrumbText,
                        {
                          color:
                            index === meta.breadcrumbs.length - 1
                              ? theme.colors.text
                              : theme.colors.textMuted,
                        },
                      ]}>
                      {item.label}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          {currentTeam ? (
            <Pill
              label={currentTeam.name}
              backgroundColor={theme.colors.backgroundElevated}
              borderColor={theme.colors.border}
              textColor={theme.colors.text}
            />
          ) : null}
        </View>

        <View style={styles.mainRow}>
          <View style={styles.copy}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{meta.title}</Text>
            {meta.subtitle ? (
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                {meta.subtitle}
              </Text>
            ) : null}
          </View>

          {meta.action ? (
            <AppButton
              label={meta.action.label}
              variant="primary"
              onPress={() => router.push(meta.action!.href as never)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function resolveWebRouteMeta(input: {
  pathname: string;
  currentTeamName: string | null;
  canManageTeam: boolean;
  canManagePlayers: boolean;
  currentUser: Pick<User, 'id' | 'email'> | null;
  currentMembership: Pick<TeamMember, 'teamId' | 'playerId' | 'roles' | 'status'> | null;
  players: Array<
    Pick<
      Player,
      'id' | 'nickname' | 'teamId' | 'linkedUserId' | 'linkedEmail' | 'status' | 'deletedAt'
    >
  >;
  matches: Array<Pick<Match, 'id' | 'opponentName' | 'status'>>;
}): WebRouteMeta | null {
  const segments = splitPath(input.pathname);

  if (
    segments.length === 0 ||
    segments[0] === 'login' ||
    segments[0] === 'register' ||
    segments[0] === 'forgot-password'
  ) {
    return null;
  }

  const homeCrumb = buildHomeCrumb();
  const playerId = segments[1];
  const matchId = segments[1];
  const player =
    playerId != null
      ? input.players.find((item) => item.id === playerId) ?? null
      : null;
  const match =
    matchId != null
      ? input.matches.find((item) => item.id === matchId) ?? null
      : null;
  const canEditViewedPlayer =
    Boolean(player) &&
    (input.canManagePlayers ||
      canEditOwnPlayerProfile({
        teamId: player!.teamId,
        user: input.currentUser,
        membership: input.currentMembership,
        player,
        teamPlayers: input.players,
      }));
  const canEditViewedMatch =
    Boolean(match) &&
    input.canManageTeam &&
    match?.status !== 'finished' &&
    match?.status !== 'canceled';

  switch (segments[0]) {
    case 'home':
      return {
        title: 'Painel do time',
        subtitle: input.currentTeamName
          ? `Visão geral do ${input.currentTeamName}`
          : 'Resumo do elenco',
        breadcrumbs: [homeCrumb],
        action: input.canManageTeam
          ? { label: 'Configurar time', href: '/team-settings' }
          : undefined,
      };
    case 'players':
      if (segments.length === 1) {
        return {
          title: 'Elenco',
          subtitle: 'Perfis, status e destaques do time',
          breadcrumbs: [homeCrumb, { label: 'Jogadores' }],
          backHref: '/home',
          action: input.canManagePlayers
            ? { label: 'Novo jogador', href: '/players/create' }
            : undefined,
        };
      }

      if (segments[1] === 'create') {
        return {
          title: 'Novo jogador',
          subtitle: 'Cadastre um novo atleta no elenco',
          breadcrumbs: [homeCrumb, { label: 'Jogadores', href: '/players' }, { label: 'Novo jogador' }],
          backHref: '/players',
        };
      }

      if (segments[2] === 'edit') {
        return {
          title:
            canEditViewedPlayer &&
            !input.canManagePlayers &&
            input.currentUser != null &&
            player != null &&
            canEditOwnPlayerProfile({
              teamId: player.teamId,
              user: input.currentUser,
              membership: input.currentMembership,
              player,
              teamPlayers: input.players,
            })
            ? 'Editar meu perfil'
            : 'Editar jogador',
          subtitle: player ? `Ajustes do perfil de ${player.nickname}` : 'Ajustes do atleta',
          breadcrumbs: [
            homeCrumb,
            { label: 'Jogadores', href: '/players' },
            { label: player?.nickname ?? 'Jogador', href: player ? `/players/${player.id}` : '/players' },
            { label: 'Editar' },
          ],
          backHref: player ? `/players/${player.id}` : '/players',
        };
      }

      return {
        title: player ? `Perfil de ${player.nickname}` : 'Perfil do jogador',
        subtitle: 'Perfil do atleta, momento atual e desempenho no time',
        breadcrumbs: [
          homeCrumb,
          { label: 'Jogadores', href: '/players' },
          { label: player?.nickname ?? 'Jogador' },
        ],
        backHref: '/players',
        action:
          player && canEditViewedPlayer
            ? { label: 'Editar', href: `/players/${player.id}/edit` }
            : undefined,
      };
    case 'matches':
      if (segments.length === 1) {
        return {
          title: 'Partidas',
          subtitle: 'Agenda, andamento e histórico do time',
          breadcrumbs: [homeCrumb, { label: 'Partidas' }],
          backHref: '/home',
          action: input.canManageTeam
            ? { label: 'Nova partida', href: '/matches/create' }
            : undefined,
        };
      }

      if (segments[1] === 'create') {
        return {
          title: 'Nova partida',
          subtitle: 'Agende o próximo compromisso do time',
          breadcrumbs: [homeCrumb, { label: 'Partidas', href: '/matches' }, { label: 'Nova partida' }],
          backHref: '/matches',
        };
      }

      if (segments[1] === 'register-legacy') {
        return {
          title: 'Registrar jogo antigo',
          subtitle: 'Inclua resultados anteriores no histórico do time',
          breadcrumbs: [homeCrumb, { label: 'Partidas', href: '/matches' }, { label: 'Jogo antigo' }],
          backHref: '/matches',
        };
      }

      if (segments[1] === 'import') {
        return {
          title: 'Importar jogos',
          subtitle: 'Traga resultados antigos para o histórico do elenco',
          breadcrumbs: [homeCrumb, { label: 'Partidas', href: '/matches' }, { label: 'Importar' }],
          backHref: '/matches',
        };
      }

      if (segments[2] === 'edit') {
        return {
          title: 'Editar partida',
          subtitle: match ? `Ajustes de ${match.opponentName}` : 'Ajustes da partida',
          breadcrumbs: [
            homeCrumb,
            { label: 'Partidas', href: '/matches' },
            { label: match?.opponentName ?? 'Partida', href: match ? `/matches/${match.id}` : '/matches' },
            { label: 'Editar' },
          ],
          backHref: match ? `/matches/${match.id}` : '/matches',
        };
      }

      if (segments[2] === 'finish') {
        return {
          title: 'Pós-jogo',
          subtitle: 'Placares, gols e assistências da partida',
          breadcrumbs: [
            homeCrumb,
            { label: 'Partidas', href: '/matches' },
            { label: match?.opponentName ?? 'Partida', href: match ? `/matches/${match.id}` : '/matches' },
            { label: 'Pós-jogo' },
          ],
          backHref: match ? `/matches/${match.id}` : '/matches',
        };
      }

      if (segments[2] === 'mvp') {
        return {
          title: 'MVP da partida',
          subtitle: 'Votação e placar do destaque do jogo',
          breadcrumbs: [
            homeCrumb,
            { label: 'Partidas', href: '/matches' },
            { label: match?.opponentName ?? 'Partida', href: match ? `/matches/${match.id}` : '/matches' },
            { label: 'MVP' },
          ],
          backHref: match ? `/matches/${match.id}` : '/matches',
        };
      }

      if (segments[2] === 'ratings') {
        return {
          title: 'Notas da partida',
          subtitle: 'Resumo das avaliações anônimas do elenco',
          breadcrumbs: [
            homeCrumb,
            { label: 'Partidas', href: '/matches' },
            { label: match?.opponentName ?? 'Partida', href: match ? `/matches/${match.id}` : '/matches' },
            { label: 'Notas' },
          ],
          backHref: match ? `/matches/${match.id}` : '/matches',
        };
      }

      if (segments[2] === 'diary-entry') {
        return {
          title: 'Diário da partida',
          subtitle: 'Publique ou ajuste a resenha pós-jogo',
          breadcrumbs: [
            homeCrumb,
            { label: 'Partidas', href: '/matches' },
            { label: match?.opponentName ?? 'Partida', href: match ? `/matches/${match.id}` : '/matches' },
            { label: 'Diário' },
          ],
          backHref: match ? `/matches/${match.id}` : '/matches',
        };
      }

      return {
        title: match ? match.opponentName : 'Detalhe da partida',
        subtitle: 'Presença, resenha, escalação e resumo do jogo',
        breadcrumbs: [
          homeCrumb,
          { label: 'Partidas', href: '/matches' },
          { label: match?.opponentName ?? 'Partida' },
        ],
        backHref: '/matches',
        action:
          match && canEditViewedMatch
            ? { label: 'Editar', href: `/matches/${match.id}/edit` }
            : undefined,
      };
    case 'lineup':
      return {
        title: 'Escalação visual',
        subtitle: 'Monte e publique a formação do time',
        breadcrumbs: [
          homeCrumb,
          { label: 'Partidas', href: '/matches' },
          { label: 'Escalação' },
        ],
        backHref: matchId ? `/matches/${matchId}` : '/matches',
      };
    case 'stats':
      return {
        title: 'Estatísticas',
        subtitle: 'Números do time, tendências e destaques do elenco',
        breadcrumbs: [homeCrumb, { label: 'Estatísticas' }],
        backHref: '/home',
        action: { label: 'Ver rankings', href: '/rankings' },
      };
    case 'rankings':
      return {
        title: 'Rankings',
        subtitle: 'Compare o elenco por gols, notas e presença',
        breadcrumbs: [homeCrumb, { label: 'Rankings' }],
        backHref: '/home',
        action: { label: 'Ver estatísticas', href: '/stats' },
      };
    case 'profile':
      return {
        title: 'Minha conta',
        subtitle: 'Dados da conta, atleta conectado e time atual',
        breadcrumbs: [homeCrumb, { label: 'Conta' }],
        backHref: '/home',
      };
    case 'notifications':
      return {
        title: 'Notificações',
        subtitle: 'Avisos importantes do time e da partida',
        breadcrumbs: [homeCrumb, { label: 'Notificações' }],
        backHref: '/home',
      };
    case 'team-settings':
      return {
        title: 'Configurações do time',
        subtitle: 'Identidade visual, informações e ajustes do elenco',
        breadcrumbs: [homeCrumb, { label: 'Configurações do time' }],
        backHref: '/home',
        action: input.canManageTeam ? { label: 'Convites', href: '/team-invite' } : undefined,
      };
    case 'teams-gallery':
      return {
        title: 'Galeria de times',
        subtitle: 'Encontre adversários próximos e perfis públicos disponíveis para amistoso',
        breadcrumbs: [homeCrumb, { label: 'Galeria de times' }],
        backHref: input.currentTeamName ? '/home' : '/team-access',
      };
    case 'teams':
      return {
        title: 'Perfil público do time',
        subtitle: 'Escudo, localização, números agregados e contato liberado pelo próprio time',
        breadcrumbs: [
          homeCrumb,
          { label: 'Galeria de times', href: '/teams-gallery' },
          { label: 'Perfil público' },
        ],
        backHref: '/teams-gallery',
      };
    case 'team-rating-criteria':
      return {
        title: 'Critérios de avaliação',
        subtitle: 'Defina como o elenco avalia cada partida',
        breadcrumbs: [
          homeCrumb,
          { label: 'Configurações do time', href: '/team-settings' },
          { label: 'Critérios' },
        ],
        backHref: '/team-settings',
      };
    case 'team-invite':
      return {
        title: 'Convites do time',
        subtitle: 'Compartilhe o código de entrada do elenco',
        breadcrumbs: [
          homeCrumb,
          { label: 'Configurações do time', href: '/team-settings' },
          { label: 'Convites' },
        ],
        backHref: '/team-settings',
      };
    case 'team-access':
      return {
        title: 'Meus times',
        subtitle: 'Escolha o elenco que você quer abrir agora',
        breadcrumbs: [{ label: 'Meus times' }],
      };
    case 'team-setup':
      return {
        title: 'Criar novo time',
        subtitle: 'Monte a identidade do seu elenco',
        breadcrumbs: [
          { label: 'Meus times', href: '/team-access' },
          { label: 'Criar time' },
        ],
        backHref: '/team-access',
      };
    default:
      return {
        title: APP_NAME,
        breadcrumbs: [homeCrumb],
        backHref: '/home',
      };
  }
}

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inner: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 14,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1,
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  breadcrumbWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumbDivider: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  breadcrumbText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});
