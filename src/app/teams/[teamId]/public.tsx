import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
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

export default function PublicTeamProfileScreen() {
  const params = useLocalSearchParams<{ teamId?: string | string[] }>();
  const theme = useAppTheme();
  const getPublicTeamProfile = useAppStore((state) => state.getPublicTeamProfile);
  const [profile, setProfile] = useState<PublicTeamProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rawTeamId = params.teamId;
  const teamId = typeof rawTeamId === 'string' ? rawTeamId : rawTeamId?.[0] ?? '';

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
                  </View>
                </View>
              ))}
            </View>
          )}
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
});
