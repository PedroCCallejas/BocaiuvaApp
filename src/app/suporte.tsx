import { StyleSheet, Text, View } from 'react-native';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppButton } from '@/components/ui/AppButton';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { router } from 'expo-router';

const FAQS = [
  {
    title: 'Como criar minha conta?',
    description:
      'Acesse a área de cadastro, informe nome, e-mail e senha. Depois disso, você já pode criar seu time ou entrar por convite.',
  },
  {
    title: 'Como entro em um time existente?',
    description:
      'Peça o código de convite ao administrador do time. Após o login, use esse código para entrar no elenco certo.',
  },
  {
    title: 'A galeria pública mostra tudo?',
    description:
      'Não. A galeria exibe apenas o perfil público liberado pelo próprio time. Dados internos e protegidos continuam fora da vitrine.',
  },
  {
    title: 'O que fazer se meu acesso não aparecer?',
    description:
      'Se você recebeu convite recentemente ou trocou de conta, faça login com o e-mail correto e atualize o acesso. Se necessário, fale com o administrador do time.',
  },
];

export default function SupportScreen() {
  const theme = useAppTheme();

  return (
    <PublicPageShell
      eyebrow="Suporte"
      title="Ajuda pública para conhecer e começar no Professô FC"
      description="Esta página foi pensada para orientar visitantes, atletas e administradores que estão conhecendo o produto antes de entrar em um time."
      actions={[
        { label: 'Criar conta', href: '/register' },
        { label: 'Ver galeria pública', href: '/teams-gallery', variant: 'secondary' },
      ]}>
      <View
        style={[
          styles.highlight,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.highlightTitle, { color: theme.colors.text }]}>
          Quando procurar o administrador do time
        </Text>
        <Text style={[styles.highlightDescription, { color: theme.colors.textMuted }]}>
          Se a sua dúvida for sobre convite, entrada em elenco específico, contato para amistoso ou
          perfil público de um time, o caminho mais rápido costuma ser falar com o administrador que
          enviou o código ou publicou o perfil.
        </Text>
      </View>

      <View style={styles.list}>
        {FAQS.map((item) => (
          <View
            key={item.title}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{item.title}</Text>
            <Text style={[styles.description, { color: theme.colors.textMuted }]}>
              {item.description}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={[
          styles.actionsCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Próximos passos úteis</Text>
        <View style={styles.actionsRow}>
          <AppButton label="Conhecer o projeto" variant="ghost" onPress={() => router.push('/')} />
          <AppButton
            label="Privacidade"
            variant="secondary"
            onPress={() => router.push('/privacidade' as never)}
          />
          <AppButton
            label="Termos"
            variant="secondary"
            onPress={() => router.push('/termos' as never)}
          />
        </View>
      </View>
    </PublicPageShell>
  );
}

const styles = StyleSheet.create({
  highlight: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  highlightTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  highlightDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  list: {
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  actionsCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
