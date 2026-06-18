import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AdSlot } from '@/components/ads/AdSlot';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { TeamHeroCard } from '@/components/cards/TeamHeroCard';
import { AppButton } from '@/components/ui/AppButton';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { PresentationVideoCard } from '@/components/video/PresentationVideoCard';
import { AD_PLACEMENTS } from '@/constants/ads';
import { POSITION_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  buildPublicAreaLabel,
  buildPublicLocationLabel,
  buildTelephoneUrl,
  buildWhatsappUrl,
  formatPublicPhone,
} from '@/lib/public-team';
import { openExternalUrl } from '@/lib/external-url';
import { useAppStore } from '@/store/app-store';
import type { PublicTeamProfile } from '@/types/domain';

const defaultPublicVideoAccent = '#DCE5EE';

function normalizeHexColor(color: string | null | undefined) {
  const value = color?.trim();

  if (!value) {
    return null;
  }

  if (/^#[\da-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }

  if (/^#[\da-f]{6}$/i.test(value)) {
    return value.toUpperCase();
  }

  if (/^#[\da-f]{8}$/i.test(value)) {
    return value.slice(0, 7).toUpperCase();
  }

  return null;
}

function withAlpha(color: string | null | undefined, alpha: number, fallback: string) {
  const normalized = normalizeHexColor(color);

  if (!normalized) {
    return fallback;
  }

  const clampedAlpha = Math.max(0, Math.min(alpha, 1));
  const alphaHex = Math.round(clampedAlpha * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

  return `${normalized}${alphaHex}`;
}

function getPerceivedLuminance(color: string | null | undefined) {
  const normalized = normalizeHexColor(color);

  if (!normalized) {
    return -1;
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function pickBrightestColor(colors: Array<string | null | undefined>, fallback: string) {
  let bestColor = normalizeHexColor(fallback) ?? defaultPublicVideoAccent;
  let bestLuminance = getPerceivedLuminance(bestColor);

  colors.forEach((color) => {
    const luminance = getPerceivedLuminance(color);

    if (luminance > bestLuminance) {
      bestColor = normalizeHexColor(color) ?? bestColor;
      bestLuminance = luminance;
    }
  });

  return bestColor;
}

export default function PublicTeamProfileScreen() {
  const params = useLocalSearchParams<{ teamId?: string | string[] }>();
  const theme = useAppTheme();
  const getPublicTeamProfile = useAppStore((state) => state.getPublicTeamProfile);
  const [profile, setProfile] = useState<PublicTeamProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; playerName: string } | null>(
    null,
  );
  const rawTeamId = params.teamId;
  const teamId = typeof rawTeamId === 'string' ? rawTeamId : rawTeamId?.[0] ?? '';
  const publicVideoAccent = profile
    ? pickBrightestColor(
        [profile.secondaryColor, profile.accentColor, profile.primaryColor, theme.colors.secondary],
        theme.colors.secondary,
      )
    : theme.colors.secondary;

  async function loadProfile() {
    if (!teamId) {
      setProfile(null);
      setLoadError('O identificador do time não foi informado.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError(null);
      const nextProfile = await getPublicTeamProfile(teamId);
      setProfile(nextProfile);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Tente novamente em alguns instantes.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, [teamId]);

  async function handleWhatsApp() {
    if (!profile) {
      return;
    }

    try {
      const whatsappUrl = buildWhatsappUrl(
        profile.contactWhatsapp ?? profile.contactPhone ?? '',
        profile.name,
      );

      if (!whatsappUrl) {
        Alert.alert('Contato indisponível', 'Esse time ainda não publicou um WhatsApp.');
        return;
      }

      await openExternalUrl(whatsappUrl);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir o WhatsApp',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function handleCall() {
    if (!profile?.contactPhone) {
      return;
    }

    try {
      const callUrl = buildTelephoneUrl(profile.contactPhone);

      if (!callUrl) {
        Alert.alert('Contato indisponível', 'Esse time ainda não publicou um telefone válido.');
        return;
      }

      await openExternalUrl(callUrl);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a ligação',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <PublicPageShell
      eyebrow="Perfil público"
      title={profile ? profile.name : 'Perfil público do time'}
      description="Este perfil mostra apenas informações públicas liberadas pelo próprio time. Dados internos, rotinas protegidas e informações administrativas continuam fora desta área."
      actions={[
        { label: 'Voltar para a galeria', href: '/teams-gallery', variant: 'secondary' },
        { label: 'Criar conta', href: '/register', variant: 'ghost' },
      ]}>
      {loading ? (
        <EmptyState
          title="Carregando perfil público"
          description="Buscando as informações públicas deste time."
        />
      ) : loadError ? (
        <EmptyState
          title="Não foi possível abrir o perfil público"
          description={`O carregamento falhou agora. ${loadError}`}
          actionLabel="Tentar novamente"
          onAction={() => void loadProfile()}
        />
      ) : !profile ? (
        <EmptyState
          title="Perfil público indisponível"
          description="Esse time não está público ou ainda não liberou informações suficientes para aparecer na galeria."
          actionLabel="Voltar para a galeria"
          onAction={() => router.replace('/teams-gallery' as never)}
        />
      ) : (
        <>
          <View style={styles.infoRow}>
            <InfoCard
              title="Perfil controlado pelo time"
              description="Escudo, descrição pública, localização básica e contato para amistoso aparecem apenas quando o administrador decide publicar."
            />
            <InfoCard
              title="Área privada protegida"
              description="Presença, notas, votos, histórico interno, escalação privada e dados administrativos não são exibidos aqui."
            />
          </View>

          <TeamHeroCard
            team={profile}
            modeLabel="Perfil público"
            locationLabel={buildPublicLocationLabel(profile)}
            description={profile.publicDescription}
            supportingText={buildPublicAreaLabel(profile)}>
            <View style={styles.heroActions}>
              {profile.allowFriendlyContact ? (
                <AppButton label="Chamar no WhatsApp" onPress={() => void handleWhatsApp()} />
              ) : null}
              {profile.allowFriendlyContact && profile.contactPhone ? (
                <AppButton
                  label="Ligar para o contato"
                  variant="secondary"
                  onPress={() => void handleCall()}
                />
              ) : null}
              <AppButton
                label="Voltar para a galeria"
                variant="ghost"
                onPress={() => router.push('/teams-gallery' as never)}
              />
            </View>
          </TeamHeroCard>

          {profile.presentationVideoUrl ? (
            <PresentationVideoCard
              title="Vídeo de apresentação"
              description="Uma amostra do estilo, do clima e da identidade que o time quer mostrar."
              videoUrl={profile.presentationVideoUrl}
              posterUrl={profile.bannerUrl ?? profile.logoUrl ?? null}
              accentColors={[profile.primaryColor, profile.secondaryColor]}
            />
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Estatísticas</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
              Números agregados apenas de partidas encerradas do próprio time.
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <ProfileStat label="Jogos" value={String(profile.stats.games)} />
            <ProfileStat label="Vitórias" value={String(profile.stats.wins)} />
            <ProfileStat label="Empates" value={String(profile.stats.draws)} />
            <ProfileStat label="Derrotas" value={String(profile.stats.losses)} />
            <ProfileStat label="Gols pró" value={String(profile.stats.goalsFor)} />
            <ProfileStat label="Gols sofridos" value={String(profile.stats.goalsAgainst)} />
            <ProfileStat label="Aproveitamento" value={`${profile.stats.pointsRate}%`} />
          </View>

          <AdSlot placement={AD_PLACEMENTS.PUBLIC_TEAM_AFTER_STATS} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Contato para amistoso
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
              Apenas o contato público liberado pelo próprio time aparece aqui.
            </Text>
          </View>

          <View
            style={[
              styles.contactCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <Text style={[styles.contactTitle, { color: theme.colors.text }]}>
              {profile.allowFriendlyContact
                ? profile.contactName ?? 'Contato liberado'
                : 'Contato fechado'}
            </Text>
            <Text style={[styles.contactInfo, { color: theme.colors.textMuted }]}>
              {profile.allowFriendlyContact
                ? formatPublicPhone(profile.contactWhatsapp ?? profile.contactPhone)
                : 'O time ainda não liberou contato público para amistoso.'}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Elenco público</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.colors.textMuted }]}>
              Só foto, nome, posição e número da camisa aparecem quando a vitrine pública é
              habilitada.
            </Text>
          </View>

          {!profile.publicRosterEnabled ? (
            <EmptyState
              title="Elenco público desativado"
              description="Esse time preferiu não mostrar a lista de jogadores na galeria."
            />
          ) : profile.roster.length === 0 ? (
            <EmptyState
              title="Ainda sem elenco público"
              description="O time habilitou a vitrine, mas ainda não há jogadores disponíveis para exibir."
            />
          ) : (
            <View style={styles.rosterGrid}>
              {profile.roster.map((player) => (
                <View
                  key={player.id}
                  style={[
                    styles.playerCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Avatar
                    name={player.nickname || player.fullName}
                    photoUrl={player.photoUrl}
                    size={72}
                    accent={theme.colors.primarySoft}
                  />
                  <View style={styles.playerCopy}>
                    <Text style={[styles.playerName, { color: theme.colors.text }]}>
                      {player.nickname}
                    </Text>
                    <Text style={[styles.playerMeta, { color: theme.colors.textMuted }]}>
                      {player.fullName}
                    </Text>
                    <Text style={[styles.playerMeta, { color: theme.colors.textMuted }]}>
                      #{player.jerseyNumber} · {POSITION_LABELS[player.primaryPosition]}
                    </Text>
                    {player.presentationVideoUrl ? (
                      <PlayerPresentationButton
                        accentColor={publicVideoAccent}
                        playerName={player.nickname || player.fullName}
                        onPress={() =>
                          setSelectedVideo({
                            url: player.presentationVideoUrl!,
                            playerName: player.nickname || player.fullName,
                          })
                        }
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}

          <Modal
            visible={selectedVideo !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedVideo(null)}>
            <Pressable style={styles.modalOverlay} onPress={() => setSelectedVideo(null)}>
              <Pressable style={styles.modalContent} onPress={() => {}}>
                {selectedVideo ? (
                  <>
                    <PresentationVideoCard
                      title={selectedVideo.playerName}
                      description="Vídeo de apresentação do jogador."
                      videoUrl={selectedVideo.url}
                    />
                    <AppButton
                      label="Fechar"
                      variant="secondary"
                      onPress={() => setSelectedVideo(null)}
                    />
                  </>
                ) : null}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </PublicPageShell>
  );
}

function InfoCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.infoCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.infoTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.infoDescription, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function PlayerPresentationButton({
  accentColor,
  playerName,
  onPress,
}: {
  accentColor: string;
  playerName: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver apresentação de ${playerName}`}
      hitSlop={4}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => {
        const isInteractiveHover = hovered && !pressed;
        const buttonBackground = pressed
          ? withAlpha(accentColor, 0.2, 'rgba(255,255,255,0.14)')
          : isInteractiveHover
            ? withAlpha(accentColor, 0.16, 'rgba(255,255,255,0.12)')
            : withAlpha(accentColor, 0.12, 'rgba(255,255,255,0.1)');
        const buttonBorder = pressed
          ? withAlpha(accentColor, 0.58, 'rgba(255,255,255,0.26)')
          : isInteractiveHover
            ? withAlpha(accentColor, 0.48, 'rgba(255,255,255,0.22)')
            : withAlpha(accentColor, 0.38, 'rgba(255,255,255,0.18)');

        return [
          styles.videoButton,
          pressed ? styles.videoButtonPressed : null,
          isInteractiveHover ? styles.videoButtonHovered : null,
          {
            backgroundColor: buttonBackground,
            borderColor: buttonBorder,
            shadowColor: accentColor,
            shadowOpacity: pressed ? 0.08 : isInteractiveHover ? 0.16 : 0.12,
            opacity: pressed ? 0.94 : 1,
          },
        ];
      }}>
      {({ pressed }) => {
        const isInteractiveHover = hovered && !pressed;
        const badgeBackground = pressed
          ? withAlpha(accentColor, 0.3, 'rgba(255,255,255,0.2)')
          : isInteractiveHover
            ? withAlpha(accentColor, 0.24, 'rgba(255,255,255,0.18)')
            : withAlpha(accentColor, 0.18, 'rgba(255,255,255,0.16)');
        const badgeBorder = pressed
          ? withAlpha(accentColor, 0.66, 'rgba(255,255,255,0.3)')
          : isInteractiveHover
            ? withAlpha(accentColor, 0.58, 'rgba(255,255,255,0.26)')
            : withAlpha(accentColor, 0.46, 'rgba(255,255,255,0.22)');

        return (
          <View style={styles.videoButtonContent}>
            <View
              style={[
                styles.videoButtonBadge,
                {
                  backgroundColor: badgeBackground,
                  borderColor: badgeBorder,
                },
              ]}>
              <Text style={[styles.videoButtonBadgeText, { color: theme.colors.text }]}>▶</Text>
            </View>
            <Text style={[styles.videoButtonLabel, { color: theme.colors.text }]}>Ver apresentação</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  infoCard: {
    flexGrow: 1,
    flexBasis: 280,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  infoDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    minWidth: 118,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
  statLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  contactCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  contactTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  contactInfo: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  rosterGrid: {
    gap: 12,
  },
  playerCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  playerCopy: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  playerMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  videoButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 9,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 3,
  },
  videoButtonHovered: {
    transform: [{ translateY: -1 }],
  },
  videoButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  videoButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  videoButtonBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoButtonLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  videoButtonBadgeText: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    gap: 14,
  },
});
