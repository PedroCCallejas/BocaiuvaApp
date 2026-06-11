import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppButton } from '@/components/ui/AppButton';
import { Pill } from '@/components/ui/Pill';
import { APP_NAME } from '@/constants/branding';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam, selectCurrentUser } from '@/store/selectors';

const FEATURE_CARDS = [
  {
    title: 'Elenco em um só lugar',
    description:
      'Cadastre jogadores, organize posições, acompanhe status e mantenha o grupo atualizado sem planilhas soltas.',
  },
  {
    title: 'Partidas e presença',
    description:
      'Agende jogos, confirme presenças, publique escalações e mantenha a preparação do time mais clara.',
  },
  {
    title: 'Estatísticas e rankings',
    description:
      'Registre resultados, gols, assistências, MVP, notas e acompanhe a evolução do elenco com histórico.',
  },
  {
    title: 'Convites por código',
    description:
      'Cada atleta entra no time por convite, sem depender de mensagens perdidas ou acessos improvisados.',
  },
  {
    title: 'Galeria pública opcional',
    description:
      'Times podem liberar apenas o perfil público que desejarem para amistosos e visibilidade externa.',
  },
  {
    title: 'Rotina mais profissional',
    description:
      'Centralize informações importantes e reduza desencontro de horário, local, presença e contato.',
  },
];

const PROBLEM_CARDS = [
  {
    title: 'Fim do improviso',
    description:
      'O Professô FC evita aquele cenário de grupo bagunçado, presença incerta e informação espalhada.',
  },
  {
    title: 'Mais clareza para o elenco',
    description:
      'Cada jogador entende onde consultar partidas, presença, convites, histórico e perfil do time.',
  },
  {
    title: 'Histórico que não se perde',
    description:
      'Resultados, números e resenhas deixam de depender da memória de quem organizou o último jogo.',
  },
];

const START_STEPS = [
  {
    title: '1. Crie sua conta',
    description:
      'Use e-mail e senha para começar. Se o acesso com Google estiver disponível, ele também aparece no login.',
  },
  {
    title: '2. Monte ou entre em um time',
    description:
      'Você pode criar a estrutura do seu elenco ou entrar com um código de convite enviado pelo administrador.',
  },
  {
    title: '3. Organize a rotina do futebol',
    description:
      'Depois disso, o time passa a usar o app para elenco, partidas, presença, estatísticas e galeria pública.',
  },
];

export default function IndexScreen() {
  const theme = useAppTheme();
  const user = useAppStore(selectCurrentUser);
  const team = useAppStore(selectCurrentTeam);

  if (user && team) {
    return <Redirect href="/home" />;
  }

  if (user) {
    return <Redirect href={'/team-access' as never} />;
  }

  return (
    <PublicPageShell
      eyebrow="Organização para futebol amador e society"
      title={`${APP_NAME}: gestão simples para times que querem jogar melhor fora e dentro de campo`}
      description="O Professô FC ajuda administradores e jogadores a organizar elenco, partidas, presença, histórico, estatísticas e perfis públicos sem transformar a rotina do time em improviso."
      actions={[
        { label: 'Criar conta', href: '/register' },
        { label: 'Ver galeria pública', href: '/teams-gallery', variant: 'secondary' },
        { label: 'Entrar', href: '/login', variant: 'ghost' },
      ]}>
      <View style={styles.badgeRow}>
        <Pill label="Para times amadores, society e resenha organizada" />
        <Pill label="Convites por código" />
        <Pill label="Galeria pública opcional" />
      </View>

      <View style={styles.grid}>
        {PROBLEM_CARDS.map((card) => (
          <PublicCard
            key={card.title}
            title={card.title}
            description={card.description}
          />
        ))}
      </View>

      <SectionHeader
        title="Principais recursos"
        description="A plataforma foi pensada para a rotina de quem monta time, confirma presença e acompanha o desempenho do grupo ao longo da temporada."
      />
      <View style={styles.grid}>
        {FEATURE_CARDS.map((card) => (
          <PublicCard
            key={card.title}
            title={card.title}
            description={card.description}
          />
        ))}
      </View>

      <SectionHeader
        title="Como começar"
        description="Quem chega agora encontra um caminho simples para conhecer o projeto, criar conta e entrar no próprio elenco."
      />
      <View style={styles.grid}>
        {START_STEPS.map((step) => (
          <PublicCard key={step.title} title={step.title} description={step.description} />
        ))}
      </View>

      <SectionHeader
        title="O que a área pública mostra"
        description="A vitrine pública existe para explicar o produto e ajudar na descoberta de times. Ela não expõe dados privados do ambiente interno."
      />
      <View style={styles.trustRow}>
        <TrustCard
          title="Galeria com limite claro"
          description="A galeria pública mostra apenas times que optaram por divulgar perfil, localização básica, contato liberado e números agregados."
        />
        <TrustCard
          title="Dados protegidos"
          description="Escalações internas, presença, notas, votos, histórico privado e informações administrativas continuam fora da área pública."
        />
      </View>

      <View
        style={[
          styles.ctaCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.ctaTitle, { color: theme.colors.text }]}>
          Conheça o fluxo antes de entrar no seu time
        </Text>
        <Text style={[styles.ctaDescription, { color: theme.colors.textMuted }]}>
          Você pode explorar a galeria pública agora, entender a proposta do produto e depois criar sua conta para receber convite ou montar o seu próprio elenco.
        </Text>
        <View style={styles.ctaButtons}>
          <AppButton label="Ver galeria pública" onPress={() => router.push('/teams-gallery')} />
          <AppButton
            label="Criar conta"
            variant="secondary"
            onPress={() => router.push('/register')}
          />
        </View>
      </View>
    </PublicPageShell>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const theme = useAppTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.sectionDescription, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
    </View>
  );
}

function PublicCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.cardDescription, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
    </View>
  );
}

function TrustCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.trustCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.cardDescription, { color: theme.colors.textMuted }]}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionHeader: {
    gap: 6,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  sectionDescription: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 880,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  card: {
    flexGrow: 1,
    flexBasis: 280,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  cardDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  trustCard: {
    flexGrow: 1,
    flexBasis: 320,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  ctaCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 22,
    gap: 12,
  },
  ctaTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  ctaDescription: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
  },
  ctaButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 4,
  },
});
