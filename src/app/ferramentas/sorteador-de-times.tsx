import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { TOOL_COLORS } from '@/components/tools/tool-theme';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import {
  type PlayerWithPot,
  type PotNumber,
  type SortResult,
  sortByPots,
  sortRandomly,
} from '@/lib/pickup-tools';

const C = TOOL_COLORS;

type SortMode = 'random' | 'potes';

const PER_TEAM_OPTIONS = [3, 4, 5, 6, 7];
const POT_OPTIONS: PotNumber[] = [1, 2, 3, 4];
const POT_COLORS: Record<PotNumber, string> = {
  1: '#16A34A',
  2: '#2563EB',
  3: '#D97706',
  4: '#9333EA',
};

const FAQ = [
  {
    q: 'O que é o sorteador de times?',
    a: 'Uma ferramenta gratuita para dividir jogadores em times de forma aleatória ou equilibrada por nível (potes), sem precisar instalar nada.',
  },
  {
    q: 'Como funciona o modo Potes?',
    a: 'Você atribui cada jogador a um pote de 1 a 4 (1 = melhor). A distribuição coloca um número proporcional de cada pote em cada time, equilibrando o nível geral.',
  },
  {
    q: 'O que são reservas?',
    a: 'Quando o total de jogadores não é múltiplo do tamanho do time, os jogadores restantes ficam como reservas para substituições.',
  },
  {
    q: 'Posso sortear mais de 2 times?',
    a: 'Sim. Se você tiver 15 jogadores e escolher 5 por time, o sorteador cria 3 times automaticamente.',
  },
];

export default function SorteadorScreen() {
  const [mode, setMode] = useState<SortMode>('random');
  const [perTeam, setPerTeam] = useState(5);
  const [inputValue, setInputValue] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [playerPots, setPlayerPots] = useState<Record<string, PotNumber>>({});
  const [result, setResult] = useState<SortResult | null>(null);

  function addPlayer() {
    const name = inputValue.trim();
    if (!name || players.includes(name)) return;
    setPlayers((prev) => [...prev, name]);
    setPlayerPots((prev) => ({ ...prev, [name]: 1 }));
    setInputValue('');
    setResult(null);
  }

  function removePlayer(name: string) {
    setPlayers((prev) => prev.filter((p) => p !== name));
    setPlayerPots((prev) => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    setResult(null);
  }

  function setPot(name: string, pot: PotNumber) {
    setPlayerPots((prev) => ({ ...prev, [name]: pot }));
    setResult(null);
  }

  function sort() {
    if (players.length < 2) return;
    if (mode === 'random') {
      setResult(sortRandomly(players, perTeam));
    } else {
      const withPots: PlayerWithPot[] = players.map((name) => ({
        name,
        pot: playerPots[name] ?? 1,
      }));
      setResult(sortByPots(withPots, perTeam));
    }
  }

  const hasResult = result !== null && result.teams.length > 0;

  return (
    <ToolPageShell
      title="Sortear Times"
      subtitle="Escolha os jogadores e deixa o app dividir."
      seoTitle="Sorteador de Times Online Grátis | Professô FC"
      seoDescription="Sorteie times equilibrados para pelada, society e futsal. Divisão simples ou por potes de nível, sem login e direto no navegador."
      compactHero>

      {/* Mode selector */}
      <View style={styles.modeRow}>
        {(['random', 'potes'] as SortMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => { setMode(m); setResult(null); }}
            style={[
              styles.modeChip,
              {
                backgroundColor: mode === m ? '#16A34A' : C.cardMuted,
                borderColor: mode === m ? '#16A34A' : C.border,
              },
            ]}>
            <Text style={[styles.modeChipText, { color: mode === m ? '#FFF' : C.textMuted }]}>
              {m === 'random' ? 'Aleatório' : 'Por potes'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'potes' ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Pote 1 = melhores jogadores. Distribui proporcionalmente para equilibrar os times.
            Use os botões P1–P4 ao lado de cada nome.
          </Text>
        </View>
      ) : null}

      {/* Players per team */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Jogadores por time</Text>
        <View style={styles.optionsRow}>
          {PER_TEAM_OPTIONS.map((n) => (
            <Pressable
              key={n}
              onPress={() => { setPerTeam(n); setResult(null); }}
              style={[
                styles.optionChip,
                {
                  backgroundColor: perTeam === n ? '#16A34A' : C.cardMuted,
                  borderColor: perTeam === n ? '#16A34A' : C.border,
                },
              ]}>
              <Text style={[styles.optionChipText, { color: perTeam === n ? '#FFF' : C.textMuted }]}>
                {n}v{n}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Add players */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Adicionar jogador</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={addPlayer}
            placeholder="Nome do jogador"
            placeholderTextColor={C.textMuted}
            style={styles.textInput}
            returnKeyType="done"
          />
          <Pressable onPress={addPlayer} style={styles.addButton}>
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Player list */}
      {players.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {players.length} jogador{players.length > 1 ? 'es' : ''} · {Math.floor(players.length / perTeam)} time{Math.floor(players.length / perTeam) > 1 ? 's' : ''}{players.length % perTeam > 0 ? ` + ${players.length % perTeam} reserva${players.length % perTeam > 1 ? 's' : ''}` : ''}
          </Text>
          <View style={styles.playerList}>
            {players.map((name, idx) => (
              <View key={name} style={styles.playerRow}>
                <Text style={styles.playerIndex}>{idx + 1}</Text>
                <Text style={styles.playerName} numberOfLines={1}>{name}</Text>

                {mode === 'potes' ? (
                  <View style={styles.potSelector}>
                    {POT_OPTIONS.map((pot) => (
                      <Pressable
                        key={pot}
                        onPress={() => setPot(name, pot)}
                        style={[
                          styles.potChip,
                          {
                            backgroundColor:
                              playerPots[name] === pot ? POT_COLORS[pot] : C.cardMuted,
                            borderColor:
                              playerPots[name] === pot ? POT_COLORS[pot] : C.border,
                          },
                        ]}>
                        <Text style={[styles.potChipText, { color: playerPots[name] === pot ? '#FFF' : C.textMuted }]}>
                          P{pot}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Pressable onPress={() => removePlayer(name)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            onPress={sort}
            disabled={players.length < 2}
            style={[
              styles.sortButton,
              { backgroundColor: players.length < 2 ? C.cardMuted : '#16A34A' },
            ]}>
            <Text style={[styles.sortButtonText, { color: players.length < 2 ? C.textMuted : '#FFF' }]}>
              Sortear agora
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Result */}
      {result ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resultado do sorteio</Text>
          {result.teams.map((team, ti) => (
            <View key={ti} style={styles.teamCard}>
              <View style={styles.teamHeader}>
                <View style={styles.teamBadge}>
                  <Text style={styles.teamBadgeText}>Time {ti + 1}</Text>
                </View>
                <Text style={styles.teamCount}>
                  {team.length} jogador{team.length > 1 ? 'es' : ''}
                </Text>
              </View>
              <View style={styles.teamPlayers}>
                {team.map((name, pi) => (
                  <View key={name} style={styles.playerChip}>
                    {mode === 'potes' ? (
                      <View style={[styles.potDot, { backgroundColor: POT_COLORS[playerPots[name] ?? 1] }]} />
                    ) : null}
                    <Text style={styles.playerChipText}>{pi + 1}. {name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {result.reservas.length > 0 ? (
            <View style={styles.reservasCard}>
              <Text style={styles.reservasTitle}>Reservas ({result.reservas.length})</Text>
              <Text style={styles.reservasNames}>{result.reservas.join(', ')}</Text>
            </View>
          ) : null}

          <Pressable onPress={sort} style={styles.resortButton}>
            <Text style={styles.resortButtonText}>Sortear novamente</Text>
          </Pressable>
        </View>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.editorial}>
        <Text style={styles.sectionTitle}>Como montar times equilibrados</Text>
        <Text style={styles.editorialText}>
          A divisão por potes é a forma mais justa de equilibrar times em peladas. Classifique
          cada jogador de 1 a 4 conforme o nível técnico e o sorteador distribui proporcionalmente,
          garantindo que cada time tenha a mesma quantidade de jogadores de cada faixa de nível.
          Isso evita times desequilibrados e torna o jogo mais divertido para todos.
        </Text>
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
        <Text style={styles.sectionTitle}>Outras ferramentas</Text>
        <View style={styles.relatedRow}>
          {[
            { label: 'Cronômetro de Pelada', href: '/ferramentas/cronometro-pelada' },
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
  modeRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  modeChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  modeChipText: { fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  infoBox: { borderWidth: 1, borderRadius: 14, padding: 14, backgroundColor: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.3)' },
  infoText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: C.textMuted },
  section: { gap: 12 },
  sectionLabel: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.textMuted },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, fontWeight: '800', color: C.text },
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
    color: C.text,
    backgroundColor: C.cardMuted,
    borderColor: C.border,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
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
    backgroundColor: C.card,
    borderColor: C.border,
  },
  playerIndex: { fontFamily: fonts.heading, fontSize: 12, fontWeight: '700', width: 20, color: C.textMuted },
  playerName: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: C.text },
  potSelector: { flexDirection: 'row', gap: 4 },
  potChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  potChipText: { fontFamily: fonts.heading, fontSize: 11, fontWeight: '800' },
  removeButton: { padding: 4 },
  removeButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', color: C.textMuted },
  sortButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sortButtonText: { fontFamily: fonts.heading, fontSize: 16, fontWeight: '800' },
  teamCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', borderColor: C.borderStrong, backgroundColor: C.card },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  teamBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#16A34A' },
  teamBadgeText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '800', color: '#FFF' },
  teamCount: { fontFamily: fonts.body, fontSize: 13, color: C.textMuted },
  teamPlayers: { padding: 12, gap: 8 },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.cardMuted,
    borderColor: C.border,
  },
  potDot: { width: 8, height: 8, borderRadius: 4 },
  playerChipText: { fontFamily: fonts.body, fontSize: 14, color: C.text },
  reservasCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6, backgroundColor: C.card, borderColor: C.border },
  reservasTitle: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.textMuted },
  reservasNames: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: C.text },
  resortButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderColor: '#16A34A' },
  resortButtonText: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800', color: '#16A34A' },
  editorial: { gap: 10 },
  editorialText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: C.textMuted },
  faqList: { gap: 12 },
  faqCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, backgroundColor: C.card, borderColor: C.border },
  faqQ: { fontFamily: fonts.heading, fontSize: 15, fontWeight: '800', color: C.text },
  faqA: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: C.textMuted },
  relatedLinks: { gap: 12 },
  relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  relatedChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.card, borderColor: C.border },
  relatedChipText: { fontFamily: fonts.heading, fontSize: 13, fontWeight: '700', color: C.accentLight },
});
