import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { getQueuedTeams } from '@/lib/pickup-tools';
import { usePickupToolsStore } from '@/store/pickup-tools-store';

const PER_TEAM_OPTIONS = [3, 4, 5, 6, 7];

const FAQ = [
  {
    q: 'O que é o rodízio de times?',
    a: 'Dinâmica de rachão onde o time vencedor fica no campo e o perdedor vai para o final da fila. O próximo grupo da fila entra para disputar contra o campeão.',
  },
  {
    q: 'Como funciona a fila?',
    a: 'A fila é individual — cada jogador ocupa uma posição. Ao montar o próximo time, os primeiros N da fila entram, na ordem em que chegaram. Quem estava esperando antes dos perdedores continua na frente.',
  },
  {
    q: 'O que acontece com o time perdedor?',
    a: 'Os jogadores do time perdedor vão para o final da fila, individualmente e na ordem em que estavam no time.',
  },
  {
    q: 'O estado fica salvo ao trocar de tela?',
    a: 'Sim. O rodízio fica ativo enquanto o aplicativo estiver aberto. Você pode ir ao cronômetro e voltar sem perder a fila.',
  },
];

export default function RodizioScreen() {
  const theme = useAppTheme();

  const store = usePickupToolsStore();
  const {
    players,
    playersPerTeam,
    teamA,
    teamB,
    waitingPlayers,
    phase,
    matchCount,
  } = store;

  const [inputValue, setInputValue] = useState('');

  function addPlayer() {
    const name = inputValue.trim();
    if (!name || players.includes(name)) return;
    store.setRodizioPlayers([...players, name]);
    setInputValue('');
  }

  function removePlayer(name: string) {
    store.setRodizioPlayers(players.filter((p) => p !== name));
  }

  function handleStart() {
    if (players.length < playersPerTeam * 2) return;
    store.startRodizio();
  }

  function handleWin(winner: 'A' | 'B') {
    store.registerWin(winner);
  }

  const queuedTeams = getQueuedTeams(waitingPlayers, playersPerTeam);
  const canStart = players.length >= playersPerTeam * 2;
  const hasContent = phase === 'playing';

  return (
    <PublicPageShell
      eyebrow="Ferramenta gratuita"
      title="Rodízio de Times"
      description="Organize a fila de times da pelada. O vencedor fica, o perdedor vai para o final da fila. A fila é mantida por jogador individual — quem chegou antes joga antes."
      actions={[
        { label: 'Cronômetro', href: '/ferramentas/cronometro-pelada', variant: 'secondary' },
        { label: 'Sorteador', href: '/ferramentas/sorteador-de-times', variant: 'ghost' },
      ]}>

      {phase === 'setup' ? (
        <>
          {/* Players per team */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
              Jogadores por time
            </Text>
            <View style={styles.optionsRow}>
              {PER_TEAM_OPTIONS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => store.setRodizioPlayersPerTeam(n)}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: playersPerTeam === n ? '#16A34A' : theme.colors.backgroundElevated,
                      borderColor: playersPerTeam === n ? '#16A34A' : theme.colors.border,
                    },
                  ]}>
                  <Text style={[styles.optionChipText, { color: playersPerTeam === n ? '#FFF' : theme.colors.textMuted }]}>
                    {n}v{n}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Add players */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
              Adicionar jogadores (na ordem de chegada)
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={addPlayer}
                placeholder="Nome do jogador"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.backgroundElevated,
                    borderColor: theme.colors.border,
                  },
                ]}
                returnKeyType="done"
              />
              <Pressable onPress={addPlayer} style={[styles.addButton, { backgroundColor: '#16A34A' }]}>
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            </View>

            {players.length > 0 ? (
              <View style={styles.playerList}>
                {players.map((name, idx) => (
                  <View
                    key={name}
                    style={[styles.playerRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <Text style={[styles.playerIndex, { color: theme.colors.textMuted }]}>{idx + 1}</Text>
                    <Text style={[styles.playerName, { color: theme.colors.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Pressable onPress={() => removePlayer(name)} style={styles.removeButton}>
                      <Text style={[styles.removeButtonText, { color: theme.colors.textMuted }]}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {players.length > 0 && players.length < playersPerTeam * 2 ? (
              <View style={[styles.warningBox, { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.4)' }]}>
                <Text style={[styles.warningText, { color: '#B45309' }]}>
                  Mínimo {playersPerTeam * 2} jogadores para iniciar ({players.length}/{playersPerTeam * 2}).
                </Text>
              </View>
            ) : null}

            {players.length > 0 ? (
              <View style={[styles.setupSummary, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Text style={[styles.setupSummaryText, { color: theme.colors.textMuted }]}>
                  {players.length} jogadores · {Math.floor(players.length / playersPerTeam)} time{Math.floor(players.length / playersPerTeam) > 1 ? 's' : ''} completo{Math.floor(players.length / playersPerTeam) > 1 ? 's' : ''}
                  {players.length % playersPerTeam > 0 ? ` + ${players.length % playersPerTeam} aguardando` : ''}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleStart}
              disabled={!canStart}
              style={[
                styles.startButton,
                { backgroundColor: canStart ? '#16A34A' : theme.colors.backgroundElevated },
              ]}>
              <Text style={[styles.startButtonText, { color: canStart ? '#FFF' : theme.colors.textMuted }]}>
                Iniciar pelada
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {phase === 'playing' ? (
        <>
          {/* Match count */}
          {matchCount > 0 ? (
            <View style={[styles.matchBadge, { backgroundColor: 'rgba(22,163,74,0.1)', borderColor: 'rgba(22,163,74,0.3)' }]}>
              <Text style={[styles.matchBadgeText, { color: '#16A34A' }]}>
                Partida #{matchCount + 1} em andamento
              </Text>
            </View>
          ) : null}

          {/* Active match */}
          <View style={[styles.matchCard, { backgroundColor: theme.colors.surface, borderColor: '#16A34A' }]}>
            <Text style={[styles.matchCardTitle, { color: '#16A34A' }]}>Em campo agora</Text>

            <View style={styles.matchTeams}>
              {/* Team A */}
              <View style={styles.matchTeam}>
                <View style={[styles.teamBadge, { backgroundColor: '#16A34A' }]}>
                  <Text style={styles.teamBadgeText}>Time A</Text>
                </View>
                <View style={styles.matchPlayerList}>
                  {teamA.map((name, i) => (
                    <Text key={name} style={[styles.matchPlayer, { color: theme.colors.text }]}>
                      {i + 1}. {name}
                    </Text>
                  ))}
                </View>
                <Pressable
                  onPress={() => handleWin('A')}
                  style={[styles.winButton, { backgroundColor: '#16A34A' }]}>
                  <Text style={styles.winButtonText}>Registrar vitória do Time A</Text>
                </Pressable>
              </View>

              <Text style={[styles.vs, { color: theme.colors.textMuted }]}>×</Text>

              {/* Team B */}
              <View style={styles.matchTeam}>
                <View style={[styles.teamBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.teamBadgeText}>Time B</Text>
                </View>
                <View style={styles.matchPlayerList}>
                  {teamB.map((name, i) => (
                    <Text key={name} style={[styles.matchPlayer, { color: theme.colors.text }]}>
                      {i + 1}. {name}
                    </Text>
                  ))}
                </View>
                <Pressable
                  onPress={() => handleWin('B')}
                  style={[styles.winButton, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.winButtonText}>Registrar vitória do Time B</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => router.push('/ferramentas/cronometro-pelada' as never)}
              style={[styles.timerLink, { borderColor: theme.colors.border }]}>
              <Text style={[styles.timerLinkText, { color: theme.colors.textMuted }]}>
                Abrir cronômetro desta partida
              </Text>
            </Pressable>
          </View>

          {/* Queue */}
          {waitingPlayers.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
                Fila de espera ({waitingPlayers.length} jogador{waitingPlayers.length > 1 ? 'es' : ''})
              </Text>
              {queuedTeams.map((team, ti) => (
                <View
                  key={ti}
                  style={[styles.queueCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <Text style={[styles.queueCardLabel, { color: theme.colors.textMuted }]}>
                    Próximo time {ti + 1}
                    {team.length < playersPerTeam ? ` (${team.length}/${playersPerTeam} — incompleto)` : ''}
                  </Text>
                  <View style={styles.queuePlayers}>
                    {team.map((name, pi) => (
                      <View
                        key={name}
                        style={[styles.queuePlayer, { backgroundColor: theme.colors.backgroundElevated, borderColor: theme.colors.border }]}>
                        <Text style={[styles.queuePlayerText, { color: theme.colors.text }]}>
                          {pi + 1}. {name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.warningBox, { backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.4)' }]}>
              <Text style={[styles.warningText, { color: '#B45309' }]}>
                Nenhum time na fila. Registre o vencedor para continuar o rodízio.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => store.resetRodizio()}
            style={[styles.resetButton, { borderColor: theme.colors.border }]}>
            <Text style={[styles.resetButtonText, { color: theme.colors.textMuted }]}>
              Resetar pelada
            </Text>
          </Pressable>
        </>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasContent} />

      <View style={styles.editorial}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Como o rodízio funciona na prática
        </Text>
        <Text style={[styles.editorialText, { color: theme.colors.textMuted }]}>
          Imagine 16 jogadores, 5 por time. Os primeiros 5 formam o Time A, os 5 seguintes o Time B.
          Os 6 restantes ficam na fila, na ordem em que chegaram. Quando o Time A vence, o Time B
          vai para o final da fila — mas os 6 que já estavam esperando continuam na frente.
          Os próximos 5 da fila entram como novo Time B para enfrentar o campeão.
        </Text>
      </View>

      <View style={styles.faqList}>
        {FAQ.map((item) => (
          <View
            key={item.q}
            style={[styles.faqCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.faqQ, { color: theme.colors.text }]}>{item.q}</Text>
            <Text style={[styles.faqA, { color: theme.colors.textMuted }]}>{item.a}</Text>
          </View>
        ))}
      </View>

      <SafeAd placement={AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS} hasContent />

      <View style={styles.relatedLinks}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Outras ferramentas</Text>
        <View style={styles.relatedRow}>
          {[
            { label: 'Cronômetro de Pelada', href: '/ferramentas/cronometro-pelada' },
            { label: 'Sorteador de Times', href: '/ferramentas/sorteador-de-times' },
            { label: 'Campeonato Rápido', href: '/ferramentas/campeonato-rapido' },
          ].map((link) => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href as never)}
              style={[styles.relatedChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
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
  section: { gap: 12 },
  sectionLabel: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800' },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  optionChipText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  inputRow: { flexDirection: 'row', gap: 10 },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { fontFamily: fonts.heading, fontSize: 24, fontWeight: '800', color: '#FFF' },
  playerList: { gap: 8 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playerIndex: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '700', width: 20 },
  playerName: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  removeButton: { padding: 4 },
  removeButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700' },
  warningBox: { borderWidth: 1, borderRadius: 12, padding: 12 },
  warningText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  setupSummary: { borderWidth: 1, borderRadius: 12, padding: 12 },
  setupSummaryText: { fontFamily: fonts.body, fontSize: 13 },
  startButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  startButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  matchBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  matchBadgeText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  matchCard: { borderWidth: 1.5, borderRadius: 24, padding: 20, gap: 16 },
  matchCardTitle: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  matchTeams: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  matchTeam: { flex: 1, gap: 10 },
  teamBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  teamBadgeText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '800', color: '#FFF' },
  matchPlayerList: { gap: 4 },
  matchPlayer: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  winButton: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  winButtonText: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', color: '#FFF', textAlign: 'center' },
  vs: { fontFamily: fonts.display, fontSize: 28, fontWeight: '900', marginTop: 30 },
  timerLink: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  timerLinkText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  queueCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  queueCardLabel: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '700' },
  queuePlayers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  queuePlayer: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  queuePlayerText: { fontFamily: fonts.body, fontSize: 13 },
  resetButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  resetButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700' },
  editorial: { gap: 10 },
  editorialText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  faqList: { gap: 12 },
  faqCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 8 },
  faqQ: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  faqA: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  relatedLinks: { gap: 12 },
  relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  relatedChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  relatedChipText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
});
