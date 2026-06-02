import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
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
import type { PublicTeamSummary } from '@/types/domain';

export default function TeamsGalleryScreen() {
  const theme = useAppTheme();
  const listPublicTeams = useAppStore((state) => state.listPublicTeams);
  const [teams, setTeams] = useState<PublicTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const nextTeams = await listPublicTeams();

        if (mounted) {
          setTeams(nextTeams);
        }
      } catch (error) {
        if (mounted) {
          Alert.alert(
            'Não foi possível carregar a galeria',
            error instanceof Error ? error.message : 'Tente novamente.',
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [listPublicTeams]);

  const filteredTeams = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedCity = cityFilter.trim().toLowerCase();
    const normalizedState = stateFilter.trim().toLowerCase();
    const normalizedArea = areaFilter.trim().toLowerCase();

    return teams.filter((team) => {
      const searchableArea = [team.neighborhood, team.homeFieldName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch =
        normalizedSearch.length === 0 || team.name.toLowerCase().includes(normalizedSearch);
      const matchesCity =
        normalizedCity.length === 0 || team.city.toLowerCase().includes(normalizedCity);
      const matchesState =
        normalizedState.length === 0 || team.state.toLowerCase().includes(normalizedState);
      const matchesArea =
        normalizedArea.length === 0 || searchableArea.includes(normalizedArea);

      return matchesSearch && matchesCity && matchesState && matchesArea;
    });
  }, [areaFilter, cityFilter, search, stateFilter, teams]);

  async function handleFriendlyContact(team: PublicTeamSummary) {
    try {
      const whatsappUrl = team.contactWhatsapp
        ? buildWhatsappUrl(team.contactWhatsapp, team.name)
        : null;
      const phoneUrl = team.contactPhone ? buildTelephoneUrl(team.contactPhone) : null;

      if (whatsappUrl) {
        await openExternalUrl(whatsappUrl);
        return;
      }

      if (phoneUrl) {
        await openExternalUrl(phoneUrl);
        return;
      }

      Alert.alert('Contato indisponível', 'Esse time ainda não publicou um contato de amistoso.');
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir o contato',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function openPublicProfile(teamId: string) {
    router.push({
      pathname: '/teams/[teamId]/public',
      params: { teamId },
    });
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.kicker, { color: theme.colors.secondary }]}>
          Times disponíveis para amistoso
        </Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>Encontre adversários próximos</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          A galeria mostra apenas perfis públicos com localização básica, números agregados e
          contato liberado pelo próprio admin do time.
        </Text>
      </View>

      <View
        style={[
          styles.filtersCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <AppInput label="Buscar por nome" value={search} onChangeText={setSearch} />
        <View style={styles.filtersRow}>
          <View style={styles.filterHalf}>
            <AppInput label="Cidade" value={cityFilter} onChangeText={setCityFilter} />
          </View>
          <View style={styles.filterUf}>
            <AppInput
              label="Estado"
              autoCapitalize="characters"
              value={stateFilter}
              onChangeText={(value) => setStateFilter(value.toUpperCase())}
            />
          </View>
        </View>
        <AppInput label="Campo ou bairro" value={areaFilter} onChangeText={setAreaFilter} />
      </View>

      {loading ? (
        <EmptyState
          title="Carregando a galeria"
          description="Buscando os times públicos disponíveis para amistoso."
        />
      ) : filteredTeams.length === 0 ? (
        <EmptyState
          title="Nenhum time encontrado"
          description={
            teams.length === 0
              ? 'Ainda não há times públicos liberados na galeria.'
              : 'Ajuste os filtros para procurar outro adversário.'
          }
        />
      ) : (
        <View style={styles.list}>
          {filteredTeams.map((team) => {
            const areaLabel = buildPublicAreaLabel(team);

            return (
              <Pressable
                key={team.id}
                onPress={() => openPublicProfile(team.id)}
                style={({ pressed }) => [
                  styles.cardShell,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    opacity: pressed ? 0.97 : 1,
                  },
                ]}>
                <View style={styles.bannerShell}>
                  {team.bannerUrl ? (
                    <Image source={{ uri: team.bannerUrl }} resizeMode="cover" style={styles.banner} />
                  ) : null}
                  <LinearGradient
                    colors={[`${team.primaryColor}F3`, `${team.secondaryColor}D0`, `${team.primaryColor}FA`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.bannerGradient}
                  />
                  <LinearGradient
                    colors={['rgba(4,10,8,0.12)', 'rgba(4,10,8,0.68)']}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={styles.bannerOverlay}
                  />
                  <Text style={styles.bannerTag}>{buildPublicLocationLabel(team)}</Text>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.identityRow}>
                    <View style={styles.logoFrame}>
                      <Avatar
                        name={team.name}
                        photoUrl={team.logoUrl}
                        size={84}
                        accent={theme.colors.primarySoft}
                      />
                    </View>
                    <View style={styles.identityCopy}>
                      <Text style={[styles.teamName, { color: theme.colors.text }]}>{team.name}</Text>
                      <Text style={[styles.cityText, { color: theme.colors.textMuted }]}>
                        {buildPublicLocationLabel(team)}
                      </Text>
                      {areaLabel ? (
                        <Text style={[styles.areaText, { color: theme.colors.textMuted }]}>
                          {areaLabel}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.statsGrid}>
                    <StatTile label="Jogos" value={String(team.stats.games)} />
                    <StatTile label="Vitórias" value={String(team.stats.wins)} />
                    <StatTile label="Empates" value={String(team.stats.draws)} />
                    <StatTile label="Derrotas" value={String(team.stats.losses)} />
                  </View>

                  {team.publicDescription ? (
                    <Text numberOfLines={2} style={[styles.summaryText, { color: theme.colors.textMuted }]}>
                      {team.publicDescription}
                    </Text>
                  ) : null}

                  <View style={styles.footerRow}>
                    <View style={styles.contactCopy}>
                      {team.allowFriendlyContact ? (
                        <>
                          <Text style={[styles.contactLabel, { color: theme.colors.text }]}>
                            {team.contactName ? `Contato: ${team.contactName}` : 'Contato liberado'}
                          </Text>
                          {team.contactWhatsapp || team.contactPhone ? (
                            <Text style={[styles.contactValue, { color: theme.colors.textMuted }]}>
                              {formatPublicPhone(team.contactWhatsapp ?? team.contactPhone)}
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={[styles.contactValue, { color: theme.colors.textMuted }]}>
                          Contato para amistoso não liberado
                        </Text>
                      )}
                    </View>

                    <View style={styles.buttonRow}>
                      <AppButton
                        label="Ver time"
                        variant="secondary"
                        onPress={() => openPublicProfile(team.id)}
                      />
                      {team.allowFriendlyContact ? (
                        <AppButton
                          label="Chamar para amistoso"
                          onPress={() => void handleFriendlyContact(team)}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.statTile,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  kicker: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 36,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  filtersCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 12,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterHalf: {
    flex: 1,
    minWidth: 170,
  },
  filterUf: {
    width: 110,
  },
  list: {
    gap: 18,
  },
  cardShell: {
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  bannerShell: {
    height: 158,
    justifyContent: 'flex-end',
    padding: 18,
  },
  banner: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.86,
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerTag: {
    color: '#FFFFFF',
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 16,
  },
  identityRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-end',
    marginTop: -42,
  },
  logoFrame: {
    padding: 8,
    borderRadius: 26,
    backgroundColor: 'rgba(7,16,11,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  identityCopy: {
    flex: 1,
    gap: 4,
    paddingBottom: 4,
  },
  teamName: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 30,
  },
  cityText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  areaText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  summaryText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  footerRow: {
    gap: 14,
  },
  contactCopy: {
    gap: 4,
  },
  contactLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  contactValue: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
