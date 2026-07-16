import { StyleSheet, Text, View } from 'react-native';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const SECTIONS = [
  {
    title: '1. O que esta página cobre',
    description:
      'Esta política explica, em linguagem simples, como o Professô FC trata dados necessários para autenticação, organização de times, convites, galeria pública e suporte ao funcionamento do aplicativo.',
  },
  {
    title: '2. Dados usados para a conta',
    description:
      'Para criar e acessar sua conta, o serviço pode utilizar nome, e-mail, identificadores de autenticação e informações necessárias para manter a sessão do usuário.',
  },
  {
    title: '3. Dados do time e do elenco',
    description:
      'Dentro da área privada, o aplicativo pode armazenar informações de time, jogadores, partidas, presença, rankings, estatísticas, votos e notas conforme a rotina escolhida pelo administrador do elenco.',
  },
  {
    title: '4. O que pode aparecer na área pública',
    description:
      'A galeria pública mostra apenas dados que o próprio time decidiu divulgar, como nome, escudo, localização básica, descrição pública, contato para amistoso e números agregados.',
  },
  {
    title: '5. O que não vai para a galeria pública',
    description:
      'Dados privados, presença interna, notas, votos de MVP, informações administrativas, histórico protegido e conteúdo não liberado pelo time não devem aparecer na vitrine pública.',
  },
  {
    title: '6. Segurança e acesso',
    description:
      'O acesso às áreas privadas depende de autenticação e do vínculo do usuário com o time. Quando um acesso deixa de existir, o app procura remover esse contexto do ambiente autenticado.',
  },
];

export default function PrivacyScreen() {
  const theme = useAppTheme();

  return (
    <PublicPageShell
      seo={{
        title: 'Política de Privacidade | Professô FC',
        description: 'Saiba como o Professô FC coleta, utiliza, protege e permite o gerenciamento dos dados dos usuários.',
        canonicalPath: '/privacidade',
      }}
      eyebrow="Privacidade"
      title="Política de privacidade do Professô FC"
      description="Este resumo público foi feito para explicar com clareza o uso de dados no contexto do produto, da galeria pública e das áreas protegidas do time."
      actions={[
        { label: 'Ver termos', href: '/termos', variant: 'secondary' },
        { label: 'Falar com suporte', href: '/suporte', variant: 'ghost' },
      ]}>
      <View style={styles.list}>
        {SECTIONS.map((section) => (
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
