import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { TOOL_COLORS } from '@/components/tools/tool-theme';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import {
  TIMER_DEFAULTS,
  computeRemainingMs,
  hasActiveRodizio,
  hasActiveSession,
  rehydratePickupToolsState,
  usePickupToolsStore,
} from '@/store/pickup-tools-store';

const C = TOOL_COLORS;

function formatMs(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const FAQ = [
  {
    q: 'O cronômetro zera ao atualizar a página?',
    a: 'Não. O estado da pelada — tempo, placar e configuração — fica salvo no dispositivo. Ao recarregar, a sessão é restaurada automaticamente.',
  },
  {
    q: 'Posso configurar qualquer tempo, por exemplo 7 minutos?',
    a: 'Sim. Digite o número de minutos no campo "Duração" antes de iniciar. O campo aceita qualquer valor inteiro de 1 a 99.',
  },
  {
    q: 'Posso usar sem limite de gols?',
    a: 'Sim. Deixe o campo "Limite de gols" em 0. O jogo termina apenas quando o tempo acabar.',
  },
  {
    q: 'Como integrar com o rodízio?',
    a: 'Configure o rodízio primeiro. O cronômetro exibe os times em campo para que você acompanhe quem está jogando.',
  },
];

export default function CronometroScreen() {
  const store = usePickupToolsStore();
  const {
    durationMs,
    isRunning,
    teamAScore,
    teamBScore,
    goalLimit,
    winner,
    teamA: rodizioA,
    teamB: rodizioB,
    phase: rodizioPhase,
  } = store;

  const [displayMs, setDisplayMs] = useState(() => computeRemainingMs(store));
  const [minutesInput, setMinutesInput] = useState(String(Math.round(durationMs / 60000)));
  const [goalLimitInput, setGoalLimitInput] = useState(String(goalLimit));
  const [inputError, setInputError] = useState<string | null>(null);

  const sessionActive = hasActiveSession(store);
  const gameStarted = sessionActive && (isRunning || winner !== null || store.remainingMsWhenPaused < durationMs);
  const gameOver = winner !== null;
  const hasResult = gameOver;

  useEffect(() => {
    rehydratePickupToolsState();
    setDisplayMs(computeRemainingMs(usePickupToolsStore.getState()));
  }, []);

  useEffect(() => {
    const s = usePickupToolsStore.getState();
    if (s.isRunning && s.winner === null) {
      const remaining = computeRemainingMs(s);
      if (remaining <= 0) {
        const { teamAScore: a, teamBScore: b } = s;
        usePickupToolsStore.setState({
          isRunning: false,
          startedAt: null,
          remainingMsWhenPaused: 0,
          winner: a > b ? 'A' : b > a ? 'B' : 'draw',
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRunning) {
      setDisplayMs(computeRemainingMs(store));
      return;
    }
    const id = setInterval(() => {
      const remaining = computeRemainingMs(usePickupToolsStore.getState());
      setDisplayMs(remaining);
      if (remaining <= 0) {
        const { teamAScore: a, teamBScore: b } = usePickupToolsStore.getState();
        usePickupToolsStore.setState({
          isRunning: false,
          startedAt: null,
          remainingMsWhenPaused: 0,
          winner: a > b ? 'A' : b > a ? 'B' : 'draw',
        });
      }
    }, 200);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  function handleStart() {
    const mins = parseInt(minutesInput, 10);
    const limit = parseInt(goalLimitInput, 10);
    if (!mins || mins < 1 || mins > 99) {
      setInputError('Duração inválida. Use um número de 1 a 99.');
      return;
    }
    if (isNaN(limit) || limit < 0) {
      setInputError('Limite de gols inválido. Use 0 para sem limite.');
      return;
    }
    setInputError(null);
    usePickupToolsStore.getState().configureTimer(mins * 60 * 1000, limit);
    usePickupToolsStore.getState().startTimer();
  }

  function handleToggle() {
    if (isRunning) {
      store.pauseTimer();
    } else {
      store.startTimer();
    }
  }

  function handleReset() {
    store.resetAll();
    setMinutesInput('10');
    setGoalLimitInput('2');
    setInputError(null);
    setDisplayMs(TIMER_DEFAULTS.durationMs);
  }

  const winnerLabel =
    winner === 'A'
      ? 'Vencedor: Time A'
      : winner === 'B'
        ? 'Vencedor: Time B'
        : winner === 'draw'
          ? 'Empate!'
          : null;

  const showRodizio = hasActiveRodizio({
    phase: rodizioPhase,
    teamA: rodizioA,
    teamB: rodizioB,
  });

  return (
    <ToolPageShell
      title="Cronômetro"
      subtitle="Tempo, placar e limite de gols."
      compactHero>

      {/* Session banner */}
      {sessionActive ? (
        <View style={[styles.sessionBanner, { backgroundColor: 'rgba(22,163,74,0.09)', borderColor: 'rgba(22,163,74,0.3)' }]}>
          <Text style={[styles.sessionBannerText, { color: '#15803D' }]}>
            Continuando pelada salva neste dispositivo.
          </Text>
        </View>
      ) : (
        <View style={[styles.sessionBanner, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[styles.sessionBannerText, { color: C.textMuted }]}>
            Sessão salva neste dispositivo.
          </Text>
        </View>
      )}

      {/* Config panel — only when game hasn't started */}
      {!gameStarted ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Configurar partida</Text>

          <View style={styles.configRow}>
            <View style={styles.configField}>
              <Text style={styles.configLabel}>Duração (minutos)</Text>
              <TextInput
                value={minutesInput}
                onChangeText={setMinutesInput}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.configInput}
                placeholder="10"
                placeholderTextColor={C.textMuted}
              />
            </View>

            <View style={styles.configField}>
              <Text style={styles.configLabel}>Limite de gols (0 = sem limite)</Text>
              <TextInput
                value={goalLimitInput}
                onChangeText={setGoalLimitInput}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.configInput}
                placeholder="2"
                placeholderTextColor={C.textMuted}
              />
            </View>
          </View>

          {inputError ? (
            <Text style={styles.errorText}>{inputError}</Text>
          ) : null}

          <Pressable onPress={handleStart} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Iniciar pelada</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        <View style={styles.timerRow}>
          <Text style={[styles.timer, { color: gameOver ? C.accent : C.text }]}>
            {formatMs(displayMs)}
          </Text>
          {goalLimit > 0 ? (
            <Text style={styles.goalLimitLabel}>
              limite: {goalLimit} gol{goalLimit > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>

        {winnerLabel ? (
          <Text style={styles.winnerLabel}>{winnerLabel}</Text>
        ) : null}

        <View style={styles.scoreRow}>
          <View style={styles.teamBlock}>
            <Text style={styles.teamName}>Time A</Text>
            <Text style={styles.score}>{teamAScore}</Text>
            <Pressable
              onPress={() => store.addGoal('A')}
              disabled={gameOver}
              style={[
                styles.goalButton,
                { backgroundColor: gameOver ? C.cardMuted : '#16A34A', borderColor: gameOver ? C.border : '#16A34A' },
              ]}>
              <Text style={[styles.goalButtonText, { color: gameOver ? C.textMuted : '#FFF' }]}>
                + Gol
              </Text>
            </Pressable>
          </View>

          <Text style={styles.vs}>×</Text>

          <View style={styles.teamBlock}>
            <Text style={styles.teamName}>Time B</Text>
            <Text style={styles.score}>{teamBScore}</Text>
            <Pressable
              onPress={() => store.addGoal('B')}
              disabled={gameOver}
              style={[
                styles.goalButton,
                { backgroundColor: gameOver ? C.cardMuted : '#16A34A', borderColor: gameOver ? C.border : '#16A34A' },
              ]}>
              <Text style={[styles.goalButtonText, { color: gameOver ? C.textMuted : '#FFF' }]}>
                + Gol
              </Text>
            </Pressable>
          </View>
        </View>

        {gameStarted ? (
          <View style={styles.controlsRow}>
            {!gameOver ? (
              <Pressable onPress={handleToggle} style={styles.controlButton}>
                <Text style={styles.controlButtonText}>{isRunning ? 'Pausar' : 'Continuar'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={handleReset}
              style={[styles.controlButton, { backgroundColor: C.cardMuted, borderColor: C.border, borderWidth: 1 }]}>
              <Text style={[styles.controlButtonText, { color: C.textMuted }]}>
                Resetar pelada
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Rodízio info */}
      {showRodizio ? (
        <View style={styles.rodizioInfo}>
          <Text style={styles.rodizioTitle}>Times no campo (rodízio)</Text>
          <View style={styles.rodizioTeams}>
            <View style={styles.rodizioTeam}>
              <Text style={styles.rodizioTeamLabel}>Time A</Text>
              <Text style={styles.rodizioPlayers}>{rodizioA.join(', ')}</Text>
            </View>
            <Text style={[styles.vs, { color: C.textMuted, fontSize: 20 }]}>×</Text>
            <View style={styles.rodizioTeam}>
              <Text style={styles.rodizioTeamLabel}>Time B</Text>
              <Text style={styles.rodizioPlayers}>{rodizioB.join(', ')}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => router.push('/ferramentas/rodizio-de-times' as never)}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Abrir rodízio</Text>
          </Pressable>
        </View>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.tipsSection}>
        <Text style={styles.sectionTitle}>Regras comuns para adaptar</Text>
        <View style={styles.tipsList}>
          {[
            'Peladas curtas: 10 minutos ou 2 gols — o que vier primeiro.',
            'Campos society: 15 ou 20 minutos para partidas mais competitivas.',
            'Rachão com muita gente: use 2 gols para rodar mais times.',
            'Empate sem ganhador: sem limite de gols, respeite só o tempo.',
          ].map((tip, i) => (
            <View key={i} style={styles.tipItem}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.faqList}>
        {FAQ.map((item) => (
          <View key={item.q} style={styles.faqCard}>
            <Text style={styles.faqQ}>{item.q}</Text>
            <Text style={styles.faqA}>{item.a}</Text>
          </View>
        ))}
      </View>

      <SafeAd placement={AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS} hasContent />

      <View style={styles.relatedLinks}>
        <Text style={styles.relatedTitle}>Outras ferramentas</Text>
        <View style={styles.relatedRow}>
          {[
            { label: 'Sorteador de Times', href: '/ferramentas/sorteador-de-times' },
            { label: 'Rodízio de Times', href: '/ferramentas/rodizio-de-times' },
            { label: 'Campeonato Rápido', href: '/ferramentas/campeonato-rapido' },
          ].map((link) => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href as never)}
              style={styles.relatedChip}>
              <Text style={styles.relatedChipText}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ToolPageShell>
  );
}

const styles = StyleSheet.create({
  sessionBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sessionBannerText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 16, backgroundColor: C.card, borderColor: C.border },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800', color: C.text },
  configRow: { flexDirection: 'row', gap: 12 },
  configField: { flex: 1, gap: 6 },
  configLabel: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.textMuted },
  configInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    backgroundColor: C.cardMuted,
    borderColor: C.border,
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: '#EF4444' },
  primaryButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#16A34A' },
  primaryButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#16A34A',
  },
  secondaryButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: '#16A34A' },
  scoreboard: { borderWidth: 1, borderRadius: 28, padding: 24, gap: 20, alignItems: 'center', backgroundColor: C.card, borderColor: C.borderStrong },
  timerRow: { alignItems: 'center', gap: 4 },
  timer: { fontFamily: fonts.display, fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  goalLimitLabel: { fontFamily: fonts.body, fontSize: 12, color: C.textMuted },
  winnerLabel: { fontFamily: fonts.heading, fontSize: 22, fontWeight: '800', textAlign: 'center', color: '#22C55E' },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
    width: '100%',
    justifyContent: 'center',
  },
  teamBlock: { alignItems: 'center', gap: 10 },
  teamName: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.textMuted },
  score: { fontFamily: fonts.display, fontSize: 72, fontWeight: '900', lineHeight: 80, color: C.text },
  goalButton: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
    borderWidth: 1,
  },
  goalButtonText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  vs: { fontFamily: fonts.display, fontSize: 32, fontWeight: '900', color: C.textMuted },
  controlsRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  controlButton: {
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 120,
    alignItems: 'center',
    backgroundColor: '#16A34A',
  },
  controlButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  rodizioInfo: { borderWidth: 1.5, borderRadius: 20, padding: 16, gap: 12, borderColor: '#16A34A', backgroundColor: C.card },
  rodizioTitle: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800', color: '#16A34A' },
  rodizioTeams: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rodizioTeam: { flex: 1, gap: 4 },
  rodizioTeamLabel: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '700', color: C.textMuted },
  rodizioPlayers: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: C.text },
  tipsSection: { gap: 12 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800', color: C.text },
  tipsList: { gap: 10 },
  tipItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tipBullet: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: '#16A34A' },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: C.textMuted },
  faqList: { gap: 12 },
  faqCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, backgroundColor: C.card, borderColor: C.border },
  faqQ: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800', color: C.text },
  faqA: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: C.textMuted },
  relatedLinks: { gap: 12 },
  relatedTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800', color: C.text },
  relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  relatedChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.card, borderColor: C.border },
  relatedChipText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.accentLight },
});
