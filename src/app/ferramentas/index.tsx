import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { SafeAd } from '@/components/ads/SafeAd';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { ToolBadge } from '@/components/tools/ToolBadge';
import { ToolCard } from '@/components/tools/ToolCard';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { ToolPrimaryButton } from '@/components/tools/ToolPrimaryButton';
import { ToolSection } from '@/components/tools/ToolSection';
import { TOOL_COLORS } from '@/components/tools/tool-theme';
import { AD_PLACEMENTS } from '@/constants/ads';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const TOOLS = [
  {
    label: 'Sorteador de Times',
    href: '/ferramentas/sorteador-de-times',
    tag: 'Futebol · Society · Futsal',
    description:
      'Distribua jogadores em times equilibrados de forma aleatória, por potes de habilidade ou pela ordem de chegada na pelada.',
  },
  {
    label: 'Cronômetro de Pelada',
    href: '/ferramentas/cronometro-pelada',
    tag: 'Pelada · Rachão',
    description:
      'Controle o tempo de cada partida, registre gols e veja quem ganhou. Configura duração e limite de gols.',
  },
  {
    label: 'Rodízio de Times',
    href: '/ferramentas/rodizio-de-times',
    tag: 'Rachão · Society',
    description:
      'Organize a fila de quem joga, com vencedor ficando e perdedor saindo. Monta os times automaticamente pela ordem de chegada.',
  },
  {
    label: 'Campeonato Rápido',
    href: '/ferramentas/campeonato-rapido',
    tag: 'Torneio · Mata-mata',
    description:
      'Crie um mini-campeonato entre amigos com mata-mata ou pontos corridos, gere os confrontos e registre os resultados.',
  },
];

const FAQ = [
  {
    q: 'Preciso criar conta para usar as ferramentas?',
    a: 'Não. Todas as ferramentas funcionam sem login, sem instalação e sem cadastro. Basta abrir a página e começar.',
  },
  {
    q: 'Os dados são salvos entre sessões?',
    a: 'As ferramentas funcionam localmente no navegador. Ao fechar ou recarregar a página, o estado é reiniciado. Para histórico permanente, crie uma conta no Professô FC.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. As ferramentas são responsivas e funcionam bem em qualquer dispositivo — celular, tablet ou computador.',
  },
  {
    q: 'As ferramentas funcionam para futsal e rachão também?',
    a: 'Sim. O sorteador e o cronômetro se adaptam a qualquer quantidade de jogadores e tempo de jogo. O rodízio foi especialmente pensado para o formato de rachão.',
  },
];

function LegacyToolsHubScreen() {
  const theme = useAppTheme();

  return (
    <PublicPageShell
      eyebrow="Ferramentas gratuitas"
      title="Organize sua pelada do jeito certo"
      description="Ferramentas práticas para sortear times, controlar partidas e organizar campeonatos. Gratuitas, sem cadastro e funcionam direto no navegador."
      actions={[
        { label: 'Sorteador de times', href: '/ferramentas/sorteador-de-times' },
        { label: 'Cronômetro', href: '/ferramentas/cronometro-pelada', variant: 'secondary' },
      ]}>
      <View style={styles.intro}>
        <Text style={[styles.introTitle, { color: theme.colors.text }]}>
          Por que organizar a pelada antes de o jogo começar?
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          Times mal sorteados, placar esquecido e fila sem ordem são os maiores problemas de
          uma pelada. Com um sorteio justo, cronômetro definido e rodízio organizado, todo
          mundo joga mais, discute menos e passa mais tempo com a bola nos pés.
        </Text>
        <Text style={[styles.introText, { color: theme.colors.textMuted }]}>
          As ferramentas abaixo foram feitas para futebol amador, society, futsal e rachão.
          Funcionam sem login, sem instalação e salvam tempo toda semana na organização do
          grupo.
        </Text>
      </View>

      <View style={styles.toolsGrid}>
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.href}
            accessibilityRole="link"
            onPress={() => router.push(tool.href as never)}
            style={({ pressed }) => [
              styles.toolCard,
              {
                backgroundColor: pressed ? theme.colors.primarySoft : theme.colors.surface,
                borderColor: pressed ? theme.colors.primary : theme.colors.border,
              },
            ]}>
            <Text style={[styles.toolTag, { color: theme.colors.secondary }]}>{tool.tag}</Text>
            <Text style={[styles.toolLabel, { color: theme.colors.text }]}>{tool.label}</Text>
            <Text style={[styles.toolDescription, { color: theme.colors.textMuted }]}>
              {tool.description}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
          Para quem são essas ferramentas?
        </Text>
        <Text style={[styles.sectionText, { color: theme.colors.textMuted }]}>
          Qualquer pessoa que organiza uma pelada, um rachão ou um torneio de futebol entre
          amigos pode usar. O organizador típico é aquele que chega antes, monta os times,
          controla o tempo e cuida da fila — e agora tem um conjunto de ferramentas para
          fazer isso com agilidade.
        </Text>
        <Text style={[styles.sectionText, { color: theme.colors.textMuted }]}>
          Para quem quer ir além, o Professô FC oferece uma plataforma completa com histórico
          de partidas, presença de jogadores, escalação, ranking, notas e muito mais.
        </Text>
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
    </PublicPageShell>
  );
}

const HUB_TOOLS = [
  {
    label: 'Sorteador de Times',
    href: '/ferramentas/sorteador-de-times',
    tag: 'Futebol · Society · Futsal',
    description:
      'Monte times aleatorios ou equilibrados por potes. Ideal para deixar a pelada mais justa.',
    action: 'Sortear times',
  },
  {
    label: 'Cronometro da Pelada',
    href: '/ferramentas/cronometro-pelada',
    tag: 'Tempo · Placar · Gols',
    description: 'Controle o tempo, o placar e o limite de gols da partida.',
    action: 'Abrir cronometro',
  },
  {
    label: 'Lista da Pelada',
    href: '/ferramentas/rodizio-de-times',
    tag: 'Fila · Rachao · Rotacao',
    description: 'Rode a fila de quem entra e sai respeitando a ordem de chegada.',
    action: 'Rodar lista',
  },
  {
    label: 'Campeonato Rapido',
    href: '/ferramentas/campeonato-rapido',
    tag: 'Mata-mata · Grupo · Final',
    description: 'Crie confrontos simples para mata-mata ou disputa rapida entre times.',
    action: 'Criar campeonato',
  },
];

const HUB_FAQ = [
  {
    q: 'Preciso criar conta para usar as ferramentas?',
    a: 'Nao. Todas as ferramentas desta area funcionam sem login e direto pelo navegador.',
  },
  {
    q: 'Serve so para futebol de campo?',
    a: 'Nao. A area foi pensada para futebol, society, futsal e qualquer rachao que precise organizar times, fila e tempo de jogo.',
  },
  {
    q: 'Funciona bem no celular?',
    a: 'Sim. A prioridade aqui e mobile, mas as ferramentas tambem ficam boas em tablet e desktop.',
  },
  {
    q: 'Os dados ficam salvos?',
    a: 'As ferramentas usam armazenamento local do navegador quando faz sentido, sem depender de conta nem enviar dados para o app interno.',
  },
];

export default function ToolsHubScreen() {
  return (
    <ToolPageShell
      title="Ferramentas da Pelada"
      subtitle="Organize seu rachao em poucos segundos."
      description="Monte times equilibrados, rode a lista de quem entra e sai, controle o tempo da partida e crie campeonatos rapidos para sua turma. Tudo gratis, direto pelo navegador e sem precisar criar conta."
      actions={[
        { label: 'Sortear times', href: '/ferramentas/sorteador-de-times' },
        { label: 'Abrir cronometro', href: '/ferramentas/cronometro-pelada', variant: 'secondary' },
      ]}>
      <ToolSection
        kicker="Escolha a ferramenta"
        title="Tudo o que a turma precisa antes da bola rolar"
        description="Cada ferramenta resolve uma parte da organizacao da pelada. Use separadamente ou combine sorteio, cronometro, lista e campeonato no mesmo dia.">
        <View style={styles.toolsGrid}>
          {HUB_TOOLS.map((tool, index) => (
            <ToolCard key={tool.href} tone={index === 1 ? 'field' : 'default'} style={styles.toolCard}>
              <ToolBadge label={tool.tag} tone={index === 3 ? 'highlight' : 'accent'} />
              <Text style={styles.toolLabelAlt}>{tool.label}</Text>
              <Text style={styles.toolDescriptionAlt}>{tool.description}</Text>
              <ToolPrimaryButton
                label={tool.action}
                variant={index === 0 ? 'primary' : 'secondary'}
                onPress={() => router.push(tool.href as never)}
              />
            </ToolCard>
          ))}
        </View>
      </ToolSection>

      <SafeAd placement={AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS} hasContent />

      <ToolSection
        kicker="Para qualquer grupo"
        title="Area publica, util e sem enrolacao"
        description="Essa area foi desenhada para o organizador da turma que quer resolver rapido: montar times, tocar a fila, marcar tempo e criar confrontos sem planilha.">
        <View style={styles.reasonGrid}>
          {[
            'Sem cadastro para comecar.',
            'Pensado para quadra, society e campo.',
            'Bom para pelada casual ou mais competitiva.',
          ].map((item) => (
            <ToolCard key={item} tone="field" style={styles.reasonCard}>
              <Text style={styles.reasonText}>{item}</Text>
            </ToolCard>
          ))}
        </View>
      </ToolSection>

      <ToolSection
        kicker="Perguntas rapidas"
        title="O que o pessoal sempre quer saber">
        <View style={styles.faqList}>
          {HUB_FAQ.map((item) => (
            <ToolCard key={item.q} style={styles.faqCardAlt}>
              <Text style={styles.faqQAlt}>{item.q}</Text>
              <Text style={styles.faqAAlt}>{item.a}</Text>
            </ToolCard>
          ))}
        </View>
      </ToolSection>
    </ToolPageShell>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: 12,
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
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  toolCard: {
    flexGrow: 1,
    flexBasis: 260,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  toolTag: {
    fontFamily: fonts.heading,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toolLabel: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  toolDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  toolLabelAlt: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
    color: TOOL_COLORS.text,
  },
  toolDescriptionAlt: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: TOOL_COLORS.textMuted,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
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
  faqCardAlt: {
    gap: 10,
  },
  faqQ: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  faqQAlt: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    color: TOOL_COLORS.text,
  },
  faqA: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  faqAAlt: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
    color: TOOL_COLORS.textMuted,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  reasonCard: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 96,
    justifyContent: 'center',
  },
  reasonText: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
    color: TOOL_COLORS.text,
  },
});
