import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { ToolActionTile } from '@/components/tools/ToolActionTile';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { ToolSection } from '@/components/tools/ToolSection';
import { TOOL_COLORS } from '@/components/tools/tool-theme';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';

const TILES = [
  {
    icon: '⚽',
    title: 'Sortear Times',
    description: 'Times equilibrados',
    href: '/ferramentas/sorteador-de-times',
  },
  {
    icon: '⏱',
    title: 'Cronômetro',
    description: 'Tempo e gols',
    href: '/ferramentas/cronometro-pelada',
  },
  {
    icon: '🔄',
    title: 'Rodar Lista',
    description: 'Quem entra e sai',
    href: '/ferramentas/rodizio-de-times',
  },
  {
    icon: '🏆',
    title: 'Campeonato',
    description: 'Jogos rápidos',
    href: '/ferramentas/campeonato-rapido',
  },
];

const STEPS = [
  { num: '1', title: 'Adicione a turma', detail: 'Digite os nomes dos jogadores ou times.' },
  { num: '2', title: 'Escolha a ferramenta', detail: 'Sorteio, cronômetro, lista ou campeonato.' },
  { num: '3', title: 'Deixe a lista rodar', detail: 'O app cuida da ordem, do tempo e do placar.' },
];

const SPORTS = ['Society', 'Futsal', 'Campo', 'Rachão', 'Treino'];

const HUB_FAQ = [
  {
    q: 'Preciso criar conta?',
    a: 'Não. Todas as ferramentas funcionam sem login, diretamente no navegador.',
  },
  {
    q: 'Os dados ficam salvos?',
    a: 'O cronômetro e o rodízio salvam o estado no dispositivo. Ao fechar a aba, o estado é reiniciado nos outros.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. Prioridade total para mobile, mas funciona bem em tablet e desktop também.',
  },
  {
    q: 'Serve para futsal e rachão?',
    a: 'Sim. O sorteador, cronômetro e rodízio se adaptam a qualquer quantidade de jogadores e formato de jogo.',
  },
];

export default function ToolsHubScreen() {
  return (
    <ToolPageShell
      title="Ferramentas da Pelada"
      subtitle="Sorteie. Cronometre. Rode a lista."
      description="Tudo direto na quadra, sem login."
      actions={[{ label: 'Começar agora', href: '/ferramentas/sorteador-de-times' }]}>

      {/* 4 grandes tiles */}
      <View style={styles.tilesGrid}>
        {TILES.map((tile) => (
          <ToolActionTile
            key={tile.href}
            icon={tile.icon}
            title={tile.title}
            description={tile.description}
            onPress={() => router.push(tile.href as never)}
            style={styles.tile}
          />
        ))}
      </View>

      <SafeAd placement={AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS} hasContent />

      {/* Como usar */}
      <ToolSection kicker="Na prática" title="Como usar na quadra">
        <View style={styles.stepsCol}>
          {STEPS.map((step) => (
            <View key={step.num} style={styles.stepRow}>
              <View style={styles.stepNumBox}>
                <Text style={styles.stepNum}>{step.num}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ToolSection>

      {/* Feito para */}
      <View style={styles.sportsSection}>
        <Text style={styles.sportsLabel}>Feito para</Text>
        <View style={styles.sportsRow}>
          {SPORTS.map((sport) => (
            <View key={sport} style={styles.sportPill}>
              <Text style={styles.sportText}>{sport}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* FAQ compacto */}
      <ToolSection kicker="Dúvidas" title="O que o pessoal pergunta">
        <View style={styles.faqList}>
          {HUB_FAQ.map((item) => (
            <View key={item.q} style={styles.faqCard}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Text style={styles.faqA}>{item.a}</Text>
            </View>
          ))}
        </View>
      </ToolSection>
    </ToolPageShell>
  );
}

const styles = StyleSheet.create({
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  stepsCol: {
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  stepNumBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TOOL_COLORS.accentSoft,
    borderWidth: 1,
    borderColor: TOOL_COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '900',
    color: TOOL_COLORS.accent,
  },
  stepContent: {
    flex: 1,
    gap: 2,
    paddingTop: 6,
  },
  stepTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    color: TOOL_COLORS.text,
  },
  stepDetail: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: TOOL_COLORS.textSoft,
  },
  sportsSection: {
    gap: 10,
  },
  sportsLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: TOOL_COLORS.highlight,
  },
  sportsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sportPill: {
    borderWidth: 1,
    borderColor: TOOL_COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: TOOL_COLORS.card,
  },
  sportText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    color: TOOL_COLORS.textMuted,
  },
  faqList: {
    gap: 10,
  },
  faqCard: {
    borderWidth: 1,
    borderColor: TOOL_COLORS.border,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    backgroundColor: TOOL_COLORS.card,
  },
  faqQ: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
    color: TOOL_COLORS.text,
  },
  faqA: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: TOOL_COLORS.textMuted,
  },
});
