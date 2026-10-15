import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');

  async function loadTeams() {
    try {
      setLoading(true);
      setLoadError(null);
      const nextTeams = await listPublicTeams();
      setTeams(nextTeams);
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
    void loadTeams();
  }, []);

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

  function clearFilters() {
    setSearch('');
    setCityFilter('');
    setStateFilter('');
    setAreaFilter('');
  }

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

      Alert.alert(
        'Contato indisponível',
        'Esse time ainda não publicou um contato de amistoso.',
      );
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
    <PublicPageShell
      seo={{
        title: 'Galeria de times de futebol amador | Professô FC',
        description: 'Conheça times de futebol amador que optaram por compartilhar publicamente seu perfil no Professô FC.',
        canonicalPath: '/teams-gallery',
      }}
      title="Galeria de times"
      description="Perfis que os próprios times escolheram mostrar.">
      <View
        style={[
          styles.filtersCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <View style={styles.filtersHeader}>
          <View style={styles.filtersCopy}>
            <Text style={[styles.filtersTitle, { color: theme.colors.text }]}>
              Filtrar a galeria
            </Text>

          </View>
          <AppButton label="Limpar filtros" variant="ghost" onPress={clearFilters} />
        </View>
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
        <LoadingState title="Carregando a galeria…" description="Buscando os perfis públicos." />
      ) : loadError ? (
        <EmptyState
          title="Não foi possível carregar a galeria pública"
          description={`O carregamento falhou agora. ${loadError}`}
          actionLabel="Tentar novamente"
          onAction={() => void loadTeams()}
        />
      ) : filteredTeams.length === 0 ? (
        <EmptyState
          title={teams.length === 0 ? 'Ainda não há times públicos' : 'Nenhum time encontrado'}
          description={
            teams.length === 0
              ? 'A galeria ainda não recebeu perfis públicos suficientes. Volte depois ou crie sua conta para montar o seu time.'
              : 'Nenhum time corresponde aos filtros atuais. Ajuste a busca para explorar outras regiões ou nomes.'
          }
          actionLabel={teams.length === 0 ? 'Criar conta' : 'Limpar filtros'}
          onAction={
            teams.length === 0
              ? () => router.push('/register')
              : clearFilters
          }
        />
      ) : (
        <View style={styles.resultsSection}>
          <Text style={[styles.resultsCount, { color: theme.colors.textMuted }]}>
            {filteredTeams.length} time(s) público(s) encontrado(s).
          </Text>
          <View style={styles.list}>
            {filteredTeams.map((team) => {
              const areaLabel = buildPublicAreaLabel(team);

              return (
                <View
                  key={team.id}
                  style={[
                    styles.cardShell,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <View style={{ height: 4, backgroundColor: team.primaryColor }} />

                  <View style={styles.cardBody}>
                    <View style={styles.identityRow}>
                      <View style={styles.logoFrame}>
                        <Avatar
                          name={team.name}
                          photoUrl={team.logoUrl}
                          size={56}
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
                          label="Ver perfil"
                          onPress={() => openPublicProfile(team.id)}
                        />
                        {team.allowFriendlyContact ? (
                          <AppButton
                            label="Chamar para amistoso"
                            variant="secondary"
                            onPress={() => void handleFriendlyContact(team)}
                          />
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </PublicPageShell>
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
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  infoCard: {
    flexGrow: 1,
    flexBasis: 280,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  infoTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '600',
  },
  infoDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  filtersCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  filtersHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  filtersCopy: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  filtersTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '600',
  },
  filtersDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
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
  resultsSection: {
    gap: 14,
  },
  resultsCount: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  list: {
    gap: 18,
  },
  cardShell: {
    borderWidth: 1,
    borderRadius: 18,
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
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 18,
    gap: 16,
  },
  identityRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginTop: 0,
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
    fontWeight: '700',
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
    fontWeight: '700',
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
