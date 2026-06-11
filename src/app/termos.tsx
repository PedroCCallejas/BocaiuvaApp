import { StyleSheet, Text, View } from 'react-native';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const TERMS = [
  {
    title: '1. Uso da plataforma',
    description:
      'O Professô FC existe para organização de times de futebol amador e society. O uso deve respeitar a rotina do próprio grupo e a legislação aplicável.',
  },
  {
    title: '2. Responsabilidade sobre o conteúdo do time',
    description:
      'Cada administrador é responsável pelas informações que publica sobre elenco, partidas, convites, contatos e perfil público do seu time.',
  },
  {
    title: '3. Convites e acesso',
    description:
      'O acesso a um time depende de convite, vínculo autorizado ou criação do próprio elenco. O compartilhamento do código deve ser feito com cuidado pelo administrador.',
  },
  {
    title: '4. Área pública',
    description:
      'A galeria pública serve para descoberta e apresentação. Ela não substitui o ambiente privado do time nem deve ser usada para expor informações sensíveis.',
  },
  {
    title: '5. Disponibilidade e melhorias',
    description:
      'O produto pode receber ajustes, correções e evoluções ao longo do tempo. Recursos públicos e privados podem ser refinados sem alterar a finalidade principal da plataforma.',
  },
  {
    title: '6. Suporte',
    description:
      'Se houver dúvida sobre cadastro, convite, navegação ou funcionamento público, utilize a página de suporte e o canal informado por quem disponibilizou este site.',
  },
];

export default function TermsScreen() {
  const theme = useAppTheme();

  return (
    <PublicPageShell
      eyebrow="Termos"
      title="Termos de uso do Professô FC"
      description="Esta versão pública resume as regras básicas para uso do produto, da galeria pública e do fluxo de organização dos times."
      actions={[
        { label: 'Política de privacidade', href: '/privacidade', variant: 'secondary' },
        { label: 'Suporte', href: '/suporte', variant: 'ghost' },
      ]}>
      <View style={styles.list}>
        {TERMS.map((section) => (
          <View
            key={section.title}
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{section.title}</Text>
            <Text style={[styles.description, { color: theme.colors.textMuted }]}>
              {section.description}
            </Text>
          </View>
        ))}
      </View>
    </PublicPageShell>
  );
}

const styles = StyleSheet.create({
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
});
