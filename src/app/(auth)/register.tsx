import { Alert, StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';

import { getSafeReturnPath } from '@/lib/navigation';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
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
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
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
      router.replace(getSafeReturnPath(next) as never);
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
      title="Criar conta"
      description="Crie sua conta para usar as ferramentas e organizar seu futebol."
      >

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
      </View>
    </PublicPageShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    gap: 14,
  },
});
