import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type SortMode = 'random' | 'potes' | 'ordem';

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortPlayers(players: string[], perTeam: number, mode: SortMode): string[][] {
  if (players.length === 0 || perTeam < 1) return [];

  let ordered: string[];

  if (mode === 'random') {
    ordered = shuffleArray(players);
  } else if (mode === 'potes') {
    const half = Math.ceil(players.length / 2);
    const pot1 = players.slice(0, half);
    const pot2 = players.slice(half);
    const numTeams = Math.ceil(players.length / perTeam);
    const teams: string[][] = Array.from({ length: numTeams }, () => []);
    pot1.forEach((p, i) => teams[i % numTeams].push(p));
    pot2.forEach((p, i) => teams[i % numTeams].push(p));
    return teams;
  } else {
    ordered = [...players];
  }

  const teams: string[][] = [];
  for (let i = 0; i < ordered.length; i += perTeam) {
    teams.push(ordered.slice(i, i + perTeam));
  }
  return teams;
}

const MODES: { key: SortMode; label: string; description: string }[] = [
  {
    key: 'random',
    label: 'Aleatório',
    description: 'Sorteia sem critério — cada jogador vai para um time por acaso.',
  },
  {
    key: 'potes',
    label: 'Por potes',
    description:
      'Divide em dois grupos (os primeiros = pote 1, os demais = pote 2) e distribui um de cada para cada time.',
  },
  {
    key: 'ordem',
    label: 'Por chegada',
    description: 'Monta os times na sequência em que os jogadores foram adicionados.',
  },
];

const PER_TEAM_OPTIONS = [3, 4, 5, 6, 7, 8];

const FAQ = [
  {
    q: 'Como funciona o modo por potes?',
    a: 'Os primeiros jogadores da lista são colocados no pote 1 (os melhores, que devem ser adicionados primeiro). Os demais vão para o pote 2. O sorteador distribui um jogador do pote 1 para cada time e completa com jogadores do pote 2. Isso equilibra os times.',
  },
  {
    q: 'O que acontece se o total de jogadores não for múltiplo do número por time?',
    a: 'O último time ficará com menos jogadores do que os outros. O resultado mostra quantos há em cada time para você decidir como completar.',
  },
  {
    q: 'Posso sortear novamente sem refazer a lista?',
    a: 'Sim. Basta clicar em "Sortear" novamente — a lista de jogadores fica salva e um novo sorteio é gerado.',
  },
  {
    q: 'Funciona para futsal, society e rachão?',
    a: 'Sim. Basta ajustar o número de jogadores por time: 5 para futsal, 6 para society, ou o que combinar no seu grupo.',
  },
];

export default function SorteadorScreen() {
  const theme = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [inputValue, setInputValue] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [perTeam, setPerTeam] = useState(5);
  const [mode, setMode] = useState<SortMode>('random');
  const [teams, setTeams] = useState<string[][] | null>(null);

  function addPlayer() {
    const name = inputValue.trim();
    if (!name) return;
    if (players.includes(name)) {
      setInputValue('');
      return;
    }
    setPlayers((prev) => [...prev, name]);
    setInputValue('');
    setTeams(null);
    inputRef.current?.focus();
  }

  function removePlayer(index: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== index));
    setTeams(null);
  }

  function sort() {
    if (players.length < 2) return;
    setTeams(sortPlayers(players, perTeam, mode));
  }

  function clear() {
    setPlayers([]);
    setTeams(null);
    setInputValue('');
  }

  const hasResult = teams !== null && teams.length > 0;

  return (
    <PublicPageShell
      eyebrow="Ferramenta gratuita"
      title="Sorteador de Times"
      description="Distribua jogadores em times equilibrados de forma aleatória, por potes de habilidade ou pela ordem de chegada. Sem login, sem instalação."
      actions={[
        { label: 'Cronômetro', href: '/ferramentas/cronometro-pelada', variant: 'secondary' },
        { label: 'Rodízio', href: '/ferramentas/rodizio-de-times', variant: 'ghost' },
      ]}>
      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: theme.colors.text }]}>
          Como usar o sorteador
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Adicione os nomes dos jogadores um por um, escolha quantos vão em cada time e
          selecione o modo de sorteio. Clique em "Sortear" para ver os times formados.
          Os times são gerados na hora, sem precisar de login ou cadastro.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Adicionar jogadores</Text>
        <Text style={[styles.cardSubtitle, { color: theme.colors.textMuted }]}>
          {players.length === 0
            ? 'Nenhum jogador adicionado ainda.'
            : `${players.length} jogador${players.length > 1 ? 'es' : ''} adicionado${players.length > 1 ? 's' : ''}.`}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={addPlayer}
            placeholder="Nome do jogador"
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
                <Text style={[styles.playerName, { color: theme.colors.text }]}>{player}</Text>
                <Pressable
                  onPress={() => removePlayer(index)}
                  hitSlop={8}
                  style={styles.removeButton}>
                  <Text style={[styles.removeButtonText, { color: theme.colors.textMuted }]}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
          Jogadores por time
        </Text>
        <View style={styles.optionsRow}>
          {PER_TEAM_OPTIONS.map((n) => (
            <Pressable
              key={n}
              onPress={() => { setPerTeam(n); setTeams(null); }}
              style={[
                styles.optionChip,
                {
                  backgroundColor: perTeam === n ? theme.colors.primary : theme.colors.backgroundElevated,
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
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Modo de sorteio</Text>
        <View style={styles.modeList}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => { setMode(m.key); setTeams(null); }}
              style={[
                styles.modeOption,
                {
                  backgroundColor:
                    mode === m.key ? theme.colors.primarySoft : theme.colors.backgroundElevated,
                  borderColor: mode === m.key ? theme.colors.primary : theme.colors.border,
                },
              ]}>
              <Text style={[styles.modeLabel, { color: theme.colors.text }]}>{m.label}</Text>
              <Text style={[styles.modeDescription, { color: theme.colors.textMuted }]}>
                {m.description}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={sort}
          disabled={players.length < 2}
          style={[
            styles.sortButton,
            {
              backgroundColor:
                players.length < 2 ? theme.colors.backgroundElevated : theme.colors.primary,
              borderColor:
                players.length < 2 ? theme.colors.border : theme.colors.primary,
            },
          ]}>
          <Text
            style={[
              styles.sortButtonText,
              { color: players.length < 2 ? theme.colors.textMuted : '#FFFFFF' },
            ]}>
            Sortear times
          </Text>
        </Pressable>
        {players.length > 0 ? (
          <Pressable
            onPress={clear}
            style={[
              styles.clearButton,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundElevated },
            ]}>
            <Text style={[styles.clearButtonText, { color: theme.colors.textMuted }]}>
              Limpar lista
            </Text>
          </Pressable>
        ) : null}
      </View>

      {players.length < 2 && players.length > 0 ? (
        <Text style={[styles.warning, { color: theme.colors.textMuted }]}>
          Adicione pelo menos 2 jogadores para sortear.
        </Text>
      ) : null}

      {hasResult ? (
        <View style={styles.resultSection}>
          <Text style={[styles.resultTitle, { color: theme.colors.text }]}>
            Times sorteados
          </Text>
          <Text style={[styles.resultSubtitle, { color: theme.colors.textMuted }]}>
            Modo: {MODES.find((m) => m.key === mode)?.label} · {perTeam} por time
          </Text>
          <View style={styles.teamsGrid}>
            {teams!.map((team, teamIndex) => (
              <View
                key={teamIndex}
                style={[
                  styles.teamCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}>
                <Text style={[styles.teamLabel, { color: theme.colors.secondary }]}>
                  Time {teamIndex + 1}
                  {team.length < perTeam ? ' (incompleto)' : ''}
                </Text>
                {team.map((player, pi) => (
                  <Text key={pi} style={[styles.teamPlayer, { color: theme.colors.text }]}>
                    {pi + 1}. {player}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <SafeAd placement={AD_PLACEMENTS.TOOLS_AFTER_RESULT} hasContent={hasResult} />

      <View style={styles.tipsSection}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Dicas para sortear times equilibrados
        </Text>
        <View style={styles.tipsList}>
          {[
            'Use o modo "Por potes" quando houver diferença clara de nível entre os jogadores — adicione primeiro os melhores para garantir a distribuição correta.',
            'Para peladas com substituição, adicione todos os jogadores e gere mais times do que vão jogar ao mesmo tempo.',
            'Se o total não fechar exato, o último time ficará incompleto. Você pode completar com quem estiver de fora ou ajustar o número por time.',
            'Rode o sorteio novamente se o resultado parecer desequilibrado — cada clique gera uma distribuição nova.',
          ].map((tip, i) => (
            <View key={i} style={styles.tipItem}>
              <Text style={[styles.tipBullet, { color: theme.colors.secondary }]}>•</Text>
              <Text style={[styles.tipText, { color: theme.colors.textMuted }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.example}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Exemplo prático
        </Text>
        <View
          style={[
            styles.exampleCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}>
          <Text style={[styles.exampleText, { color: theme.colors.textMuted }]}>
            Pelada com 15 jogadores, 5 por time → 3 times. Com 16 jogadores, o quarto time
            terá 1 jogador — coloque mais 4 para completar ou ajuste para 4 por time e gere
            4 times completos.
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
        <Text style={[styles.relatedTitle, { color: theme.colors.text }]}>
          Outras ferramentas
        </Text>
        <View style={styles.relatedRow}>
          {[
            { label: 'Cronômetro de Pelada', href: '/ferramentas/cronometro-pelada' },
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
  intro: {
    gap: 10,
  },
  introTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  introText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  addButton: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  addButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  playerList: {
    gap: 8,
  },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playerIndex: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 18,
  },
  playerName: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  removeButton: {
    padding: 2,
  },
  removeButtonText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  optionChipText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  modeList: {
    gap: 10,
  },
  modeOption: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  modeLabel: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  modeDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sortButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortButtonText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  clearButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  warning: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  resultSection: {
    gap: 14,
  },
  resultTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  resultSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8,
  },
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  teamCard: {
    flexGrow: 1,
    flexBasis: 200,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  teamLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  teamPlayer: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  tipsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  tipsList: {
    gap: 10,
  },
  tipItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  tipBullet: {
    fontFamily: fonts.heading,
    fontSize: 16,
    lineHeight: 22,
  },
  tipText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  example: {
    gap: 12,
  },
  exampleCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  exampleText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  faqList: {
    gap: 12,
  },
  faqCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  faqQ: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  faqA: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  relatedLinks: {
    gap: 12,
  },
  relatedTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  relatedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  relatedChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  relatedChipText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
});
