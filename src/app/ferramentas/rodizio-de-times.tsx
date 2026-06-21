import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const PER_TEAM_OPTIONS = [3, 4, 5, 6, 7];

type RodizioTeam = {
  id: number;
  players: string[];
};

type RodizioPhase = 'setup' | 'playing';

function buildTeams(players: string[], perTeam: number): RodizioTeam[] {
  const teams: RodizioTeam[] = [];
  for (let i = 0; i < players.length; i += perTeam) {
    teams.push({ id: teams.length + 1, players: players.slice(i, i + perTeam) });
  }
  return teams;
}

function completeTeam(incomplete: RodizioTeam, donors: string[], perTeam: number): { team: RodizioTeam; remaining: string[] } {
  const needed = perTeam - incomplete.players.length;
  const added = donors.slice(0, needed);
  const remaining = donors.slice(needed);
  return {
    team: { ...incomplete, players: [...incomplete.players, ...added] },
    remaining,
  };
}

const FAQ = [
  {
    q: 'O que é o rodízio de times?',
    a: 'É uma dinâmica de rachão onde o time vencedor fica no campo e o perdedor vai para o final da fila. O próximo da fila entra para disputar contra o campeão.',
  },
  {
    q: 'O que acontece com o time perdedor?',
    a: 'Ele vai para o final da fila. Se o próximo time na fila estiver incompleto, jogadores do time que saiu podem completá-lo antes de entrar.',
  },
  {
    q: 'Como são formados os times?',
    a: 'Os times são criados na ordem de chegada: os primeiros a chegar formam o Time 1, os seguintes o Time 2, e assim por diante.',
  },
  {
    q: 'O que acontece se um time estiver incompleto?',
    a: 'Jogadores do time que acabou de sair (o perdedor) podem preencher os espaços do time incompleto para ele entrar em campo.',
  },
];

export default function RodizioScreen() {
  const theme = useAppTheme();
  const [inputValue, setInputValue] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [perTeam, setPerTeam] = useState(5);
  const [phase, setPhase] = useState<RodizioPhase>('setup');
  const [onField, setOnField] = useState<[RodizioTeam, RodizioTeam] | null>(null);
  const [queue, setQueue] = useState<RodizioTeam[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const nextId = players.length + 1;

  function addPlayer() {
    const name = inputValue.trim();
    if (!name || players.includes(name)) {
      setInputValue('');
      return;
    }
    setPlayers((prev) => [...prev, name]);
    setInputValue('');
  }

  function removePlayer(index: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  }

  function startRodizio() {
    if (players.length < perTeam * 2) return;
    const teams = buildTeams(players, perTeam);
    setOnField([teams[0], teams[1]]);
    setQueue(teams.slice(2));
    setMatchCount(1);
    setPhase('playing');
  }

  function registerWinner(winner: 0 | 1) {
    if (!onField) return;
    const loser = winner === 0 ? 1 : 0;
    const winnerTeam = onField[winner];
    const loserTeam = onField[loser];
    const loserPlayers = [...loserTeam.players];

    let nextQueue = [...queue, loserTeam];

    if (nextQueue.length === 0) {
      setOnField([winnerTeam, loserTeam]);
      setMatchCount((c) => c + 1);
      return;
    }

    let nextOpponent = nextQueue[0];
    let remainingLoserPlayers = loserPlayers;

    if (nextOpponent.players.length < perTeam) {
      const { team: filled, remaining } = completeTeam(nextOpponent, loserPlayers, perTeam);
      nextOpponent = filled;
      remainingLoserPlayers = remaining;
      nextQueue = [
        nextOpponent,
        ...nextQueue.slice(1),
        { ...loserTeam, players: remainingLoserPlayers },
      ];
      nextQueue = nextQueue.slice(1);
    } else {
      nextQueue = nextQueue.slice(1);
    }

    setOnField([winnerTeam, nextOpponent]);
    setQueue(nextQueue);
    setMatchCount((c) => c + 1);
  }

  function resetRodizio() {
    setPhase('setup');
    setOnField(null);
    setQueue([]);
    setMatchCount(0);
  }

  const hasResult = phase === 'playing' && onField !== null;
  const canStart = players.length >= perTeam * 2;

  return (
    <PublicPageShell
      eyebrow="Ferramenta gratuita"
      title="Rodízio de Times"
      description="Organize a fila do rachão, forme os times pela ordem de chegada e mantenha o vencedor em campo. Sem login, sem instalação."
      actions={[
        { label: 'Sorteador', href: '/ferramentas/sorteador-de-times', variant: 'secondary' },
        { label: 'Cronômetro', href: '/ferramentas/cronometro-pelada', variant: 'ghost' },
      ]}>
      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: theme.colors.text }]}>
          Como funciona o rodízio
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Os jogadores são adicionados na ordem em que chegam. A ferramenta monta os times
          automaticamente: os primeiros formam o Time 1, os seguintes o Time 2, e assim por
          diante. O Time 1 e o Time 2 começam jogando. Ao registrar o vencedor, o perdedor
          vai para o final da fila e o próximo time entra em campo.
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Se o próximo time estiver incompleto, jogadores do time que saiu preenchem os
          espaços antes de entrar em campo.
        </Text>
      </View>

      {phase === 'setup' ? (
        <>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Adicionar jogadores por ordem de chegada
            </Text>
            {players.length > 0 ? (
              <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
                {players.length} jogador{players.length > 1 ? 'es' : ''} na lista
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={addPlayer}
                placeholder={`Jogador ${nextId}`}
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.backgroundElevated,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                  },
                ]}
              />
              <Pressable
                onPress={addPlayer}
                style={[styles.addButton, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.addButtonText}>Adicionar</Text>
              </Pressable>
            </View>
            {players.length > 0 ? (
              <View style={styles.playerList}>
                {players.map((player, index) => (
                  <View
                    key={`${player}-${index}`}
                    style={[
                      styles.playerChip,
                      {
                        backgroundColor: theme.colors.backgroundElevated,
                        borderColor: theme.colors.border,
                      },
                    ]}>
                    <Text style={[styles.playerIndex, { color: theme.colors.secondary }]}>
                      {index + 1}
                    </Text>
                    <Text style={[styles.playerName, { color: theme.colors.text }]}>
                      {player}
                    </Text>
                    <Pressable
                      onPress={() => removePlayer(index)}
                      hitSlop={8}
                      style={styles.removeButton}>
                      <Text style={[styles.removeButtonText, { color: theme.colors.textMuted }]}>
                        ✕
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Jogadores por time
            </Text>
            <View style={styles.optionsRow}>
              {PER_TEAM_OPTIONS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setPerTeam(n)}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor:
                        perTeam === n ? theme.colors.primary : theme.colors.backgroundElevated,
                      borderColor: perTeam === n ? theme.colors.primary : theme.colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: perTeam === n ? '#FFFFFF' : theme.colors.textMuted },
                    ]}>
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!canStart && players.length > 0 ? (
              <Text style={[styles.warning, { color: theme.colors.textMuted }]}>
                Adicione pelo menos {perTeam * 2} jogadores para iniciar o rodízio (para 2
                times completos). Você tem {players.length}.
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={startRodizio}
            disabled={!canStart}
            style={[
              styles.startButton,
              {
                backgroundColor: canStart ? theme.colors.primary : theme.colors.backgroundElevated,
                borderColor: canStart ? theme.colors.primary : theme.colors.border,
              },
            ]}>
            <Text
              style={[
                styles.startButtonText,
                { color: canStart ? '#FFFFFF' : theme.colors.textMuted },
              ]}>
              Iniciar rodízio
            </Text>
          </Pressable>
        </>
      ) : null}

      {phase === 'playing' && onField ? (
        <View style={styles.playingSection}>
          <View style={styles.matchHeader}>
            <Text style={[styles.matchCount, { color: theme.colors.secondary }]}>
              Partida #{matchCount}
            </Text>
            <Text style={[styles.matchTitle, { color: theme.colors.text }]}>Em campo agora</Text>
          </View>

          <View style={styles.matchRow}>
            {([0, 1] as const).map((idx) => {
              const team = onField[idx];
              return (
                <View
                  key={idx}
                  style={[
                    styles.teamCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.teamLabel, { color: theme.colors.secondary }]}>
                    Time {team.id}
                  </Text>
                  {team.players.map((p, pi) => (
                    <Text key={pi} style={[styles.teamPlayer, { color: theme.colors.text }]}>
                      {pi + 1}. {p}
                    </Text>
                  ))}
                  <Pressable
                    onPress={() => registerWinner(idx)}
                    style={[styles.winButton, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.winButtonText}>Ganhou</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {queue.length > 0 ? (
            <View style={styles.queueSection}>
              <Text style={[styles.queueTitle, { color: theme.colors.text }]}>
                Na fila ({queue.length} time{queue.length > 1 ? 's' : ''})
              </Text>
              <View style={styles.queueList}>
                {queue.map((team, qi) => (
                  <View
                    key={`${team.id}-${qi}`}
                    style={[
                      styles.queueCard,
                      {
                        backgroundColor: theme.colors.backgroundElevated,
                        borderColor: theme.colors.border,
                      },
                    ]}>
                    <Text style={[styles.queuePosition, { color: theme.colors.secondary }]}>
                      #{qi + 1}
                    </Text>
                    <View style={styles.queueInfo}>
                      <Text style={[styles.queueTeamLabel, { color: theme.colors.text }]}>
                        Time {team.id}
                        {team.players.length < perTeam
                          ? ` (${team.players.length}/${perTeam})`
                          : ''}
                      </Text>
                      <Text style={[styles.queuePlayers, { color: theme.colors.textMuted }]}>
                        {team.players.join(', ')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.emptyQueue,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}>
              <Text style={[styles.emptyQueueText, { color: theme.colors.textMuted }]}>
                Nenhum time na fila. São apenas 2 times no rodízio.
              </Text>
            </View>
          )}

          <Pressable
            onPress={resetRodizio}
            style={[
              styles.resetButton,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundElevated },
            ]}>
            <Text style={[styles.resetButtonText, { color: theme.colors.textMuted }]}>
              Reiniciar rodízio
            </Text>
          </Pressable>
        </View>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.rulesSection}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Regras do rodízio explicadas
        </Text>
        <View style={styles.rulesList}>
          {[
            { rule: 'Vencedor fica', detail: 'O time que ganhar a partida permanece em campo e enfrenta o próximo da fila.' },
            { rule: 'Perdedor sai', detail: 'O time que perdeu vai para o final da fila. Eles voltam quando for a vez deles.' },
            { rule: 'Time completo tem prioridade', detail: 'Um time com todos os jogadores entra antes de um time incompleto.' },
            { rule: 'Completar time incompleto', detail: 'Jogadores do time que acabou de sair preenchem os espaços de um time incompleto que está na fila.' },
            { rule: 'Empate', detail: 'Em caso de empate, quem decide a regra é o grupo. Uma opção comum é o time mais velho (com mais tempo em campo) dar lugar para o próximo.' },
          ].map((item) => (
            <View
              key={item.rule}
              style={[
                styles.ruleCard,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              ]}>
              <Text style={[styles.ruleTitle, { color: theme.colors.text }]}>{item.rule}</Text>
              <Text style={[styles.ruleDetail, { color: theme.colors.textMuted }]}>
                {item.detail}
              </Text>
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
            Rachão com 15 jogadores e times de 5: a ferramenta cria 3 times. Times 1 e 2
            começam, Time 3 fica na fila. Time 1 ganha: Time 2 vai para a fila (2º lugar),
            Time 3 entra. Time 3 ganha: Time 1 entrou como fila depois — agora Time 1 é 2º
            e Time 2 é 3º na fila. E assim por diante.
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
            { label: 'Cronômetro de Pelada', href: '/ferramentas/cronometro-pelada' },
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
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 14 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800' },
  cardSubtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: -8 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15 },
  addButton: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  addButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  playerList: { gap: 8 },
  playerChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  playerIndex: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', minWidth: 18 },
  playerName: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  removeButton: { padding: 2 },
  removeButtonText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  optionChipText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  warning: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  startButton: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  startButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  playingSection: { gap: 18 },
  matchHeader: { gap: 4 },
  matchCount: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  matchTitle: { fontFamily: fonts.heading, fontSize: 22, fontWeight: '800' },
  matchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  teamCard: { flexGrow: 1, flexBasis: 200, borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  teamLabel: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  teamPlayer: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  winButton: { marginTop: 6, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  winButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  queueSection: { gap: 10 },
  queueTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800' },
  queueList: { gap: 10 },
  queueCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  queuePosition: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', minWidth: 28 },
  queueInfo: { flex: 1, gap: 4 },
  queueTeamLabel: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  queuePlayers: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  emptyQueue: { borderWidth: 1, borderRadius: 16, padding: 16 },
  emptyQueueText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  resetButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  resetButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700' },
  rulesSection: { gap: 12 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800' },
  rulesList: { gap: 10 },
  ruleCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  ruleTitle: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  ruleDetail: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
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
