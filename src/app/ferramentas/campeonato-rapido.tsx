import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { TOOL_COLORS } from '@/components/tools/tool-theme';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';

const C = TOOL_COLORS;

type Format = 'knockout' | 'league';
type Phase = 'setup' | 'playing';

type Match = {
  id: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  played: boolean;
};

type KnockoutRound = {
  name: string;
  matches: Match[];
};

function makeMatchId() {
  return Math.random().toString(36).slice(2, 8);
}

function generateLeagueFixtures(teams: string[]): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push({
        id: makeMatchId(),
        teamA: teams[i],
        teamB: teams[j],
        scoreA: 0,
        scoreB: 0,
        played: false,
      });
    }
  }
  return matches;
}

function generateKnockoutRound(teams: string[]): KnockoutRound {
  const matches: Match[] = [];
  for (let i = 0; i < teams.length - 1; i += 2) {
    matches.push({
      id: makeMatchId(),
      teamA: teams[i],
      teamB: teams[i + 1],
      scoreA: 0,
      scoreB: 0,
      played: false,
    });
  }
  if (teams.length % 2 !== 0) {
    const bye = teams[teams.length - 1];
    matches.push({
      id: makeMatchId(),
      teamA: bye,
      teamB: 'BYE',
      scoreA: 1,
      scoreB: 0,
      played: true,
    });
  }
  const roundNames = ['Final', 'Semi-final', 'Quartas', 'Oitavas', 'Fase 1'];
  const name = roundNames[Math.min(Math.ceil(Math.log2(teams.length)) - 1, roundNames.length - 1)];
  return { name, matches };
}

function getRoundName(numTeams: number): string {
  if (numTeams <= 2) return 'Final';
  if (numTeams <= 4) return 'Semi-final';
  if (numTeams <= 8) return 'Quartas de final';
  if (numTeams <= 16) return 'Oitavas de final';
  return 'Fase inicial';
}

type LeagueRow = {
  team: string;
  pts: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  played: number;
};

function buildStandings(teams: string[], matches: Match[]): LeagueRow[] {
  const map: Record<string, LeagueRow> = {};
  teams.forEach((t) => {
    map[t] = { team: t, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, played: 0 };
  });
  matches.forEach((m) => {
    if (!m.played || m.teamB === 'BYE') return;
    const a = map[m.teamA];
    const b = map[m.teamB];
    if (!a || !b) return;
    a.gf += m.scoreA; a.ga += m.scoreB; a.gd += m.scoreA - m.scoreB; a.played++;
    b.gf += m.scoreB; b.ga += m.scoreA; b.gd += m.scoreB - m.scoreA; b.played++;
    if (m.scoreA > m.scoreB) { a.w++; a.pts += 3; b.l++; }
    else if (m.scoreA < m.scoreB) { b.w++; b.pts += 3; a.l++; }
    else { a.d++; a.pts++; b.d++; b.pts++; }
  });
  return Object.values(map).sort((x, y) =>
    y.pts - x.pts || y.gd - x.gd || y.gf - x.gf,
  );
}

const FAQ = [
  {
    q: 'Quantos times posso adicionar?',
    a: 'Você pode adicionar de 2 a 16 times. Para mata-mata, o ideal é usar potências de 2 (2, 4, 8, 16) para evitar "byes" (folgas).',
  },
  {
    q: 'O que é "BYE" no mata-mata?',
    a: 'Quando há um número ímpar de times, um deles avança automaticamente sem jogar. Esse time recebe um "BYE" (folga) naquela rodada.',
  },
  {
    q: 'Como funciona o pontos corridos?',
    a: 'Cada time joga contra todos os outros. Vitória vale 3 pontos, empate 1 ponto, derrota 0. A classificação é por pontos, depois saldo de gols e depois gols marcados.',
  },
  {
    q: 'O que acontece em caso de empate no mata-mata?',
    a: 'Essa ferramenta não tem prorrogação ou pênaltis automáticos. Resolva em campo e clique em "+ Gol" para o time vencedor até sair um resultado.',
  },
];

export default function CampeonatoScreen() {
  const [inputValue, setInputValue] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>('knockout');
  const [phase, setPhase] = useState<Phase>('setup');
  const [leagueMatches, setLeagueMatches] = useState<Match[]>([]);
  const [knockoutRounds, setKnockoutRounds] = useState<KnockoutRound[]>([]);
  const [currentRound, setCurrentRound] = useState(0);

  function addTeam() {
    const name = inputValue.trim();
    if (!name || teams.includes(name) || teams.length >= 16) {
      setInputValue('');
      return;
    }
    setTeams((prev) => [...prev, name]);
    setInputValue('');
  }

  function removeTeam(index: number) {
    setTeams((prev) => prev.filter((_, i) => i !== index));
  }

  function generate() {
    if (teams.length < 2) return;
    if (format === 'league') {
      setLeagueMatches(generateLeagueFixtures(teams));
    } else {
      const firstRoundName = getRoundName(teams.length);
      const firstRound = generateKnockoutRound(teams);
      firstRound.name = firstRoundName;
      setKnockoutRounds([firstRound]);
      setCurrentRound(0);
    }
    setPhase('playing');
  }

  function reset() {
    setPhase('setup');
    setLeagueMatches([]);
    setKnockoutRounds([]);
    setCurrentRound(0);
  }

  function updateLeagueScore(id: string, team: 'A' | 'B', delta: number) {
    setLeagueMatches((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m };
        if (team === 'A') next.scoreA = Math.max(0, m.scoreA + delta);
        else next.scoreB = Math.max(0, m.scoreB + delta);
        next.played = next.scoreA > 0 || next.scoreB > 0;
        return next;
      }),
    );
  }

  function markLeagueMatchPlayed(id: string) {
    setLeagueMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, played: true } : m)),
    );
  }

  function advanceKnockout() {
    const round = knockoutRounds[currentRound];
    const winners = round.matches
      .filter((m) => m.played && m.teamB !== 'BYE')
      .map((m) => (m.scoreA >= m.scoreB ? m.teamA : m.teamB))
      .concat(
        round.matches
          .filter((m) => m.teamB === 'BYE' && m.played)
          .map((m) => m.teamA),
      );

    if (winners.length < 2) return;
    const nextRoundName = getRoundName(winners.length);
    const nextRound = generateKnockoutRound(winners);
    nextRound.name = nextRoundName;
    setKnockoutRounds((prev) => [...prev, nextRound]);
    setCurrentRound((c) => c + 1);
  }

  function updateKnockoutScore(matchId: string, team: 'A' | 'B', delta: number) {
    setKnockoutRounds((prev) =>
      prev.map((round, ri) => {
        if (ri !== currentRound) return round;
        return {
          ...round,
          matches: round.matches.map((m) => {
            if (m.id !== matchId) return m;
            const next = { ...m };
            if (team === 'A') next.scoreA = Math.max(0, m.scoreA + delta);
            else next.scoreB = Math.max(0, m.scoreB + delta);
            next.played = next.scoreA !== next.scoreB;
            return next;
          }),
        };
      }),
    );
  }

  const isKnockoutRoundComplete =
    knockoutRounds.length > 0 &&
    knockoutRounds[currentRound].matches.every((m) => m.played);

  const isFinal =
    knockoutRounds.length > 0 &&
    knockoutRounds[currentRound].matches.filter((m) => m.teamB !== 'BYE').length === 1;

  const finalWinner =
    isFinal && isKnockoutRoundComplete
      ? (() => {
          const finalMatch = knockoutRounds[currentRound].matches.find((m) => m.teamB !== 'BYE');
          if (!finalMatch) return null;
          return finalMatch.scoreA >= finalMatch.scoreB ? finalMatch.teamA : finalMatch.teamB;
        })()
      : null;

  const standings = phase === 'playing' && format === 'league'
    ? buildStandings(teams, leagueMatches)
    : [];

  const hasResult =
    phase === 'playing' &&
    (format === 'league' ? leagueMatches.length > 0 : knockoutRounds.length > 0);

  return (
    <ToolPageShell
      title="Campeonato Rápido"
      subtitle="Monte os confrontos sem planilha."
      seoTitle="Campeonato Rápido: Tabela e Confrontos | Professô FC"
      seoDescription="Monte um campeonato rápido entre amigos: confrontos, placar e classificação automática, sem planilha e sem cadastro."
      compactHero>

      {phase === 'setup' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Times participantes</Text>
            {teams.length > 0 ? (
              <Text style={styles.cardSubtitle}>
                {teams.length} time{teams.length > 1 ? 's' : ''} adicionado{teams.length > 1 ? 's' : ''} (máximo 16)
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={addTeam}
                placeholder="Nome do time"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                style={styles.input}
              />
              <Pressable
                onPress={addTeam}
                disabled={teams.length >= 16}
                style={[styles.addButton, { backgroundColor: teams.length >= 16 ? C.cardMuted : '#16A34A' }]}>
                <Text style={[styles.addButtonText, { color: teams.length >= 16 ? C.textMuted : '#FFFFFF' }]}>
                  Adicionar
                </Text>
              </Pressable>
            </View>
            {teams.length > 0 ? (
              <View style={styles.teamList}>
                {teams.map((team, index) => (
                  <View key={`${team}-${index}`} style={styles.teamChip}>
                    <Text style={styles.teamIndex}>{index + 1}</Text>
                    <Text style={styles.teamName}>{team}</Text>
                    <Pressable onPress={() => removeTeam(index)} hitSlop={8}>
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Formato</Text>
            <View style={styles.formatRow}>
              {(
                [
                  {
                    key: 'knockout' as Format,
                    label: 'Mata-mata',
                    desc: 'Perdeu, saiu. Confrontos eliminatórios até o campeão.',
                  },
                  {
                    key: 'league' as Format,
                    label: 'Pontos corridos',
                    desc: 'Todos jogam contra todos. Classificação por pontos.',
                  },
                ] as const
              ).map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFormat(f.key)}
                  style={[
                    styles.formatCard,
                    {
                      backgroundColor: format === f.key ? C.accentSoft : C.cardMuted,
                      borderColor: format === f.key ? C.borderStrong : C.border,
                      flex: 1,
                    },
                  ]}>
                  <Text style={styles.formatLabel}>{f.label}</Text>
                  <Text style={styles.formatDesc}>{f.desc}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={generate}
            disabled={teams.length < 2}
            style={[
              styles.generateButton,
              { backgroundColor: teams.length >= 2 ? '#16A34A' : C.cardMuted, borderColor: teams.length >= 2 ? '#16A34A' : C.border },
            ]}>
            <Text style={[styles.generateButtonText, { color: teams.length >= 2 ? '#FFFFFF' : C.textMuted }]}>
              Gerar campeonato
            </Text>
          </Pressable>
          {teams.length < 2 ? (
            <Text style={styles.hint}>Adicione pelo menos 2 times para gerar o campeonato.</Text>
          ) : null}
        </>
      ) : null}

      {phase === 'playing' && format === 'knockout' && knockoutRounds.length > 0 ? (
        <View style={styles.playingSection}>
          {finalWinner ? (
            <View style={styles.championCard}>
              <Text style={styles.championLabel}>Campeão</Text>
              <Text style={styles.championName}>{finalWinner}</Text>
            </View>
          ) : null}

          {knockoutRounds.map((round, ri) => (
            <View key={ri} style={styles.roundSection}>
              <Text style={styles.roundName}>{round.name}</Text>
              <View style={styles.matchList}>
                {round.matches.map((match) => (
                  <View
                    key={match.id}
                    style={[
                      styles.matchCard,
                      {
                        borderColor: match.played ? '#16A34A' : C.border,
                        opacity: ri < currentRound ? 0.6 : 1,
                      },
                    ]}>
                    {match.teamB === 'BYE' ? (
                      <Text style={styles.byeText}>{match.teamA} — avança automaticamente (BYE)</Text>
                    ) : (
                      <>
                        <View style={styles.matchTeamRow}>
                          <Text style={styles.matchTeam}>{match.teamA}</Text>
                          <View style={styles.matchScoreControls}>
                            {ri === currentRound ? (
                              <Pressable onPress={() => updateKnockoutScore(match.id, 'A', -1)} style={styles.scoreBtn}>
                                <Text style={styles.scoreBtnText}>-</Text>
                              </Pressable>
                            ) : null}
                            <Text style={styles.matchScore}>{match.scoreA}</Text>
                            {ri === currentRound ? (
                              <Pressable onPress={() => updateKnockoutScore(match.id, 'A', 1)} style={[styles.scoreBtn, styles.scoreBtnActive]}>
                                <Text style={styles.scoreBtnTextWhite}>+</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.matchDivider} />
                        <View style={styles.matchTeamRow}>
                          <Text style={styles.matchTeam}>{match.teamB}</Text>
                          <View style={styles.matchScoreControls}>
                            {ri === currentRound ? (
                              <Pressable onPress={() => updateKnockoutScore(match.id, 'B', -1)} style={styles.scoreBtn}>
                                <Text style={styles.scoreBtnText}>-</Text>
                              </Pressable>
                            ) : null}
                            <Text style={styles.matchScore}>{match.scoreB}</Text>
                            {ri === currentRound ? (
                              <Pressable onPress={() => updateKnockoutScore(match.id, 'B', 1)} style={[styles.scoreBtn, styles.scoreBtnActive]}>
                                <Text style={styles.scoreBtnTextWhite}>+</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}

          {isKnockoutRoundComplete && !isFinal ? (
            <Pressable onPress={advanceKnockout} style={styles.advanceButton}>
              <Text style={styles.advanceButtonText}>Avançar para próxima fase</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={reset} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reiniciar campeonato</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === 'playing' && format === 'league' ? (
        <View style={styles.playingSection}>
          <Text style={styles.roundName}>Confrontos</Text>
          <View style={styles.matchList}>
            {leagueMatches.map((match) => (
              <View
                key={match.id}
                style={[styles.matchCard, { borderColor: match.played ? '#16A34A' : C.border }]}>
                <View style={styles.matchTeamRow}>
                  <Text style={styles.matchTeam}>{match.teamA}</Text>
                  <View style={styles.matchScoreControls}>
                    <Pressable onPress={() => updateLeagueScore(match.id, 'A', -1)} style={styles.scoreBtn}>
                      <Text style={styles.scoreBtnText}>-</Text>
                    </Pressable>
                    <Text style={styles.matchScore}>{match.scoreA}</Text>
                    <Pressable onPress={() => updateLeagueScore(match.id, 'A', 1)} style={[styles.scoreBtn, styles.scoreBtnActive]}>
                      <Text style={styles.scoreBtnTextWhite}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.matchDivider} />
                <View style={styles.matchTeamRow}>
                  <Text style={styles.matchTeam}>{match.teamB}</Text>
                  <View style={styles.matchScoreControls}>
                    <Pressable onPress={() => updateLeagueScore(match.id, 'B', -1)} style={styles.scoreBtn}>
                      <Text style={styles.scoreBtnText}>-</Text>
                    </Pressable>
                    <Text style={styles.matchScore}>{match.scoreB}</Text>
                    <Pressable onPress={() => updateLeagueScore(match.id, 'B', 1)} style={[styles.scoreBtn, styles.scoreBtnActive]}>
                      <Text style={styles.scoreBtnTextWhite}>+</Text>
                    </Pressable>
                  </View>
                </View>
                {!match.played ? (
                  <Pressable onPress={() => markLeagueMatchPlayed(match.id)} style={styles.confirmButton}>
                    <Text style={styles.confirmButtonText}>Confirmar placar</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          {standings.length > 0 ? (
            <View style={styles.standingsSection}>
              <Text style={styles.roundName}>Classificação</Text>
              <View style={styles.standingsTable}>
                <View style={styles.standingsHeader}>
                  {['#', 'Time', 'J', 'V', 'E', 'D', 'GD', 'Pts'].map((h) => (
                    <Text key={h} style={[styles.standingsHeaderCell, { flex: h === 'Time' ? 3 : 1 }]}>
                      {h}
                    </Text>
                  ))}
                </View>
                {standings.map((row, i) => (
                  <View
                    key={row.team}
                    style={[
                      styles.standingsRow,
                      i < standings.length - 1 ? { borderBottomColor: C.border, borderBottomWidth: 1 } : null,
                    ]}>
                    <Text style={[styles.standingsCell, { color: C.accent, flex: 1 }]}>{i + 1}</Text>
                    <Text style={[styles.standingsCell, { color: C.text, flex: 3 }]}>{row.team}</Text>
                    {[row.played, row.w, row.d, row.l, row.gd, row.pts].map((val, vi) => (
                      <Text
                        key={vi}
                        style={[
                          styles.standingsCell,
                          { color: C.textMuted, flex: 1, fontWeight: vi === 5 ? '800' : '400' },
                        ]}>
                        {val}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable onPress={reset} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reiniciar campeonato</Text>
          </Pressable>
        </View>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.tipsSection}>
        <Text style={styles.sectionTitle}>Dicas de uso</Text>
        <View style={styles.tipsList}>
          {[
            'Para mata-mata com 4 times: 2 semifinais e 1 final — use 4 times para ter um formato limpo.',
            'Para pontos corridos com 4 times: são 6 partidas no total (cada time joga 3 vezes).',
            'Com grupos de amigos, use o sorteador para definir os times antes de criar o campeonato.',
            'Use o cronômetro junto com este campeonato para controlar o tempo de cada jogo.',
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
            { label: 'Cronômetro de Pelada', href: '/ferramentas/cronometro-pelada' },
            { label: 'Rodízio de Times', href: '/ferramentas/rodizio-de-times' },
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
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 14, backgroundColor: C.card, borderColor: C.border },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800', color: C.text },
  cardSubtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: -8, color: C.textMuted },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: C.text, backgroundColor: C.cardMuted, borderColor: C.border },
  addButton: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  addButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  teamList: { gap: 8 },
  teamChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.cardMuted, borderColor: C.border },
  teamIndex: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', minWidth: 18, color: C.accentLight },
  teamName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: C.text },
  removeText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.textMuted },
  formatRow: { flexDirection: 'row', gap: 12 },
  formatCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  formatLabel: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800', color: C.text },
  formatDesc: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: C.textMuted },
  generateButton: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  generateButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  hint: { fontFamily: fonts.body, fontSize: 13, color: C.textMuted },
  playingSection: { gap: 18 },
  championCard: { borderWidth: 2, borderRadius: 20, padding: 20, alignItems: 'center', gap: 6, backgroundColor: C.accentSoft, borderColor: C.accent },
  championLabel: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: C.accentLight },
  championName: { fontFamily: fonts.display, fontSize: 32, fontWeight: '900', textAlign: 'center', color: C.text },
  roundSection: { gap: 12 },
  roundName: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800', color: C.text },
  matchList: { gap: 10 },
  matchCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10, backgroundColor: C.card },
  matchTeamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  matchTeam: { flex: 1, fontFamily: fonts.heading, fontSize: 15, fontWeight: '700', color: C.text },
  matchScoreControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchScore: { fontFamily: fonts.display, fontSize: 24, fontWeight: '900', minWidth: 30, textAlign: 'center', color: C.text },
  scoreBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: C.border, backgroundColor: C.cardMuted },
  scoreBtnActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  scoreBtnText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', color: C.textMuted },
  scoreBtnTextWhite: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  matchDivider: { height: 1, backgroundColor: C.border },
  byeText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: C.textMuted },
  confirmButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 4, borderColor: C.border },
  confirmButtonText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.textMuted },
  standingsSection: { gap: 12 },
  standingsTable: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: C.card, borderColor: C.border },
  standingsHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  standingsHeaderCell: { fontFamily: fonts.heading, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', color: C.textMuted },
  standingsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  standingsCell: { fontFamily: fonts.body, fontSize: 13 },
  advanceButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#16A34A' },
  advanceButtonText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  resetButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderColor: C.border, backgroundColor: C.cardMuted },
  resetButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700', color: C.textMuted },
  tipsSection: { gap: 12 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800', color: C.text },
  tipsList: { gap: 10 },
  tipItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tipBullet: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: C.accentLight },
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
