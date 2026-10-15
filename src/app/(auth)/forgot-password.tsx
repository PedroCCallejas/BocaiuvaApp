import { Alert, StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';

const schema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
});

type ForgotValues = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const theme = useAppTheme();
  const resetPassword = useAppStore((state) => state.resetPassword);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotValues) {
    try {
      await resetPassword(values.email);
      Alert.alert(
        'Link enviado',
        'Se existir uma conta com esse e-mail, o link de recuperação já foi enviado.',
      );
      router.back();
    } catch (error) {
      Alert.alert(
        'Não foi possível enviar o link',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <PublicPageShell title="Recuperar senha" description="Informe seu e-mail para receber o link de redefinição.">
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
          name="email"
          render={({ field }) => (
            <AppInput
              label="E-mail"
              autoCapitalize="none"
              keyboardType="email-address"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              error={errors.email?.message}
            />
          )}
        />
        <AppButton
          label="Enviar link"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
        <AppButton
          label="Voltar ao login"
          variant="ghost"
          onPress={() => router.replace('/login')}
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
