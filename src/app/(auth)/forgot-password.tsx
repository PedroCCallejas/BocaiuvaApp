import { Alert, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { Screen } from '@/components/ui/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';

const schema = z.object({
  email: z.string().email('Informe um e-mail valido.'),
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
        'Se existir uma conta com esse e-mail, o link de recuperacao foi enviado.',
      );
      router.back();
    } catch (error) {
      Alert.alert(
        'Nao foi possivel enviar o link',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  return (
    <Screen formMode contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Recuperar senha</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Informe o e-mail da conta para receber o link de redefinicao de senha.
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 14,
  },
});
