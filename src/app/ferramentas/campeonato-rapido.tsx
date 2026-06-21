import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

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
  const theme = useAppTheme();
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
    <PublicPageShell
      eyebrow="Ferramenta gratuita"
      title="Campeonato Rápido"
      description="Monte um mini-campeonato entre amigos com mata-mata ou pontos corridos, gere os confrontos e acompanhe os resultados. Sem login, sem instalação."
      actions={[
        { label: 'Sorteador', href: '/ferramentas/sorteador-de-times', variant: 'secondary' },
        { label: 'Cronômetro', href: '/ferramentas/cronometro-pelada', variant: 'ghost' },
      ]}>
      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: theme.colors.text }]}>
          Como usar o campeonato rápido
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Adicione os nomes dos times, escolha o formato — mata-mata ou pontos corridos — e
          clique em "Gerar campeonato". Os confrontos são criados automaticamente. Para cada
          partida, ajuste o placar e registre o resultado.
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
              Times participantes
            </Text>
            {teams.length > 0 ? (
              <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
                {teams.length} time{teams.length > 1 ? 's' : ''} adicionado{teams.length > 1 ? 's' : ''} (máximo 16)
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={addTeam}
                placeholder="Nome do time"
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
                onPress={addTeam}
                disabled={teams.length >= 16}
                style={[
                  styles.addButton,
                  {
                    backgroundColor:
                      teams.length >= 16 ? theme.colors.backgroundElevated : theme.colors.primary,
                  },
                ]}>
                <Text
                  style={[
                    styles.addButtonText,
                    { color: teams.length >= 16 ? theme.colors.textMuted : '#FFFFFF' },
                  ]}>
                  Adicionar
                </Text>
              </Pressable>
            </View>
            {teams.length > 0 ? (
              <View style={styles.teamList}>
                {teams.map((team, index) => (
                  <View
                    key={`${team}-${index}`}
                    style={[
                      styles.teamChip,
                      {
                        backgroundColor: theme.colors.backgroundElevated,
                        borderColor: theme.colors.border,
                      },
                    ]}>
                    <Text style={[styles.teamIndex, { color: theme.colors.secondary }]}>
                      {index + 1}
                    </Text>
                    <Text style={[styles.teamName, { color: theme.colors.text }]}>{team}</Text>
                    <Pressable onPress={() => removeTeam(index)} hitSlop={8}>
                      <Text style={[styles.removeText, { color: theme.colors.textMuted }]}>✕</Text>
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
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Formato</Text>
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
                      backgroundColor:
                        format === f.key ? theme.colors.primarySoft : theme.colors.backgroundElevated,
                      borderColor: format === f.key ? theme.colors.primary : theme.colors.border,
                      flex: 1,
                    },
                  ]}>
                  <Text style={[styles.formatLabel, { color: theme.colors.text }]}>{f.label}</Text>
                  <Text style={[styles.formatDesc, { color: theme.colors.textMuted }]}>
                    {f.desc}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={generate}
            disabled={teams.length < 2}
            style={[
              styles.generateButton,
              {
                backgroundColor:
                  teams.length >= 2 ? theme.colors.primary : theme.colors.backgroundElevated,
                borderColor: teams.length >= 2 ? theme.colors.primary : theme.colors.border,
              },
            ]}>
            <Text
              style={[
                styles.generateButtonText,
                { color: teams.length >= 2 ? '#FFFFFF' : theme.colors.textMuted },
              ]}>
              Gerar campeonato
            </Text>
          </Pressable>
          {teams.length < 2 ? (
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              Adicione pelo menos 2 times para gerar o campeonato.
            </Text>
          ) : null}
        </>
      ) : null}

      {phase === 'playing' && format === 'knockout' && knockoutRounds.length > 0 ? (
        <View style={styles.playingSection}>
          {finalWinner ? (
            <View
              style={[
                styles.championCard,
                { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
              ]}>
              <Text style={[styles.championLabel, { color: theme.colors.secondary }]}>
                Campeão
              </Text>
              <Text style={[styles.championName, { color: theme.colors.text }]}>
                {finalWinner}
              </Text>
            </View>
          ) : null}

          {knockoutRounds.map((round, ri) => (
            <View key={ri} style={styles.roundSection}>
              <Text style={[styles.roundName, { color: theme.colors.text }]}>{round.name}</Text>
              <View style={styles.matchList}>
                {round.matches.map((match) => (
                  <View
                    key={match.id}
                    style={[
                      styles.matchCard,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: match.played ? theme.colors.primary : theme.colors.border,
                        opacity: ri < currentRound ? 0.6 : 1,
                      },
                    ]}>
                    {match.teamB === 'BYE' ? (
                      <Text style={[styles.byeText, { color: theme.colors.textMuted }]}>
                        {match.teamA} — avança automaticamente (BYE)
                      </Text>
                    ) : (
                      <>
                        <View style={styles.matchTeamRow}>
                          <Text style={[styles.matchTeam, { color: theme.colors.text }]}>
                            {match.teamA}
                          </Text>
                          <View style={styles.matchScoreControls}>
                            {ri === currentRound ? (
                              <Pressable
                                onPress={() => updateKnockoutScore(match.id, 'A', -1)}
                                style={[styles.scoreBtn, { borderColor: theme.colors.border }]}>
                                <Text style={[styles.scoreBtnText, { color: theme.colors.textMuted }]}>-</Text>
                              </Pressable>
                            ) : null}
                            <Text style={[styles.matchScore, { color: theme.colors.text }]}>
                              {match.scoreA}
                            </Text>
                            {ri === currentRound ? (
                              <Pressable
                                onPress={() => updateKnockoutScore(match.id, 'A', 1)}
                                style={[styles.scoreBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                                <Text style={styles.scoreBtnTextWhite}>+</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        <View style={[styles.matchDivider, { backgroundColor: theme.colors.border }]} />
                        <View style={styles.matchTeamRow}>
                          <Text style={[styles.matchTeam, { color: theme.colors.text }]}>
                            {match.teamB}
                          </Text>
                          <View style={styles.matchScoreControls}>
                            {ri === currentRound ? (
                              <Pressable
                                onPress={() => updateKnockoutScore(match.id, 'B', -1)}
                                style={[styles.scoreBtn, { borderColor: theme.colors.border }]}>
                                <Text style={[styles.scoreBtnText, { color: theme.colors.textMuted }]}>-</Text>
                              </Pressable>
                            ) : null}
                            <Text style={[styles.matchScore, { color: theme.colors.text }]}>
                              {match.scoreB}
                            </Text>
                            {ri === currentRound ? (
                              <Pressable
                                onPress={() => updateKnockoutScore(match.id, 'B', 1)}
                                style={[styles.scoreBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
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
            <Pressable
              onPress={advanceKnockout}
              style={[styles.advanceButton, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.advanceButtonText}>Avançar para próxima fase</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={reset}
            style={[
              styles.resetButton,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundElevated },
            ]}>
            <Text style={[styles.resetButtonText, { color: theme.colors.textMuted }]}>
              Reiniciar campeonato
            </Text>
          </Pressable>
        </View>
      ) : null}

      {phase === 'playing' && format === 'league' ? (
        <View style={styles.playingSection}>
          <Text style={[styles.roundName, { color: theme.colors.text }]}>Confrontos</Text>
          <View style={styles.matchList}>
            {leagueMatches.map((match) => (
              <View
                key={match.id}
                style={[
                  styles.matchCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: match.played ? theme.colors.primary : theme.colors.border,
                  },
                ]}>
                <View style={styles.matchTeamRow}>
                  <Text style={[styles.matchTeam, { color: theme.colors.text }]}>{match.teamA}</Text>
                  <View style={styles.matchScoreControls}>
                    <Pressable
                      onPress={() => updateLeagueScore(match.id, 'A', -1)}
                      style={[styles.scoreBtn, { borderColor: theme.colors.border }]}>
                      <Text style={[styles.scoreBtnText, { color: theme.colors.textMuted }]}>-</Text>
                    </Pressable>
                    <Text style={[styles.matchScore, { color: theme.colors.text }]}>{match.scoreA}</Text>
                    <Pressable
                      onPress={() => updateLeagueScore(match.id, 'A', 1)}
                      style={[styles.scoreBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                      <Text style={styles.scoreBtnTextWhite}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={[styles.matchDivider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.matchTeamRow}>
                  <Text style={[styles.matchTeam, { color: theme.colors.text }]}>{match.teamB}</Text>
                  <View style={styles.matchScoreControls}>
                    <Pressable
                      onPress={() => updateLeagueScore(match.id, 'B', -1)}
                      style={[styles.scoreBtn, { borderColor: theme.colors.border }]}>
                      <Text style={[styles.scoreBtnText, { color: theme.colors.textMuted }]}>-</Text>
                    </Pressable>
                    <Text style={[styles.matchScore, { color: theme.colors.text }]}>{match.scoreB}</Text>
                    <Pressable
                      onPress={() => updateLeagueScore(match.id, 'B', 1)}
                      style={[styles.scoreBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                      <Text style={styles.scoreBtnTextWhite}>+</Text>
                    </Pressable>
                  </View>
                </View>
                {!match.played ? (
                  <Pressable
                    onPress={() => markLeagueMatchPlayed(match.id)}
                    style={[styles.confirmButton, { borderColor: theme.colors.border }]}>
                    <Text style={[styles.confirmButtonText, { color: theme.colors.textMuted }]}>
                      Confirmar placar
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>

          {standings.length > 0 ? (
            <View style={styles.standingsSection}>
              <Text style={[styles.roundName, { color: theme.colors.text }]}>Classificação</Text>
              <View
                style={[
                  styles.standingsTable,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}>
                <View style={[styles.standingsHeader, { borderBottomColor: theme.colors.border }]}>
                  {['#', 'Time', 'J', 'V', 'E', 'D', 'GD', 'Pts'].map((h) => (
                    <Text
                      key={h}
                      style={[
                        styles.standingsHeaderCell,
                        { color: theme.colors.textMuted, flex: h === 'Time' ? 3 : 1 },
                      ]}>
                      {h}
                    </Text>
                  ))}
                </View>
                {standings.map((row, i) => (
                  <View
                    key={row.team}
                    style={[
                      styles.standingsRow,
                      i < standings.length - 1
                        ? { borderBottomColor: theme.colors.border, borderBottomWidth: 1 }
                        : null,
                    ]}>
                    <Text style={[styles.standingsCell, { color: theme.colors.secondary, flex: 1 }]}>
                      {i + 1}
                    </Text>
                    <Text style={[styles.standingsCell, { color: theme.colors.text, flex: 3 }]}>
                      {row.team}
                    </Text>
                    {[row.played, row.w, row.d, row.l, row.gd, row.pts].map((val, vi) => (
                      <Text
                        key={vi}
                        style={[
                          styles.standingsCell,
                          { color: theme.colors.textMuted, flex: 1, fontWeight: vi === 5 ? '800' : '400' },
                        ]}>
                        {val}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={reset}
            style={[
              styles.resetButton,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundElevated },
            ]}>
            <Text style={[styles.resetButtonText, { color: theme.colors.textMuted }]}>
              Reiniciar campeonato
            </Text>
          </Pressable>
        </View>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.tipsSection}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Dicas de uso</Text>
        <View style={styles.tipsList}>
          {[
            'Para mata-mata com 4 times: 2 semifinais e 1 final — use 4 times para ter um formato limpo.',
            'Para pontos corridos com 4 times: são 6 partidas no total (cada time joga 3 vezes).',
            'Com grupos de amigos, use o sorteador para definir os times antes de criar o campeonato.',
            'Use o cronômetro junto com este campeonato para controlar o tempo de cada jogo.',
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
            Torneio de sábado com 4 times: adicione "Time A", "Time B", "Time C" e "Time D",
            escolha "Mata-mata" e clique em "Gerar". A semifinal fica A×B e C×D. Após os
            jogos, ajuste o placar e clique em "Avançar para próxima fase" para gerar a final
            com os dois vencedores.
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
            { label: 'Rodízio de Times', href: '/ferramentas/rodizio-de-times' },
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
  addButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  teamList: { gap: 8 },
  teamChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  teamIndex: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', minWidth: 18 },
  teamName: { flex: 1, fontFamily: fonts.body, fontSize: 14 },
  removeText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  formatRow: { flexDirection: 'row', gap: 12 },
  formatCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  formatLabel: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  formatDesc: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  generateButton: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  generateButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  hint: { fontFamily: fonts.body, fontSize: 13 },
  playingSection: { gap: 18 },
  championCard: { borderWidth: 2, borderRadius: 20, padding: 20, alignItems: 'center', gap: 6 },
  championLabel: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  championName: { fontFamily: fonts.display, fontSize: 32, fontWeight: '900', textAlign: 'center' },
  roundSection: { gap: 12 },
  roundName: { fontFamily: fonts.heading, fontSize: 18, fontWeight: '800' },
  matchList: { gap: 10 },
  matchCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  matchTeamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  matchTeam: { flex: 1, fontFamily: fonts.heading, fontSize: 15, fontWeight: '700' },
  matchScoreControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchScore: { fontFamily: fonts.display, fontSize: 24, fontWeight: '900', minWidth: 30, textAlign: 'center' },
  scoreBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scoreBtnText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  scoreBtnTextWhite: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  matchDivider: { height: 1 },
  byeText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  confirmButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  confirmButtonText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700' },
  standingsSection: { gap: 12 },
  standingsTable: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  standingsHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  standingsHeaderCell: { fontFamily: fonts.heading, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  standingsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  standingsCell: { fontFamily: fonts.body, fontSize: 13 },
  advanceButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  advanceButtonText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  resetButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  resetButtonText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '700' },
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
