import { Alert, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { APP_NAME } from '@/constants/branding';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';

const schema = z.object({
  displayName: z.string().min(3, 'Informe um nome com ao menos 3 caracteres.'),
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres.'),
});

type RegisterValues = z.infer<typeof schema>;

export default function RegisterScreen() {
  const theme = useAppTheme();
  const register = useAppStore((state) => state.register);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: RegisterValues) {
    try {
      await register(values);
      router.replace('/');
    } catch (error) {
      Alert.alert(
        'Não foi possível criar a conta',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <PublicPageShell
      eyebrow="Cadastro"
      title="Crie sua conta e comece a organizar o seu time"
      description={`Com uma conta no ${APP_NAME}, você pode receber convites, criar seu próprio elenco, acompanhar partidas e navegar pela área pública com mais contexto.`}
      actions={[
        { label: 'Conhecer o projeto', href: '/' },
        { label: 'Ver galeria pública', href: '/teams-gallery', variant: 'secondary' },
        { label: 'Entrar', href: '/login', variant: 'ghost' },
      ]}>
      <View
        style={[
          styles.helperCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.helperTitle, { color: theme.colors.text }]}>
          Depois do cadastro
        </Text>
        <Text style={[styles.helperDescription, { color: theme.colors.textMuted }]}>
          Você poderá criar um time, entrar com um código de convite ou abrir a galeria pública
          para conhecer elencos que decidiram se apresentar.
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Controller
          control={control}
          name="displayName"
          render={({ field }) => (
            <AppInput
              label="Seu nome"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.displayName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <AppInput
              label="E-mail"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <AppInput
              label="Senha"
              secureTextEntry
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.password?.message}
            />
          )}
        />
        <AppButton
          label="Criar conta"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
        <View style={styles.actionsRow}>
          <AppButton label="Voltar para o login" variant="ghost" onPress={() => router.push('/login')} />
          <AppButton
            label="Ver galeria pública"
            variant="secondary"
            onPress={() => router.push('/teams-gallery')}
          />
        </View>
      </View>
    </PublicPageShell>
  );
}

const styles = StyleSheet.create({
  helperCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 8,
  },
  helperTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  helperDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
