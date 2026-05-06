import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { CounterField } from '@/components/ui/CounterField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  RATING_CRITERIA_LABELS,
  RATING_CRITERIA_ORDER,
} from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getConfirmedPlayers,
  getRatingsSummary,
  hasPlayerRatedTarget,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  selectCanManageTeam,
  selectCurrentPlayer,
} from '@/store/selectors';
import type { RatingCriterion } from '@/types/domain';

function defaultCriteria() {
  return RATING_CRITERIA_ORDER.reduce<Record<RatingCriterion, number>>((acc, criterion) => {
    acc[criterion] = 3;
    return acc;
  }, {} as Record<RatingCriterion, number>);
}

export default function MatchRatingsScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const theme = useAppTheme();
  const snapshot = useAppStore((state) => state.snapshot);
  const match = useAppStore((state) => findMatchById(state, String(matchId)));
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const canManage = useAppStore(selectCanManageTeam);
  const submitPlayerRating = useAppStore((state) => state.submitPlayerRating);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [criteria, setCriteria] = useState(defaultCriteria);

  if (!match || match.status !== 'finished') {
    return (
      <Screen>
        <EmptyState
          title="Avaliacoes indisponiveis"
          description="As notas anonimas so ficam disponiveis apos o encerramento da partida."
        />
      </Screen>
    );
  }

  const currentMatch = match;
  const confirmedPlayers = getConfirmedPlayers(snapshot, currentMatch.id);
  const eligibleToRate = confirmedPlayers.filter((player) => player.id !== currentPlayer?.id);
  const canRate = isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id);
  const ratingsSummary = getRatingsSummary(snapshot, currentMatch.id);
  const rankingItems = ratingsSummary.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.totalRatings} avaliacao(oes)`,
      value: item.overallAverage,
    };
  });

  const unratedPlayers = eligibleToRate.filter(
    (player) =>
      currentPlayer &&
      !hasPlayerRatedTarget(snapshot, currentMatch.id, currentPlayer.id, player.id),
  );

  const selectedPlayer = eligibleToRate.find((player) => player.id === selectedPlayerId) ?? null;
  const overallPreview = useMemo(() => {
    const values = Object.values(criteria);
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number((total / values.length).toFixed(1));
  }, [criteria]);

  async function handleSubmit() {
    if (!selectedPlayerId) {
      return;
    }

    try {
      await submitPlayerRating({
        matchId: currentMatch.id,
        targetPlayerId: selectedPlayerId,
        criteria,
      });
      setSelectedPlayerId(null);
      setCriteria(defaultCriteria());
    } catch (error) {
      Alert.alert(
        'Nao foi possivel salvar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Notas anonimas</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          As medias aparecem por jogador, sem revelar quem avaliou quem.
        </Text>
      </View>

      {canRate ? (
        <>
          <SectionHeader
            title="Escolha um jogador"
            subtitle={`${unratedPlayers.length} jogador(es) ainda nao avaliados por voce`}
          />
          <View style={styles.targetWrap}>
            {eligibleToRate.map((player) => {
              const alreadyRated = currentPlayer
                ? hasPlayerRatedTarget(snapshot, currentMatch.id, currentPlayer.id, player.id)
                : false;
              const selected = selectedPlayerId === player.id;

              return (
                <Pressable
                  key={player.id}
                  disabled={alreadyRated}
                  onPress={() => setSelectedPlayerId(player.id)}
                  style={[
                    styles.targetCard,
                    {
                      backgroundColor: selected
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      opacity: alreadyRated ? 0.55 : 1,
                    },
                  ]}>
                  <Text style={[styles.targetName, { color: theme.colors.text }]}>
                    #{player.jerseyNumber} {player.nickname}
                  </Text>
                  <Text style={[styles.targetSub, { color: theme.colors.textMuted }]}>
                    {alreadyRated ? 'Ja avaliado' : 'Pronto para avaliar'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedPlayer ? (
            <View style={styles.formSection}>
              <SectionHeader
                title={`Avaliando ${selectedPlayer.nickname}`}
                subtitle={`Media prevista: ${overallPreview}`}
              />
              <View style={styles.criteriaWrap}>
                {RATING_CRITERIA_ORDER.map((criterion) => (
                  <CounterField
                    key={criterion}
                    label={RATING_CRITERIA_LABELS[criterion]}
                    value={criteria[criterion]}
                    min={0}
                    max={5}
                    onChange={(value) =>
                      setCriteria((current) => ({
                        ...current,
                        [criterion]: value,
                      }))
                    }
                  />
                ))}
              </View>
              <AppButton label="Salvar avaliacao" onPress={handleSubmit} fullWidth />
            </View>
          ) : null}
        </>
      ) : (
        <EmptyState
          title={currentPlayer ? 'Sem permissao para avaliar' : 'Conta nao vinculada'}
          description={
            currentPlayer
              ? 'Somente jogadores confirmados na partida podem registrar notas.'
              : 'Vincule sua conta a um jogador para usar esta tela.'
          }
        />
      )}

      {rankingItems.length > 0 ? (
        <RankingList title="Media geral da partida" items={rankingItems} />
      ) : canManage ? (
        <EmptyState
          title="Sem avaliacoes ainda"
          description="Quando o elenco enviar as notas, a media por jogador aparece aqui."
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  targetWrap: {
    gap: 10,
  },
  targetCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  targetName: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  targetSub: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  formSection: {
    gap: 14,
  },
  criteriaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
