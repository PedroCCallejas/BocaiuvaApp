import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import type { HighlightPlayer, MatchHighlights } from '@/lib/match-highlights';

interface LastMatchCardProps {
  highlights: MatchHighlights;
  teamName: string;
  teamLogoUrl?: string | null;
}

const RESULT_LABEL = {
  win: 'Vitória',
  draw: 'Empate',
  loss: 'Derrota',
} as const;

function HighlightRow({
  entry,
  tint,
  background,
}: {
  entry: HighlightPlayer;
  tint: string;
  background: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={[styles.highlightRow, { backgroundColor: background }]}>
      <Avatar name={entry.nickname} photoUrl={entry.photoUrl} size={28} />
      <Text style={[styles.highlightName, { color: theme.colors.text }]} numberOfLines={1}>
        {entry.nickname}
      </Text>
      <Text style={[styles.highlightValue, { color: tint }]}>{entry.value}</Text>
    </View>
  );
}

/**
 * Resumo do último jogo na Home.
 *
 * A votação de MVP aparece como parcial enquanto está aberta e vira destaque
 * de campeão quando fecha — é a informação que o time procura primeiro depois
 * da partida.
 */
export function LastMatchCard({ highlights, teamName, teamLogoUrl }: LastMatchCardProps) {
  const theme = useAppTheme();
  const {
    match,
    result,
    teamScore,
    opponentScore,
    scorers,
    assists,
    totalGoals,
    totalAssists,
    mvpStandings,
    mvpTotalVotes,
    mvpDecided,
    topRated,
  } = highlights;

  const resultColor =
    result === 'win'
      ? theme.colors.success
      : result === 'loss'
        ? theme.colors.danger
        : theme.colors.warning;

  const maxVotes = mvpStandings[0]?.votes ?? 0;
  const visibleStandings = mvpDecided
    ? mvpStandings.filter((entry) => entry.isWinner)
    : mvpStandings.slice(0, 3);

  return (
    <Pressable
      onPress={() => router.push(`/matches/${match.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Último jogo contra ${match.opponentName}, ${teamScore} a ${opponentScore}. Toque para abrir a partida.`}
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Último jogo</Text>
        {result ? (
          <View style={[styles.resultPill, { backgroundColor: resultColor }]}>
            <Text style={[styles.resultLabel, { color: theme.colors.actionText }]}>
              {RESULT_LABEL[result]}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.scoreboard, { backgroundColor: theme.colors.surfaceMuted }]}>
        <View style={styles.scoreSide}>
          <Avatar name={teamName} photoUrl={teamLogoUrl ?? null} size={44} />
          <Text style={[styles.sideName, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {teamName}
          </Text>
        </View>

        <View style={styles.scoreCenter}>
          <Text style={[styles.score, { color: theme.colors.text }]}>
            {teamScore} <Text style={{ color: theme.colors.textSubtle }}>×</Text> {opponentScore}
          </Text>
          <Text style={[styles.scoreDate, { color: theme.colors.textMuted }]}>
            {formatDateBR(match.date)}
          </Text>
        </View>

        <View style={styles.scoreSide}>
          <Avatar name={match.opponentName} photoUrl={match.opponentLogoUrl ?? null} size={44} />
          <Text style={[styles.sideName, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {match.opponentName}
          </Text>
        </View>
      </View>

      {scorers.length > 0 || assists.length > 0 ? (
        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={[styles.columnTitle, { color: theme.colors.success }]}>
              Gols ({totalGoals})
            </Text>
            {scorers.length > 0 ? (
              scorers.map((entry) => (
                <HighlightRow
                  key={`goal-${entry.playerId}`}
                  entry={entry}
                  tint={theme.colors.success}
                  background={theme.colors.surfaceMuted}
                />
              ))
            ) : (
              <Text style={[styles.emptyColumn, { color: theme.colors.textSubtle }]}>
                Sem gols registrados
              </Text>
            )}
          </View>

          <View style={styles.column}>
            <Text style={[styles.columnTitle, { color: theme.colors.accent }]}>
              Assistências ({totalAssists})
            </Text>
            {assists.length > 0 ? (
              assists.map((entry) => (
                <HighlightRow
                  key={`assist-${entry.playerId}`}
                  entry={entry}
                  tint={theme.colors.accent}
                  background={theme.colors.surfaceMuted}
                />
              ))
            ) : (
              <Text style={[styles.emptyColumn, { color: theme.colors.textSubtle }]}>
                Sem assistências
              </Text>
            )}
          </View>
        </View>
      ) : null}

      {mvpStandings.length > 0 ? (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              {mvpDecided ? 'MVP da partida' : 'Votação de MVP'}
            </Text>
            <Text style={[styles.sectionMeta, { color: theme.colors.textMuted }]}>
              {mvpDecided
                ? 'Resultado final'
                : `Em andamento · ${mvpTotalVotes} voto${mvpTotalVotes > 1 ? 's' : ''}`}
            </Text>
          </View>

          {visibleStandings.map((entry) => (
            <View key={`mvp-${entry.playerId}`} style={styles.mvpRow}>
              <Avatar name={entry.nickname} photoUrl={entry.photoUrl} size={28} />
              <View style={styles.mvpCopy}>
                <Text style={[styles.highlightName, { color: theme.colors.text }]}>
                  {entry.nickname}
                </Text>
                <View
                  style={[styles.mvpTrack, { backgroundColor: theme.colors.surfaceRaised }]}>
                  <View
                    style={[
                      styles.mvpFill,
                      {
                        backgroundColor: theme.colors.warning,
                        // Barra proporcional ao líder, não ao total: com poucos
                        // votos uma barra minúscula não comunica nada.
                        width: `${maxVotes > 0 ? (entry.votes / maxVotes) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={[styles.highlightValue, { color: theme.colors.warning }]}>
                {entry.votes}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {topRated ? (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
              Melhor em notas
            </Text>
          </View>
          <View style={styles.mvpRow}>
            <Avatar name={topRated.nickname} photoUrl={topRated.photoUrl} size={28} />
            <Text style={[styles.highlightName, { color: theme.colors.text }]}>
              {topRated.nickname}
            </Text>
            <Text style={[styles.highlightValue, { color: theme.colors.action }]}>
              {topRated.value.toFixed(2)}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '900',
  },
  resultPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  resultLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  scoreSide: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  sideName: {
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
  },
  scoreCenter: {
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '900',
  },
  scoreDate: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  columns: {
    flexDirection: 'row',
    gap: 10,
  },
  column: {
    flex: 1,
    gap: 6,
  },
  columnTitle: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyColumn: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  highlightName: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  highlightValue: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  section: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  mvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mvpCopy: {
    flex: 1,
    gap: 4,
  },
  mvpTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  mvpFill: {
    height: '100%',
    borderRadius: 999,
  },
});
