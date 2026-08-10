import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { MatchCard } from '@/components/cards/MatchCard';
import { MatchDiaryEntryCard } from '@/components/matches/MatchDiaryEntryCard';
import { RankingList } from '@/components/stats/RankingList';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR, formatMatchDateTime, hasMatchElapsedHours, isValidTime, parseDateBRToISO } from '@/lib/date';
import { isValidExternalUrl } from '@/lib/url';
import { openExternalUrl } from '@/lib/external-url';
import { formatCurrencyBRL, getMatchFieldPaymentSummary } from '@/lib/field-cost';
import {
  membershipIndicatesPlayer,
} from '@/lib/player-linking';
import {
  getConfirmedPlayers,
  getRatingsSummary,
  hasPlayerVotedMvp,
  isPlayerConfirmedForMatch,
} from '@/lib/match';
import { buildMatchMvpBreakdown, formatStatNumber, PLAYER_STATS_LABELS } from '@/lib/stats';
import { useAppStore } from '@/store/app-store';
import {
  findLineupByMatchId,
  findMatchById,
  getAttendanceBuckets,
  getMatchDiaryEntriesByMatchId,
  getAttendanceSummary,
  selectCanManageTeam,
  selectCurrentMembership,
  selectCurrentUser,
  selectCurrentPlayer,
  selectTeamPlayers,
} from '@/store/selectors';
import type { AttendanceStatus, MatchType, Player } from '@/types/domain';

const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  confirmed: 'Confirmado',
  absent: 'Ausente',
  pending: 'Pendente',
};

export default function MatchDetailsScreen() {
  const params = useLocalSearchParams<{ matchId?: string | string[] }>();
  const theme = useAppTheme();
  const ready = useAppStore((state) => state.ready);
  const snapshot = useAppStore((state) => state.snapshot);
  const rawMatchId = params.matchId;
  const resolvedMatchId =
    typeof rawMatchId === 'string' ? rawMatchId : rawMatchId?.[0] ?? '';
  const match = useAppStore((state) => findMatchById(state, resolvedMatchId));
  const lineup = useAppStore((state) => findLineupByMatchId(state, resolvedMatchId));
  const currentUser = useAppStore(selectCurrentUser);
  const currentMembership = useAppStore(selectCurrentMembership);
  const currentPlayer = useAppStore(selectCurrentPlayer);
  const teamPlayers = useAppStore(selectTeamPlayers);
  const canManage = useAppStore(selectCanManageTeam);
  const setAttendance = useAppStore((state) => state.setAttendance);
  const updateMatch = useAppStore((state) => state.updateMatch);
  const updateMatchMetadata = useAppStore((state) => state.updateMatchMetadata);
  const updateMatchFieldPayment = useAppStore((state) => state.updateMatchFieldPayment);
  const deleteMatchDiaryEntry = useAppStore((state) => state.deleteMatchDiaryEntry);
  const deleteMatch = useAppStore((state) => state.deleteMatch);
  const setManualMvp = useAppStore((state) => state.setManualMvp);
  const adminSetMatchAttendance = useAppStore((state) => state.adminSetMatchAttendance);
  const [navigatingEdit, setNavigatingEdit] = useState(false);
  const [savingFieldPayment, setSavingFieldPayment] = useState(false);
  const [savingDeleteMatch, setSavingDeleteMatch] = useState(false);
  const [savingManualMvp, setSavingManualMvp] = useState(false);
  const [deleteMatchModalVisible, setDeleteMatchModalVisible] = useState(false);
  const [cancelMatchModalVisible, setCancelMatchModalVisible] = useState(false);
  const [deleteDiaryEntryId, setDeleteDiaryEntryId] = useState<string | null>(null);
  const [savingCancelMatch, setSavingCancelMatch] = useState(false);
  const [savingDeleteDiary, setSavingDeleteDiary] = useState(false);
  const [manualMvpDraftPlayerId, setManualMvpDraftPlayerId] = useState<string | null | undefined>(
    undefined,
  );
  const [togglingParticipantId, setTogglingParticipantId] = useState<string | null>(null);
  const navigatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigatingTimeoutRef.current) {
        clearTimeout(navigatingTimeoutRef.current);
      }
    };
  }, []);

  const [payerPlayerIdsDraft, setPayerPlayerIdsDraft] = useState<string[]>(
    () => match?.fieldPayment?.payerPlayerIds ?? [],
  );
  const [paidGuestCountDraft, setPaidGuestCountDraft] = useState(
    () => String(match?.fieldPayment?.paidGuestCount ?? 0),
  );
  const [pixKeyDraft, setPixKeyDraft] = useState(
    () => match?.fieldPayment?.pixKey ?? '',
  );
  const [responsibleNameDraft, setResponsibleNameDraft] = useState(
    () => match?.fieldPayment?.responsibleName ?? '',
  );

  const [editMetaModalVisible, setEditMetaModalVisible] = useState(false);
  const [savingEditMeta, setSavingEditMeta] = useState(false);
  const [editMetaError, setEditMetaError] = useState<string | null>(null);
  const [editMetaDateDraft, setEditMetaDateDraft] = useState('');
  const [editMetaTimeDraft, setEditMetaTimeDraft] = useState('');
  const [editMetaVenueDraft, setEditMetaVenueDraft] = useState('');
  const [editMetaLocationUrlDraft, setEditMetaLocationUrlDraft] = useState('');
  const [editMetaMatchTypeDraft, setEditMetaMatchTypeDraft] = useState<MatchType>('society');

  useEffect(() => {
    setManualMvpDraftPlayerId(undefined);
  }, [match?.id]);

  // `payerPlayerIds` é um array: a referência muda a cada atualização do snapshot,
  // mesmo sem mudança real de conteúdo. Usar a referência como dependência fazia o
  // efeito rodar e descartar as marcações que o admin ainda não tinha salvado.
  // A chave serializada só muda quando o conteúdo realmente muda.
  const persistedPayerPlayerIdsKey = (match?.fieldPayment?.payerPlayerIds ?? []).join('|');

  useEffect(() => {
    const fp = match?.fieldPayment ?? null;
    setPayerPlayerIdsDraft(fp?.payerPlayerIds ?? []);
    setPaidGuestCountDraft(String(fp?.paidGuestCount ?? 0));
    setPixKeyDraft(fp?.pixKey ?? '');
    setResponsibleNameDraft(fp?.responsibleName ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    match?.id,
    match?.fieldPayment?.paidGuestCount,
    match?.fieldPayment?.pixKey,
    match?.fieldPayment?.responsibleName,
    persistedPayerPlayerIdsKey,
  ]);

  const paidGuestCountValue = useMemo(() => {
    const parsed = Number(paidGuestCountDraft.trim() || '0');
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }, [paidGuestCountDraft]);

  const fieldPaymentSummary = useMemo(() => {
    const fc = match?.fieldCost ?? null;
    return fc
      ? getMatchFieldPaymentSummary(fc, {
          payerPlayerIds: payerPlayerIdsDraft,
          paidGuestCount: paidGuestCountValue,
        })
      : null;
  }, [match?.fieldCost, paidGuestCountValue, payerPlayerIdsDraft]);

  // As marcações ficam em rascunho até o admin salvar. Sinalizar isso evita
  // a impressão de que o botão "Marcar como pago" não funcionou.
  const hasUnsavedFieldPayment = useMemo(() => {
    const fp = match?.fieldPayment ?? null;

    return (
      [...payerPlayerIdsDraft].sort().join('|') !== [...(fp?.payerPlayerIds ?? [])].sort().join('|') ||
      paidGuestCountValue !== (fp?.paidGuestCount ?? 0) ||
      pixKeyDraft.trim() !== (fp?.pixKey ?? '') ||
      responsibleNameDraft.trim() !== (fp?.responsibleName ?? '')
    );
  }, [
    match?.fieldPayment,
    paidGuestCountValue,
    payerPlayerIdsDraft,
    pixKeyDraft,
    responsibleNameDraft,
  ]);

  if (!match) {
    if (__DEV__) console.log('[match-detail] match missing', { matchId: resolvedMatchId });
    return (
      <Screen>
        <EmptyState
          title="Partida não encontrada"
          description="A partida pode ter sido removida ou o link ficou inválido."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const currentMatch = match;
  const fieldCost = currentMatch.fieldCost ?? null;
  const fieldPayment = currentMatch.fieldPayment ?? null;

  if (currentMatch.deletedAt) {
    if (__DEV__) console.log('[match-detail] match canceled/deleted', { matchId: resolvedMatchId });
    return (
      <Screen>
        <EmptyState
          title="Partida excluída"
          description="Esta partida foi excluída e não aparece mais nas listas, ranking e estatísticas."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const attendanceSummary = getAttendanceSummary({ snapshot }, currentMatch.id);
  const isOpenMatch = currentMatch.status !== 'finished' && currentMatch.status !== 'canceled';
  const buckets = getAttendanceBuckets({ snapshot }, currentMatch.id, { filterActiveOnly: isOpenMatch });
  const confirmedPlayers = getConfirmedPlayers(snapshot, currentMatch.id);
  const attendanceByPlayerId = new Map(
    snapshot.attendance
      .filter((item) => item.matchId === currentMatch.id)
      .map((item) => [item.playerId, item]),
  );
  const canUsePlayerActions =
    currentPlayer !== null || membershipIndicatesPlayer(currentMembership);
  const myAttendance = currentPlayer ? attendanceByPlayerId.get(currentPlayer.id) ?? null : null;
  const canEditAttendance =
    currentMatch.status !== 'finished' && currentMatch.status !== 'canceled';
  const canEditMatch =
    ready &&
    canManage &&
    Boolean(currentMatch.id) &&
    currentMatch.status !== 'finished' &&
    currentMatch.status !== 'canceled';
  const canUsePostGame = canManage && currentMatch.status !== 'canceled';
  const shouldPromptFinish =
    canUsePostGame &&
    currentMatch.status !== 'finished' &&
    hasMatchElapsedHours(currentMatch, 24);
  const canVoteMvp =
    currentMatch.status === 'finished' &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id) &&
    !hasPlayerVotedMvp(snapshot, currentMatch.id, currentPlayer?.id);
  const canRatePlayers =
    currentMatch.status === 'finished' &&
    isPlayerConfirmedForMatch(snapshot, currentMatch.id, currentPlayer?.id);
  const mvpBreakdown = buildMatchMvpBreakdown(snapshot, currentMatch.id);
  const ratingsSummary = getRatingsSummary(snapshot, currentMatch.id);
  const matchStats = snapshot.matchStats
    .filter((item) => item.matchId === currentMatch.id)
    .sort((left, right) => right.goals + right.assists - (left.goals + left.assists));
  const diaryEntries = getMatchDiaryEntriesByMatchId({ snapshot }, currentMatch.id);
  const playerById = new Map(snapshot.players.map((player) => [player.id, player]));
  const manualMvpCurrentPlayerId = currentMatch.manualMvpPlayerId ?? null;
  const effectiveMvpDraftId =
    manualMvpDraftPlayerId === undefined ? manualMvpCurrentPlayerId : manualMvpDraftPlayerId;
  const isMvpDraftChanged = effectiveMvpDraftId !== manualMvpCurrentPlayerId;
  const canEditParticipants =
    canManage &&
    (currentMatch.status === 'finished' || currentMatch.status === 'canceled');
  const isCurrentPlayerMarkedAsPaid = currentPlayer
    ? payerPlayerIdsDraft.includes(currentPlayer.id)
    : false;

  const canEditMatchMetadata =
    canManage &&
    (currentMatch.status === 'finished' || currentMatch.status === 'canceled');

  async function handleOpenLocation() {
    if (!currentMatch.locationUrl) {
      return;
    }

    try {
      await openExternalUrl(currentMatch.locationUrl);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir a localização',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleTogglePlayerPaid(playerId: string) {
    setPayerPlayerIdsDraft((current) =>
      current.includes(playerId)
        ? current.filter((item) => item !== playerId)
        : [...current, playerId],
    );
  }

  function handleCopyPix() {
    const pixKey = fieldPayment?.pixKey?.trim();

    if (!pixKey) {
      return;
    }

    Clipboard.setString(pixKey);
    Alert.alert('Chave Pix copiada', 'A chave Pix foi copiada para a área de transferência.');
  }

  async function handleSaveFieldPayment() {
    if (!fieldCost) {
      return;
    }

    try {
      setSavingFieldPayment(true);
      await updateMatchFieldPayment(currentMatch.id, {
        fieldPayment: {
          payerPlayerIds: payerPlayerIdsDraft,
          paidGuestCount: paidGuestCountValue,
          pixKey: pixKeyDraft.trim() || null,
          responsibleName: responsibleNameDraft.trim() || null,
        },
      });
    } catch (error) {
      Alert.alert(
        'Não foi possível salvar o controle do campo',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingFieldPayment(false);
    }
  }

  async function respond(
    playerId: string,
    status: AttendanceStatus,
    source: 'admin' | 'own',
  ) {
    const isOwnAttendance = currentPlayer?.id === playerId;
    const debugAttendance = __DEV__ || process.env.EXPO_PUBLIC_DEBUG_ATTENDANCE === 'true';
    if (debugAttendance) {
      const logLabel =
        source === 'admin'
          ? '[attendance-ui] admin status button pressed'
          : '[attendance-ui] own status button pressed';
      console.log(logLabel, {
        uid: currentUser?.id ?? null,
        activeTeamId: currentMembership?.teamId ?? null,
        matchId: currentMatch.id,
        matchTeamId: currentMatch.teamId,
        matchStatus: currentMatch.status,
        matchDeletedAt: currentMatch.deletedAt ?? null,
        actorRoles: currentMembership?.roles ?? null,
        actorCanManageTeam: currentMembership?.canManageTeam ?? null,
        actorMembershipStatus: currentMembership?.status ?? null,
        actorMembershipPlayerId: currentMembership?.playerId ?? null,
        actorPlayerId: currentPlayer?.id ?? null,
        targetPlayerId: playerId,
        selectedStatus: status,
        canManageAttendance: canManage,
        isTeamAdmin: currentMembership?.roles.includes('admin') ?? false,
        isOwnAttendance,
        attendanceId: `${currentMatch.id}__${playerId}`,
      });
      console.log('[attendance-ui] target player resolved', {
        uid: currentUser?.id ?? null,
        matchId: currentMatch.id,
        targetPlayerId: playerId,
        actorPlayerId: currentPlayer?.id ?? null,
        isOwnAttendance,
      });
    }
    try {
      await setAttendance({ matchId: currentMatch.id, playerId, status });
    } catch (error) {
      const errorCode = error instanceof Error ? (error as unknown as Record<string, unknown>).code : undefined;
      if (debugAttendance) {
        console.error('[attendance-ui] blocked', {
          uid: currentUser?.id ?? null,
          matchId: currentMatch.id,
          targetPlayerId: playerId,
          selectedStatus: status,
          error: error instanceof Error
            ? { message: error.message, code: errorCode, stack: error.stack }
            : error,
        });
      }
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      const detail = errorCode ? ` [${String(errorCode)}]` : '';
      Alert.alert('Não foi possível atualizar a presença', `${message}${detail}`);
    }
  }

  function handleCancelMatch() {
    if (__DEV__) console.log('[match-actions] cancel pressed', { matchId: currentMatch.id });
    setCancelMatchModalVisible(true);
  }

  async function confirmCancelMatch() {
    if (__DEV__) console.log('[match-actions] cancel confirmed', { matchId: currentMatch.id });
    try {
      if (__DEV__) console.log('[match-actions] cancel start', { matchId: currentMatch.id });
      setSavingCancelMatch(true);
      await updateMatch(currentMatch.id, {
        seasonId: currentMatch.seasonId ?? null,
        date: currentMatch.date,
        time: currentMatch.time,
        venue: currentMatch.venue,
        opponentName: currentMatch.opponentName,
        opponentLogoUrl: currentMatch.opponentLogoUrl ?? null,
        linePlayersCount: currentMatch.linePlayersCount,
        matchType: currentMatch.matchType,
        notes: currentMatch.notes ?? '',
        status: 'canceled',
      });
      if (__DEV__) console.log('[match-actions] cancel success', { matchId: currentMatch.id });
      setCancelMatchModalVisible(false);
    } catch (error) {
      if (__DEV__) console.error('[match-actions] cancel failed', { matchId: currentMatch.id, error });
      Alert.alert(
        'Não foi possível cancelar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingCancelMatch(false);
    }
  }

  function resetNavigatingEditFallback() {
    if (navigatingTimeoutRef.current) {
      clearTimeout(navigatingTimeoutRef.current);
    }

    navigatingTimeoutRef.current = setTimeout(() => {
      setNavigatingEdit(false);
    }, 1500);
  }

  function handleEditMatch(event?: GestureResponderEvent) {
    event?.stopPropagation?.();

    const nextMatchId = currentMatch.id?.trim();

    if (!nextMatchId || !canEditMatch || navigatingEdit) {
      return;
    }

    try {
      setNavigatingEdit(true);
      resetNavigatingEditFallback();
      router.push({
        pathname: '/matches/[matchId]/edit',
        params: { matchId: nextMatchId },
      });
    } catch (error) {
      if (navigatingTimeoutRef.current) {
        clearTimeout(navigatingTimeoutRef.current);
      }
      setNavigatingEdit(false);
      Alert.alert(
        'Não foi possível abrir a edição',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  function handleOpenDiaryEntry(entryId?: string) {
    router.push({
      pathname: '/matches/[matchId]/diary-entry',
      params: entryId
        ? {
            matchId: currentMatch.id,
            entryId,
          }
        : {
            matchId: currentMatch.id,
          },
    });
  }

  function handleDeleteDiaryEntry(entryId: string) {
    setDeleteDiaryEntryId(entryId);
  }

  async function confirmDeleteDiaryEntry() {
    if (!deleteDiaryEntryId) return;
    try {
      setSavingDeleteDiary(true);
      await deleteMatchDiaryEntry(deleteDiaryEntryId);
      setDeleteDiaryEntryId(null);
    } catch (error) {
      Alert.alert(
        'Não foi possível excluir a resenha',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingDeleteDiary(false);
    }
  }

  function handleDeleteMatch() {
    if (__DEV__) console.log('[match-actions] delete button pressed', { matchId: currentMatch.id });
    setDeleteMatchModalVisible(true);
    if (__DEV__) console.log('[match-actions] delete modal opened', { matchId: currentMatch.id });
  }

  async function confirmDeleteMatch() {
    if (__DEV__) console.log('[match-actions] delete confirmed', { matchId: currentMatch.id });
    try {
      if (__DEV__) console.log('[match-actions] delete start', { matchId: currentMatch.id });
      setSavingDeleteMatch(true);
      if (__DEV__) console.log('[match-actions] delete payload', { matchId: currentMatch.id });
      await deleteMatch(currentMatch.id);
      if (__DEV__) console.log('[match-actions] delete success', { matchId: currentMatch.id });
      if (__DEV__) console.log('[match-actions] redirect after delete', { matchId: currentMatch.id });
      router.replace('/matches');
    } catch (error) {
      setSavingDeleteMatch(false);
      setDeleteMatchModalVisible(false);
      if (__DEV__) console.error('[match-actions] delete failed', { matchId: currentMatch.id, error });
      Alert.alert(
        'Não foi possível excluir a partida',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function handleSaveManualMvp() {
    try {
      setSavingManualMvp(true);
      await setManualMvp(currentMatch.id, effectiveMvpDraftId ?? null);
      setManualMvpDraftPlayerId(undefined);
    } catch (error) {
      Alert.alert(
        'Não foi possível salvar o MVP manual',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingManualMvp(false);
    }
  }

  async function handleClearManualMvp() {
    try {
      setSavingManualMvp(true);
      await setManualMvp(currentMatch.id, null);
      setManualMvpDraftPlayerId(undefined);
    } catch (error) {
      Alert.alert(
        'Não foi possível limpar o MVP manual',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSavingManualMvp(false);
    }
  }

  function handleOpenEditMeta() {
    setEditMetaDateDraft(formatDateBR(currentMatch.date));
    setEditMetaTimeDraft(currentMatch.time ?? '');
    setEditMetaVenueDraft(currentMatch.venue ?? '');
    setEditMetaLocationUrlDraft(currentMatch.locationUrl ?? '');
    setEditMetaMatchTypeDraft(currentMatch.matchType);
    setEditMetaError(null);
    setEditMetaModalVisible(true);
  }

  async function handleSaveEditMeta() {
    const parsedDate = parseDateBRToISO(editMetaDateDraft);
    if (!parsedDate) {
      setEditMetaError('Data inválida. Use o formato DD/MM/AAAA.');
      return;
    }
    if (!isValidTime(editMetaTimeDraft)) {
      setEditMetaError('Horário inválido. Use o formato HH:mm.');
      return;
    }
    if (editMetaVenueDraft.trim().length < 3) {
      setEditMetaError('Informe o local com pelo menos 3 caracteres.');
      return;
    }
    const locationUrlTrimmed = editMetaLocationUrlDraft.trim();
    if (locationUrlTrimmed && !isValidExternalUrl(locationUrlTrimmed)) {
      setEditMetaError('Cole um link válido de mapas.');
      return;
    }

    if (__DEV__) {
      console.log('[match-metadata] save attempt', { matchId: currentMatch.id, status: currentMatch.status, date: parsedDate, venue: editMetaVenueDraft.trim(), matchType: editMetaMatchTypeDraft });
    }

    try {
      setEditMetaError(null);
      setSavingEditMeta(true);
      await updateMatchMetadata(currentMatch.id, {
        date: parsedDate,
        time: editMetaTimeDraft,
        venue: editMetaVenueDraft.trim(),
        locationUrl: locationUrlTrimmed || null,
        matchType: editMetaMatchTypeDraft,
      });
      setEditMetaModalVisible(false);
    } catch (error) {
      setEditMetaError(
        error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.',
      );
    } finally {
      setSavingEditMeta(false);
    }
  }

  async function handleToggleParticipant(playerId: string, newStatus: AttendanceStatus) {
    if (__DEV__) {
      if (newStatus === 'confirmed') {
        console.log('[match-players-edit] add player pressed', { matchId: currentMatch.id, playerId });
      } else {
        console.log('[match-players-edit] remove player pressed', { matchId: currentMatch.id, playerId });
      }
    }
    try {
      setTogglingParticipantId(playerId);
      await adminSetMatchAttendance(currentMatch.id, playerId, newStatus);
    } catch (error) {
      Alert.alert(
        'Não foi possível atualizar a participação',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setTogglingParticipantId(null);
    }
  }

  const mvpRankingItems = mvpBreakdown.results.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.votes} voto(s) - ${formatStatNumber(item.percentage, 1)}%${item.isLeader ? ' - lider atual' : ''}${item.awardPoints > 0 ? ` - ${formatStatNumber(item.awardPoints, 2)} MVP` : ''}`,
      value: item.votes,
      valueLabel: String(item.votes),
    };
  });
  const ratingsRankingItems = ratingsSummary.map((item) => {
    const player = confirmedPlayers.find((entry) => entry.id === item.playerId);
    return {
      id: item.playerId,
      label: player?.nickname ?? 'Jogador',
      subtitle: `${item.totalRatings} avaliação(ões)`,
      value: item.overallAverage,
    };
  });

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {currentMatch.opponentName}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {MATCH_TYPE_LABELS[currentMatch.matchType]} - {formatMatchDateTime(currentMatch)}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {currentMatch.venue}
        </Text>
      </View>

      <MatchCard match={currentMatch} attendance={attendanceSummary} />

      <View style={styles.section}>
        <SectionHeader
          title={fieldCost ? 'Controle do campo' : 'Valor do campo'}
          subtitle={
            fieldCost
              ? `${formatCurrencyBRL(fieldCost.amountPerPlayer)} por pessoa`
              : canUsePostGame
                ? 'Defina o valor total e a divisão ao encerrar a partida ou depois.'
                : 'Valor do campo ainda não informado.'
          }
        />
        {fieldCost ? (
          <View
            style={[
              styles.fieldCostCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <View style={styles.fieldCostSummaryRow}>
              <View style={styles.fieldCostMetric}>
                <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                  Total do campo
                </Text>
                <Text style={[styles.fieldCostValue, { color: theme.colors.text }]}>
                  {formatCurrencyBRL(fieldCost.totalAmount)}
                </Text>
              </View>
              <View style={styles.fieldCostMetric}>
                <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                  Dividido entre
                </Text>
                <Text style={[styles.fieldCostValue, { color: theme.colors.text }]}>
                  {fieldCost.splitCount} pessoa(s)
                </Text>
              </View>
            </View>
            <View style={styles.fieldCostSummaryRow}>
              <View
                style={[
                  styles.fieldCostHighlight,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                  Cada um paga
                </Text>
                <Text style={[styles.fieldCostHighlightValue, { color: theme.colors.secondary }]}>
                  {formatCurrencyBRL(fieldCost.amountPerPlayer)}
                </Text>
              </View>
              {fieldPaymentSummary ? (
                <View
                  style={[
                    styles.fieldCostHighlight,
                    {
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                    Já pagaram
                  </Text>
                  <Text style={[styles.fieldCostHighlightValue, { color: theme.colors.secondary }]}>
                    {fieldPaymentSummary.totalPaidCount}/{fieldCost.splitCount}
                  </Text>
                  {fieldPaymentSummary.paidGuestCount > 0 ? (
                    <Text style={[styles.fieldCostHint, { color: theme.colors.textMuted }]}>
                      Inclui {fieldPaymentSummary.paidGuestCount} pagante(s) extra(s).
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
            {fieldPaymentSummary ? (
              <View style={styles.fieldCostSummaryRow}>
                <View style={styles.fieldCostMetric}>
                  <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                    Recebido
                  </Text>
                  <Text style={[styles.fieldCostValue, { color: theme.colors.text }]}>
                    {formatCurrencyBRL(fieldPaymentSummary.totalReceived)}
                  </Text>
                </View>
                <View style={styles.fieldCostMetric}>
                  <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                    Falta receber
                  </Text>
                  <Text style={[styles.fieldCostValue, { color: theme.colors.text }]}>
                    {formatCurrencyBRL(fieldPaymentSummary.pendingAmount)}
                  </Text>
                  <Text style={[styles.fieldCostHint, { color: theme.colors.textMuted }]}>
                    {fieldPaymentSummary.pendingCount} pessoa(s) pendente(s)
                  </Text>
                </View>
              </View>
            ) : null}
            {fieldCost.note ? (
              <Text style={[styles.fieldCostNote, { color: theme.colors.textMuted }]}>
                {fieldCost.note}
              </Text>
            ) : null}
            {fieldPayment?.responsibleName ? (
              <Text style={[styles.fieldCostNote, { color: theme.colors.textMuted }]}>
                Responsável pelo recebimento: {fieldPayment.responsibleName}
              </Text>
            ) : null}
            {fieldPayment?.pixKey ? (
              <View
                style={[
                  styles.pixCard,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                  Chave Pix
                </Text>
                <Text style={[styles.pixValue, { color: theme.colors.text }]}>
                  {fieldPayment.pixKey}
                </Text>
                <AppButton label="Copiar Pix" variant="secondary" onPress={handleCopyPix} />
              </View>
            ) : null}
            {!canManage && currentPlayer ? (
              <View
                style={[
                  styles.playerPaymentStatus,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Text style={[styles.fieldCostLabel, { color: theme.colors.textMuted }]}>
                  Seu status
                </Text>
                <Text style={[styles.fieldCostValue, { color: theme.colors.text }]}>
                  {isCurrentPlayerMarkedAsPaid ? 'Pago' : 'Pendente'}
                </Text>
              </View>
            ) : null}
            {canManage ? (
              <View style={styles.fieldPaymentAdminSection}>
                <SectionHeader
                  title="Marcar como pago"
                  subtitle={
                    hasUnsavedFieldPayment
                      ? 'Alterações ainda não salvas. Toque em "Salvar controle do campo" para confirmar.'
                      : 'Somente jogadores confirmados entram na lista de pagamento.'
                  }
                />
                {confirmedPlayers.map((player) => {
                  const isPaid = payerPlayerIdsDraft.includes(player.id);

                  return (
                    <View
                      key={player.id}
                      style={[
                        styles.paymentPlayerRow,
                        {
                          backgroundColor: theme.colors.background,
                          borderColor: theme.colors.border,
                        },
                      ]}>
                      <View style={styles.paymentPlayerCopy}>
                        <Text style={[styles.statName, { color: theme.colors.text }]}>
                          #{player.jerseyNumber} {player.nickname}
                        </Text>
                        <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
                          {player.fullName}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleTogglePlayerPaid(player.id)}
                        style={[
                          styles.paymentToggle,
                          {
                            backgroundColor: isPaid
                              ? theme.colors.secondary
                              : theme.colors.surface,
                            borderColor: isPaid
                              ? theme.colors.secondary
                              : theme.colors.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.paymentToggleLabel,
                            {
                              color: isPaid ? '#041008' : theme.colors.text,
                            },
                          ]}>
                          {isPaid ? 'Pago' : 'Marcar como pago'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
                <View style={styles.fieldCostInputs}>
                  <AppInput
                    label="Pagantes extras"
                    value={paidGuestCountDraft}
                    onChangeText={(value) => setPaidGuestCountDraft(value.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                  />
                  <AppInput
                    label="Chave Pix"
                    value={pixKeyDraft}
                    onChangeText={setPixKeyDraft}
                    placeholder="Telefone, CPF, e-mail ou chave aleatória"
                  />
                  <AppInput
                    label="Responsável pelo recebimento"
                    value={responsibleNameDraft}
                    onChangeText={setResponsibleNameDraft}
                    placeholder="Nome de quem está recebendo"
                  />
                </View>
                <View style={styles.buttonRow}>
                  <AppButton
                    label={
                      hasUnsavedFieldPayment
                        ? 'Salvar controle do campo *'
                        : 'Salvar controle do campo'
                    }
                    onPress={() => void handleSaveFieldPayment()}
                    loading={savingFieldPayment}
                  />
                  <AppButton
                    label="Editar valor do campo"
                    variant="secondary"
                    onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
                  />
                </View>
              </View>
            ) : canUsePostGame ? (
              <AppButton
                label="Editar valor do campo"
                variant="secondary"
                onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
              />
            ) : null}
          </View>
        ) : canUsePostGame ? (
          <AppButton
            label="Adicionar valor do campo"
            variant="secondary"
            onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
          />
        ) : (
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>
            Valor do campo ainda não informado.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Local da partida"
          subtitle={currentMatch.locationUrl ? 'Abra o caminho no seu app de mapas.' : 'Endereço informado para o elenco.'}
        />
        <Text style={[styles.locationText, { color: theme.colors.text }]}>
          {currentMatch.venue}
        </Text>
        {currentMatch.locationUrl ? (
          <AppButton
            label="Abrir localização"
            variant="secondary"
            onPress={() => void handleOpenLocation()}
          />
        ) : null}
        {canEditMatchMetadata ? (
          <AppButton
            label="Editar dados da partida"
            variant="secondary"
            onPress={handleOpenEditMeta}
          />
        ) : null}
      </View>

      {canEditMatch ? (
        <View style={styles.section}>
          <SectionHeader title="Ajustes da partida" subtitle="Edite os detalhes ou cancele este jogo" />
          <View style={styles.buttonRow}>
            <AppButton
              label="Editar partida"
              variant="secondary"
              loading={navigatingEdit}
              disabled={!canEditMatch}
              onPress={handleEditMatch}
            />
            <AppButton
              label="Cancelar partida"
              variant="danger"
              onPress={() => void handleCancelMatch()}
            />
          </View>
        </View>
      ) : null}

      {currentMatch.status === 'canceled' ? (
        <EmptyState
          title="Partida cancelada"
          description="Essa partida foi retirada do fluxo normal do time e não recebe mais presença nem escalação."
        />
      ) : null}

      {shouldPromptFinish ? (
        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.secondary,
            },
          ]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>
            Esta partida já aconteceu
          </Text>
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>
            Encerre o jogo para registrar o resultado, as estatísticas e liberar as interações de pós-jogo.
          </Text>
          <AppButton
            label="Encerrar jogo"
            onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
          />
        </View>
      ) : null}

      {canUsePlayerActions &&
      canEditAttendance ? (
        <View style={styles.section}>
          <SectionHeader
            title="Sua presença"
            subtitle={`Status atual: ${ATTENDANCE_STATUS_LABELS[myAttendance?.status ?? 'pending']}`}
          />
          {currentPlayer ? (
            <View style={styles.buttonRow}>
              <AppButton
                label="Vou jogar"
                disabled={myAttendance?.status === 'confirmed'}
                onPress={() => void respond(currentPlayer.id, 'confirmed', 'own')}
              />
              <AppButton
                label="Não vou"
                variant="danger"
                disabled={myAttendance?.status === 'absent'}
                onPress={() => void respond(currentPlayer.id, 'absent', 'own')}
              />
              <AppButton
                label="Limpar presença"
                variant="ghost"
                disabled={myAttendance?.status === 'pending'}
                onPress={() => void respond(currentPlayer.id, 'pending', 'own')}
              />
            </View>
          ) : (
            <Text style={[styles.description, { color: theme.colors.textMuted }]}>
              Estamos preparando sua participação no elenco para esta partida.
            </Text>
          )}
        </View>
      ) : null}

      {canManage && canEditAttendance ? (
        <View style={styles.section}>
          <SectionHeader
            title="Presença do elenco"
            subtitle="Como admin, você pode ajustar a resposta de qualquer jogador."
          />
          {teamPlayers.map((player) => {
            const attendance = attendanceByPlayerId.get(player.id) ?? null;
            const isCurrentPlayer = currentPlayer?.id === player.id;

            return (
              <View
                key={player.id}
                style={[
                  styles.attendanceAdminCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <View style={styles.attendanceAdminHeader}>
                  <View style={styles.attendanceAdminCopy}>
                    <Text style={[styles.statName, { color: theme.colors.text }]}>
                      #{player.jerseyNumber} {player.nickname}
                    </Text>
                    <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
                      {ATTENDANCE_STATUS_LABELS[attendance?.status ?? 'pending']}
                      {isCurrentPlayer ? ' - sua conta' : ''}
                    </Text>
                  </View>
                  <Pill
                    label={ATTENDANCE_STATUS_LABELS[attendance?.status ?? 'pending']}
                    color={theme.colors.secondary}
                  />
                </View>
                <View style={styles.buttonRow}>
                  <AppButton
                    label="Vou jogar"
                    variant="secondary"
                    disabled={attendance?.status === 'confirmed'}
                    onPress={() => void respond(player.id, 'confirmed', 'admin')}
                  />
                  <AppButton
                    label="Não vou"
                    variant="danger"
                    disabled={attendance?.status === 'absent'}
                    onPress={() => void respond(player.id, 'absent', 'admin')}
                  />
                  <AppButton
                    label="Limpar presença"
                    variant="ghost"
                    disabled={attendance?.status === 'pending'}
                    onPress={() => void respond(player.id, 'pending', 'admin')}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {canEditParticipants ? (
        <View style={styles.section}>
          <SectionHeader
            title="Editar participantes"
            subtitle="Adicione ou remova jogadores desta partida encerrada ou cancelada."
          />
          {teamPlayers.map((player) => {
            const attendance = attendanceByPlayerId.get(player.id) ?? null;
            const isToggling = togglingParticipantId === player.id;

            return (
              <View
                key={player.id}
                style={[
                  styles.attendanceAdminCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <View style={styles.attendanceAdminHeader}>
                  <View style={styles.attendanceAdminCopy}>
                    <Text style={[styles.statName, { color: theme.colors.text }]}>
                      #{player.jerseyNumber} {player.nickname}
                    </Text>
                    <Text style={[styles.playerSub, { color: theme.colors.textMuted }]}>
                      {ATTENDANCE_STATUS_LABELS[attendance?.status ?? 'pending']}
                    </Text>
                  </View>
                  <Pill
                    label={ATTENDANCE_STATUS_LABELS[attendance?.status ?? 'pending']}
                    color={theme.colors.secondary}
                  />
                </View>
                <View style={styles.buttonRow}>
                  <AppButton
                    label="Adicionar"
                    variant="secondary"
                    disabled={isToggling || attendance?.status === 'confirmed'}
                    onPress={() => void handleToggleParticipant(player.id, 'confirmed')}
                  />
                  <AppButton
                    label="Remover"
                    variant="danger"
                    disabled={isToggling || attendance?.status === 'absent'}
                    onPress={() => void handleToggleParticipant(player.id, 'absent')}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {currentMatch.status !== 'finished' && currentMatch.status !== 'canceled' ? (
        <View style={styles.section}>
          <SectionHeader
            title="Escalação"
            subtitle={lineup ? 'Escalação salva para esta partida.' : 'Monte a arte da escalação do jogo.'}
          />
          <AppButton
            label="Abrir escalação visual"
            variant="secondary"
            onPress={() => router.push(`/lineup/${currentMatch.id}`)}
          />
        </View>
      ) : null}

      {canUsePostGame ? (
        <View style={styles.section}>
          <SectionHeader
            title={currentMatch.status === 'finished' ? 'Editar estatísticas do jogo' : 'Pós-jogo'}
            subtitle={
              currentMatch.status === 'finished'
                ? 'Revisar placar, gols e assistências'
                : shouldPromptFinish
                  ? 'Esta partida já aconteceu. Encerre o jogo para registrar o resultado.'
                  : 'Encerrar a partida e registrar estatísticas'
            }
          />
          <AppButton
            label={currentMatch.status === 'finished' ? 'Editar estatísticas' : 'Encerrar jogo'}
            onPress={() => router.push(`/matches/${currentMatch.id}/finish`)}
          />
        </View>
      ) : null}

      {currentMatch.status === 'finished' ? (
        <>
          <View style={styles.section}>
            <SectionHeader
              title="Interações pós-jogo"
              subtitle="MVP e notas ficam disponíveis para jogadores confirmados"
            />
            <View style={styles.buttonRow}>
              <AppButton
                label={canVoteMvp ? 'Votar MVP' : 'Ver MVP'}
                variant="secondary"
                onPress={() => router.push(`/matches/${currentMatch.id}/mvp`)}
              />
              <AppButton
                label={canRatePlayers ? 'Avaliar jogadores' : 'Ver notas'}
                variant="secondary"
                onPress={() => router.push(`/matches/${currentMatch.id}/ratings`)}
              />
            </View>
          </View>

          {matchStats.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Resumo técnico" subtitle="Gols e assistências da partida" />
              {matchStats.map((stat) => {
                const player = confirmedPlayers.find((item) => item.id === stat.playerId);
                if (!player) {
                  return null;
                }

                return (
                  <View
                    key={stat.id}
                    style={[
                      styles.statRow,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}>
                    <Text style={[styles.statName, { color: theme.colors.text }]}>
                      #{player.jerseyNumber} {player.nickname}
                    </Text>
                    <View style={styles.statPills}>
                      <Pill
                        label={`${PLAYER_STATS_LABELS.goals}: ${stat.goals}`}
                        color={theme.colors.secondary}
                      />
                      <Pill
                        label={`${PLAYER_STATS_LABELS.assists}: ${stat.assists}`}
                        backgroundColor={theme.colors.primarySoft}
                        borderColor={theme.colors.primary}
                        textColor={theme.colors.text}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {canManage ? (
            <>
              {mvpRankingItems.length > 0 ? (
                <RankingList title="Placar do MVP" items={mvpRankingItems} />
              ) : (
                <EmptyState
                  title="Sem votos de MVP"
                  description="O admin consegue acompanhar o placar do MVP assim que os jogadores votarem."
                />
              )}
              {ratingsRankingItems.length > 0 ? (
                <RankingList title="Nota geral da partida" items={ratingsRankingItems} />
              ) : (
                <EmptyState
                  title="Sem notas ainda"
                  description="As avaliações anônimas vão aparecer aqui assim que forem enviadas."
                />
              )}

              <View style={styles.section}>
                <SectionHeader
                  title="MVP manual"
                  subtitle={
                    manualMvpCurrentPlayerId
                      ? `MVP definido manualmente: ${playerById.get(manualMvpCurrentPlayerId)?.nickname ?? 'jogador'}`
                      : 'Nenhum MVP manual. O sistema usa os votos automaticamente.'
                  }
                />
                {confirmedPlayers.map((player) => {
                  const isSelected = effectiveMvpDraftId === player.id;
                  return (
                    <View
                      key={player.id}
                      style={[
                        styles.attendanceAdminCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: isSelected ? theme.colors.secondary : theme.colors.border,
                        },
                      ]}>
                      <View style={styles.attendanceAdminHeader}>
                        <Text style={[styles.statName, { color: theme.colors.text }]}>
                          #{player.jerseyNumber} {player.nickname}
                        </Text>
                        <AppButton
                          label={isSelected ? 'Selecionado' : 'Selecionar'}
                          variant={isSelected ? 'secondary' : 'ghost'}
                          disabled={savingManualMvp}
                          onPress={() =>
                            setManualMvpDraftPlayerId(isSelected ? null : player.id)
                          }
                        />
                      </View>
                    </View>
                  );
                })}
                <View style={styles.buttonRow}>
                  <AppButton
                    label="Salvar MVP manual"
                    disabled={savingManualMvp || !isMvpDraftChanged || effectiveMvpDraftId === null}
                    onPress={() => void handleSaveManualMvp()}
                  />
                  {manualMvpCurrentPlayerId ? (
                    <AppButton
                      label="Limpar MVP manual"
                      variant="ghost"
                      disabled={savingManualMvp}
                      onPress={() => void handleClearManualMvp()}
                    />
                  ) : null}
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {canManage ? (
        <View style={styles.section}>
          <SectionHeader
            title="Zona de risco"
            subtitle="Ações irreversíveis para administradores."
          />
          <AppButton
            label={savingDeleteMatch ? 'Excluindo...' : 'Excluir partida'}
            variant="danger"
            disabled={savingDeleteMatch}
            onPress={handleDeleteMatch}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title="Diário da partida"
          subtitle={
            diaryEntries.length > 0
              ? `${diaryEntries.length} resenha(s) publicadas para o elenco`
              : canManage
                ? 'Conte a história dessa partida para o elenco.'
                : 'Ainda não há resenha desta partida.'
          }
          actionLabel={canManage ? 'Nova resenha' : undefined}
          onAction={canManage ? () => handleOpenDiaryEntry() : undefined}
        />

        {diaryEntries.length === 0 ? (
          <EmptyState
            title={canManage ? 'Diário vazio por enquanto' : 'Sem resenha publicada'}
            description={
              canManage
                ? 'Publique uma resenha, destaque jogadores e compartilhe o clima da partida com o elenco.'
                : 'Quando a comissão publicar a resenha, ela vai aparecer aqui.'
            }
            actionLabel={canManage ? 'Nova resenha' : undefined}
            onAction={canManage ? () => handleOpenDiaryEntry() : undefined}
          />
        ) : (
          diaryEntries.map((entry) => (
            <MatchDiaryEntryCard
              key={entry.id}
              entry={entry}
              mentionedPlayers={entry.mentionedPlayerIds
                .map((playerId) => playerById.get(playerId))
                .filter((player): player is Player => Boolean(player))}
              onPressMention={(playerId) => router.push(`/players/${playerId}`)}
              onEdit={canManage ? () => handleOpenDiaryEntry(entry.id) : undefined}
              onDelete={canManage ? () => handleDeleteDiaryEntry(entry.id) : undefined}
            />
          ))
        )}
      </View>

      <AttendanceSection title="Confirmados" players={buckets.confirmed} />
      <AttendanceSection title="Ausentes" players={buckets.absent} />
      <AttendanceSection title="Pendentes" players={buckets.pending} />

      <ConfirmModal
        visible={cancelMatchModalVisible}
        title="Cancelar partida"
        description="Essa partida vai sair do fluxo normal do time. Você pode editar os detalhes depois se precisar."
        confirmLabel="Cancelar partida"
        cancelLabel="Voltar"
        onConfirm={() => void confirmCancelMatch()}
        onCancel={() => setCancelMatchModalVisible(false)}
        loading={savingCancelMatch}
        destructive
      />
      <ConfirmModal
        visible={deleteDiaryEntryId !== null}
        title="Excluir resenha"
        description="Essa publicação sai do diário da partida e remove as notificações vinculadas."
        confirmLabel="Excluir"
        cancelLabel="Voltar"
        onConfirm={() => void confirmDeleteDiaryEntry()}
        onCancel={() => setDeleteDiaryEntryId(null)}
        loading={savingDeleteDiary}
        destructive
      />
      <ConfirmModal
        visible={deleteMatchModalVisible}
        title="Excluir partida?"
        description="Essa ação remove a partida das listas, mas preserva o histórico interno."
        confirmLabel="Excluir partida"
        onConfirm={() => void confirmDeleteMatch()}
        onCancel={() => setDeleteMatchModalVisible(false)}
        loading={savingDeleteMatch}
        destructive
      />

      <Modal
        visible={editMetaModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingEditMeta) setEditMetaModalVisible(false);
        }}
      >
        <Pressable
          style={styles.overlay}
          onPress={savingEditMeta ? undefined : () => setEditMetaModalVisible(false)}
        >
          <Pressable
            style={[
              styles.editMetaCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
            onPress={() => {}}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.editMetaTitle, { color: theme.colors.text }]}>
                Editar dados da partida
              </Text>
              <View style={styles.editMetaFields}>
                <View style={styles.editMetaRow}>
                  <View style={styles.editMetaHalf}>
                    <AppInput
                      label="Data"
                      keyboardType="number-pad"
                      value={editMetaDateDraft}
                      onChangeText={setEditMetaDateDraft}
                      placeholder="DD/MM/AAAA"
                      editable={!savingEditMeta}
                    />
                  </View>
                  <View style={styles.editMetaHalf}>
                    <AppInput
                      label="Horário"
                      keyboardType="numbers-and-punctuation"
                      value={editMetaTimeDraft}
                      onChangeText={setEditMetaTimeDraft}
                      placeholder="HH:mm"
                      editable={!savingEditMeta}
                    />
                  </View>
                </View>
                <AppInput
                  label="Local"
                  value={editMetaVenueDraft}
                  onChangeText={setEditMetaVenueDraft}
                  placeholder="Nome do campo"
                  editable={!savingEditMeta}
                />
                <AppInput
                  label="Link da localização"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={editMetaLocationUrlDraft}
                  onChangeText={setEditMetaLocationUrlDraft}
                  placeholder="Link do Google Maps (opcional)"
                  editable={!savingEditMeta}
                />
                <Text style={[styles.editMetaFieldLabel, { color: theme.colors.textMuted }]}>
                  Tipo de partida
                </Text>
                <View style={styles.editMetaChipRow}>
                  {(['society', 'futsal', 'field', 'training'] as MatchType[]).map((type) => {
                    const selected = editMetaMatchTypeDraft === type;
                    return (
                      <Pressable
                        key={type}
                        disabled={savingEditMeta}
                        onPress={() => setEditMetaMatchTypeDraft(type)}
                        style={[
                          styles.editMetaChip,
                          {
                            backgroundColor: selected
                              ? theme.colors.primarySoft
                              : theme.colors.surfaceMuted,
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.editMetaChipLabel, { color: theme.colors.text }]}>
                          {MATCH_TYPE_LABELS[type]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {editMetaError ? (
                  <Text style={[styles.editMetaError, { color: theme.colors.danger }]}>
                    {editMetaError}
                  </Text>
                ) : null}
                <View style={styles.buttonRow}>
                  <AppButton
                    label="Cancelar"
                    variant="ghost"
                    disabled={savingEditMeta}
                    onPress={() => setEditMetaModalVisible(false)}
                  />
                  <AppButton
                    label="Salvar alterações"
                    loading={savingEditMeta}
                    disabled={savingEditMeta}
                    onPress={() => void handleSaveEditMeta()}
                  />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function AttendanceSection({ title, players }: { title: string; players: Player[] }) {
  const theme = useAppTheme();

  return (
    <View style={styles.section}>
      <SectionHeader title={title} subtitle={`${players.length} jogador(es)`} />
      <View style={styles.namesWrap}>
        {players.map((player) => (
          <Pill key={player.id} label={player.nickname} color={theme.colors.textMuted} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
  },
  section: {
    gap: 12,
  },
  fieldCostCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  fieldCostSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  fieldCostMetric: {
    flex: 1,
    minWidth: 150,
    gap: 4,
  },
  fieldCostLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  fieldCostValue: {
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: '800',
  },
  fieldCostHighlight: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  fieldCostHighlightValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
  fieldCostHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldCostNote: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  pixCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  pixValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  playerPaymentStatus: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  fieldPaymentAdminSection: {
    gap: 12,
  },
  paymentPlayerRow: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  paymentPlayerCopy: {
    flex: 1,
    gap: 4,
  },
  paymentToggle: {
    minHeight: 42,
    minWidth: 132,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentToggleLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
  },
  fieldCostInputs: {
    gap: 12,
  },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  noticeTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  attendanceAdminCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  attendanceAdminHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  attendanceAdminCopy: {
    flex: 1,
    gap: 4,
  },
  statRow: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  statName: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  playerSub: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  statPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  namesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  locationText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  editMetaCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  editMetaTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  editMetaFields: {
    gap: 14,
  },
  editMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editMetaHalf: {
    flex: 1,
  },
  editMetaFieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  editMetaChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  editMetaChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  editMetaChipLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  editMetaError: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});
