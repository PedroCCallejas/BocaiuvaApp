import { StyleSheet, Text, View } from 'react-native';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const SECTIONS = [
  {
    title: '1. Responsável e alcance',
    description:
      'O Professô FC é responsável pelo tratamento realizado dentro do produto. Solicitações sobre privacidade, acesso ou exclusão podem ser abertas pela página de suporte. Esta política se aplica à versão web do serviço.',
  },
  {
    title: '2. Dados tratados',
    description:
      'Podemos tratar nome, e-mail, identificador de autenticação, vínculos com times, dados de jogadores, fotos, vídeos, partidas, presença, estatísticas, votos, avaliações, despesas, preferências de aviso e informações técnicas do navegador.',
  },
  {
    title: '3. Finalidades',
    description:
      'Os dados são usados para autenticar a conta, organizar times e partidas, administrar elenco e finanças, calcular estatísticas, enviar avisos solicitados, prevenir abuso, prestar suporte e cumprir obrigações aplicáveis.',
  },
  {
    title: '4. Área pública e mídias',
    description:
      'A galeria mostra somente times marcados como públicos. Fotos e vídeos pessoais ficam em armazenamento privado; quando o administrador ativa o elenco público, o acesso temporário a essas mídias é liberado apenas para a vitrine publicada.',
  },
  {
    title: '5. Compartilhamento e fornecedores',
    description:
      'Usamos Firebase para autenticação, Supabase para banco, arquivos e funções de servidor, Vercel para hospedagem e serviços do Google quando a pessoa escolhe login Google ou quando publicidade web está habilitada. Cada fornecedor trata dados conforme sua função técnica.',
  },
  {
    title: '6. Segurança e permissões',
    description:
      'Áreas privadas exigem autenticação e vínculo ativo com o time. O banco aplica permissões por linha, mídias pessoais usam buckets privados e operações privilegiadas são executadas apenas no servidor.',
  },
  {
    title: '7. Retenção e exclusão',
    description:
      'Mantemos os dados enquanto a conta ou o time estiver ativo e pelo período necessário para segurança e obrigações aplicáveis. A exclusão da conta remove vínculos, inscrições de aviso e dados pessoais; registros esportivos necessários ao histórico são anonimizados.',
  },
  {
    title: '8. Seus direitos',
    description:
      'Você pode solicitar confirmação do tratamento, acesso, correção, portabilidade quando aplicável, informação sobre compartilhamentos, oposição, revogação de consentimento e eliminação de dados pessoais. Na área Conta e acesso, “Baixar meus dados” gera uma cópia em JSON.',
  },
  {
    title: '9. Como excluir a conta',
    description:
      'Na área Conta e acesso, use “Excluir minha conta”. Proprietários devem antes excluir ou transferir seus times. Se a exclusão automática não for concluída, use a página de suporte.',
  },
  {
    title: '10. Crianças, adolescentes e atualização',
    description:
      'Administradores devem ter autorização adequada para cadastrar dados e mídias de menores de idade. Esta política foi atualizada em 3 de setembro de 2026 e poderá ser revista quando o produto ou os fornecedores mudarem.',
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
