import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const DURATION_OPTIONS = [5, 10, 15, 20];
const GOAL_LIMIT_OPTIONS = [0, 1, 2, 3, 4, 5];

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Winner = 'A' | 'B' | 'draw' | null;

const FAQ = [
  {
    q: 'O cronômetro funciona em segundo plano?',
    a: 'O cronômetro roda apenas enquanto a página estiver aberta no navegador. Se você minimizar ou trocar de aba, o tempo continua contando, mas pode ter variação em alguns dispositivos.',
  },
  {
    q: 'Como configurar um jogo de 7 minutos?',
    a: 'Escolha "5 min" ou "10 min" e use o botão de reset antes de iniciar. No momento, a ferramenta oferece as durações 5, 10, 15 e 20 minutos.',
  },
  {
    q: 'Posso usar sem limite de gols?',
    a: 'Sim. Selecione "Sem limite" nas opções de gols. O jogo termina apenas quando o tempo acabar.',
  },
  {
    q: 'O que acontece quando o tempo acaba?',
    a: 'O cronômetro para automaticamente e exibe o vencedor pelo placar. Em caso de empate, é exibido "Empate".',
  },
];

export default function CronometroScreen() {
  const theme = useAppTheme();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreARef = useRef(0);
  const scoreBRef = useRef(0);

  const [duration, setDuration] = useState(10);
  const [goalLimit, setGoalLimit] = useState(2);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10 * 60);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [winner, setWinner] = useState<Winner>(null);

  useEffect(() => {
    if (!started) {
      setTimeLeft(duration * 60);
    }
  }, [duration, started]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setRunning(false);
            const wa = scoreARef.current;
            const wb = scoreBRef.current;
            setWinner(wa > wb ? 'A' : wa < wb ? 'B' : 'draw');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function endGame(result: Winner) {
    setWinner(result);
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  function addGoal(team: 'A' | 'B') {
    if (winner) return;
    if (team === 'A') {
      const next = scoreARef.current + 1;
      scoreARef.current = next;
      setScoreA(next);
      if (goalLimit > 0 && next >= goalLimit) {
        endGame('A');
      }
    } else {
      const next = scoreBRef.current + 1;
      scoreBRef.current = next;
      setScoreB(next);
      if (goalLimit > 0 && next >= goalLimit) {
        endGame('B');
      }
    }
  }

  function toggleRunning() {
    if (winner) return;
    if (!started) setStarted(true);
    setRunning((prev) => !prev);
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    setStarted(false);
    setWinner(null);
    setScoreA(0);
    setScoreB(0);
    scoreARef.current = 0;
    scoreBRef.current = 0;
    setTimeLeft(duration * 60);
  }

  const gameOver = winner !== null;
  const hasResult = gameOver;

  const winnerLabel =
    winner === 'A'
      ? 'Vencedor: Time A'
      : winner === 'B'
        ? 'Vencedor: Time B'
        : winner === 'draw'
          ? 'Empate!'
          : null;

  return (
    <PublicPageShell
      eyebrow="Ferramenta gratuita"
      title="Cronômetro de Pelada"
      description="Controle o tempo de cada partida, registre gols e veja quem ganhou. Configure a duração e o limite de gols de acordo com a regra do seu grupo."
      actions={[
        { label: 'Sorteador', href: '/ferramentas/sorteador-de-times', variant: 'secondary' },
        { label: 'Rodízio', href: '/ferramentas/rodizio-de-times', variant: 'ghost' },
      ]}>
      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: theme.colors.text }]}>
          Como usar o cronômetro
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Escolha a duração do jogo e o limite de gols (ou sem limite), depois clique em
          "Iniciar". Adicione gols para cada time à medida que o jogo avança. O jogo encerra
          automaticamente quando o tempo acabar ou quando algum time atingir o limite de gols.
        </Text>
      </View>

      {!started ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Configurar partida</Text>

          <View style={styles.configSection}>
            <Text style={[styles.configLabel, { color: theme.colors.textMuted }]}>
              Duração do jogo
            </Text>
            <View style={styles.optionsRow}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDuration(d)}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor:
                        duration === d ? theme.colors.primary : theme.colors.backgroundElevated,
                      borderColor: duration === d ? theme.colors.primary : theme.colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: duration === d ? '#FFFFFF' : theme.colors.textMuted },
                    ]}>
                    {d} min
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.configSection}>
            <Text style={[styles.configLabel, { color: theme.colors.textMuted }]}>
              Limite de gols por time
            </Text>
            <View style={styles.optionsRow}>
              {GOAL_LIMIT_OPTIONS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGoalLimit(g)}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor:
                        goalLimit === g ? theme.colors.primary : theme.colors.backgroundElevated,
                      borderColor: goalLimit === g ? theme.colors.primary : theme.colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: goalLimit === g ? '#FFFFFF' : theme.colors.textMuted },
                    ]}>
                    {g === 0 ? 'Sem limite' : String(g)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.scoreboard,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}>
        <View style={styles.timerRow}>
          <Text style={[styles.timer, { color: gameOver ? theme.colors.secondary : theme.colors.text }]}>
            {formatTime(timeLeft)}
          </Text>
          {goalLimit > 0 ? (
            <Text style={[styles.goalLimitLabel, { color: theme.colors.textMuted }]}>
              limite: {goalLimit} gol{goalLimit > 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>

        {winnerLabel ? (
          <Text style={[styles.winnerLabel, { color: theme.colors.secondary }]}>
            {winnerLabel}
          </Text>
        ) : null}

        <View style={styles.scoreRow}>
          <View style={styles.teamBlock}>
            <Text style={[styles.teamName, { color: theme.colors.textMuted }]}>Time A</Text>
            <Text style={[styles.score, { color: theme.colors.text }]}>{scoreA}</Text>
            <Pressable
              onPress={() => addGoal('A')}
              disabled={gameOver}
              style={[
                styles.goalButton,
                {
                  backgroundColor: gameOver
                    ? theme.colors.backgroundElevated
                    : theme.colors.primary,
                  borderColor: gameOver ? theme.colors.border : theme.colors.primary,
                },
              ]}>
              <Text style={[styles.goalButtonText, { color: gameOver ? theme.colors.textMuted : '#FFF' }]}>
                + Gol
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.vs, { color: theme.colors.textMuted }]}>×</Text>

          <View style={styles.teamBlock}>
            <Text style={[styles.teamName, { color: theme.colors.textMuted }]}>Time B</Text>
            <Text style={[styles.score, { color: theme.colors.text }]}>{scoreB}</Text>
            <Pressable
              onPress={() => addGoal('B')}
              disabled={gameOver}
              style={[
                styles.goalButton,
                {
                  backgroundColor: gameOver
                    ? theme.colors.backgroundElevated
                    : theme.colors.primary,
                  borderColor: gameOver ? theme.colors.border : theme.colors.primary,
                },
              ]}>
              <Text style={[styles.goalButtonText, { color: gameOver ? theme.colors.textMuted : '#FFF' }]}>
                + Gol
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.controlsRow}>
          {!gameOver ? (
            <Pressable
              onPress={toggleRunning}
              style={[styles.controlButton, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.controlButtonText}>{running ? 'Pausar' : 'Iniciar'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={reset}
            style={[
              styles.controlButton,
              {
                backgroundColor: theme.colors.backgroundElevated,
                borderColor: theme.colors.border,
                borderWidth: 1,
              },
            ]}>
            <Text style={[styles.controlButtonText, { color: theme.colors.textMuted }]}>
              Reiniciar
            </Text>
          </Pressable>
        </View>
      </View>

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.tipsSection}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Regras comuns para adaptar
        </Text>
        <View style={styles.tipsList}>
          {[
            'Peladas curtas costumam usar 10 minutos ou 2 gols, o que acontecer primeiro.',
            'Em campos society, 15 ou 20 minutos é o padrão para partidas mais competitivas.',
            'Para rachão com muita gente, use 2 gols para rodar mais times e dar chance a todos.',
            'Se o grupo prefere empate sem ganhador, use sem limite de gols e respeite o tempo.',
          ].map((tip, i) => (
            <View key={i} style={styles.tipItem}>
              <Text style={[styles.tipBullet, { color: theme.colors.secondary }]}>•</Text>
              <Text style={[styles.tipText, { color: theme.colors.textMuted }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.example}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Exemplo prático</Text>
        <View
          style={[
            styles.exampleCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}>
          <Text style={[styles.exampleText, { color: theme.colors.textMuted }]}>
            Grupo de rachão usa a regra: 2 gols ou 10 minutos, o que vier primeiro. Configure
            "10 min" e "limite 2 gols", inicie o jogo e clique em "+ Gol" sempre que um time
            marcar. Quando o segundo gol cair, o cronômetro para e o vencedor é exibido
            automaticamente.
          </Text>
        </View>
      </View>

      <View style={styles.faqList}>
        {FAQ.map((item) => (
          <View
            key={item.q}
            style={[
              styles.faqCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}>
            <Text style={[styles.faqQ, { color: theme.colors.text }]}>{item.q}</Text>
            <Text style={[styles.faqA, { color: theme.colors.textMuted }]}>{item.a}</Text>
          </View>
        ))}
      </View>

      <SafeAd placement={AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS} hasContent />

      <View style={styles.relatedLinks}>
        <Text style={[styles.relatedTitle, { color: theme.colors.text }]}>Outras ferramentas</Text>
        <View style={styles.relatedRow}>
          {[
            { label: 'Sorteador de Times', href: '/ferramentas/sorteador-de-times' },
            { label: 'Rodízio de Times', href: '/ferramentas/rodizio-de-times' },
            { label: 'Campeonato Rápido', href: '/ferramentas/campeonato-rapido' },
          ].map((link) => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href as never)}
              style={[
                styles.relatedChip,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}>
              <Text style={[styles.relatedChipText, { color: theme.colors.secondary }]}>
                {link.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </PublicPageShell>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 10 },
  introTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800' },
  introText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 18 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800' },
  configSection: { gap: 10 },
  configLabel: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  optionChipText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  scoreboard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
    gap: 20,
    alignItems: 'center',
  },
  timerRow: { alignItems: 'center', gap: 4 },
  timer: { fontFamily: fonts.display, fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  goalLimitLabel: { fontFamily: fonts.body, fontSize: 12 },
  winnerLabel: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
    width: '100%',
    justifyContent: 'center',
  },
  teamBlock: { alignItems: 'center', gap: 10 },
  teamName: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  score: { fontFamily: fonts.display, fontSize: 72, fontWeight: '900', lineHeight: 80 },
  goalButton: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  goalButtonText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  vs: { fontFamily: fonts.display, fontSize: 32, fontWeight: '900' },
  controlsRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  controlButton: {
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minWidth: 120,
    alignItems: 'center',
  },
  controlButtonText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tipsSection: { gap: 12 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800' },
  tipsList: { gap: 10 },
  tipItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tipBullet: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 22 },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  example: { gap: 12 },
  exampleCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  exampleText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  faqList: { gap: 12 },
  faqCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 8 },
  faqQ: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  faqA: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  relatedLinks: { gap: 12 },
  relatedTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800' },
  relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  relatedChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  relatedChipText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
});
