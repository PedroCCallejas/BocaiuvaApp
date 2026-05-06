import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import { getGoogleAuthRequestConfig, isGoogleSignInConfigured } from '@/config/auth/google';
import { Screen } from '@/components/ui/Screen';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';

WebBrowser.maybeCompleteAuthSession();

const schema = z.object({
  email: z.string().email('Informe um e-mail valido.'),
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres.'),
});

type LoginValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const theme = useAppTheme();
  const backendMode = useAppStore((state) => state.backendMode);
  const login = useAppStore((state) => state.login);
  const loginWithGoogle = useAppStore((state) => state.loginWithGoogle);
  const isMockMode = backendMode === 'mock';
  const googleConfigured = isGoogleSignInConfigured();
  const showGoogleLogin = !isMockMode && googleConfigured;
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    getGoogleAuthRequestConfig(),
  );
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (!response) {
      return;
    }

    if (response.type === 'dismiss' || response.type === 'cancel') {
      setGoogleLoading(false);
      return;
    }

    if (response.type !== 'success') {
      setGoogleLoading(false);
      Alert.alert('Nao foi possivel entrar com Google', 'Tente novamente em instantes.');
      return;
    }

    const idToken = response.params?.id_token;
    const accessToken = response.params?.access_token;

    if (!idToken) {
      setGoogleLoading(false);
      Alert.alert(
        'Nao foi possivel entrar com Google',
        'Faltou confirmar sua conta nesta tentativa. Tente novamente.',
      );
      return;
    }

    void (async () => {
      try {
        await loginWithGoogle({ idToken, accessToken: accessToken ?? null });
        router.replace('/');
      } catch (error) {
        Alert.alert(
          'Nao foi possivel entrar com Google',
          error instanceof Error ? error.message : 'Tente novamente.',
        );
      } finally {
        setGoogleLoading(false);
      }
    })();
  }, [loginWithGoogle, response]);

  async function onSubmit(values: LoginValues) {
    try {
      await login(values);
      router.replace('/');
    } catch (error) {
      Alert.alert(
        'Nao foi possivel entrar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function handleGoogleLogin() {
    if (!googleConfigured) {
      Alert.alert(
        'Esse acesso ainda nao esta pronto',
        'Entrar com Google sera liberado assim que a conta estiver configurada.',
      );
      return;
    }

    setGoogleLoading(true);

    try {
      await promptAsync();
    } catch (error) {
      setGoogleLoading(false);
      Alert.alert(
        'Nao foi possivel abrir o Google',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    }
  }

  async function handleDemo(email: string) {
    setDemoLoading(email);

    try {
      await login({ email, password: '123456' });
      router.replace('/');
    } catch (error) {
      Alert.alert(
        'Nao foi possivel entrar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: theme.colors.secondary }]}>Seu futebol organizado</Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Monte seu elenco, cuide das partidas e acompanhe tudo em um so lugar.
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          {isMockMode
            ? 'Use uma conta demo para explorar o fluxo completo e ver como seu time pode ficar.'
            : 'Entre com sua conta para continuar de onde parou ou use o Google para agilizar o acesso.'}
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
          label="Entrar"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
        {!isMockMode ? (
          <>
            {showGoogleLogin ? (
              <AppButton
                label="Entrar com Google"
                variant="secondary"
                onPress={() => void handleGoogleLogin()}
                disabled={!request}
                loading={googleLoading}
                fullWidth
              />
            ) : null}
            {!googleConfigured ? (
              <Text style={[styles.helperNote, { color: theme.colors.textMuted }]}>
                Esse acesso aparece assim que os dados do Google forem configurados no app.
              </Text>
            ) : !request ? (
              <Text style={[styles.helperNote, { color: theme.colors.textMuted }]}>
                Preparando a entrada com Google.
              </Text>
            ) : null}
          </>
        ) : null}
        <View style={styles.row}>
          <AppButton
            label="Criar conta"
            variant="secondary"
            onPress={() => router.push('/register')}
          />
          <AppButton
            label="Esqueci a senha"
            variant="ghost"
            onPress={() => router.push('/forgot-password')}
          />
        </View>
      </View>

      {isMockMode ? (
        <View style={styles.demoSection}>
          <Text style={[styles.demoTitle, { color: theme.colors.text }]}>Acesso rapido</Text>
          <View style={styles.demoRow}>
            <AppButton
              label="Admin demo"
              variant="secondary"
              onPress={() => void handleDemo('admin@bocaiuva.app')}
              loading={demoLoading === 'admin@bocaiuva.app'}
            />
            <AppButton
              label="Gestor demo"
              variant="secondary"
              onPress={() => void handleDemo('gestor@bocaiuva.app')}
              loading={demoLoading === 'gestor@bocaiuva.app'}
            />
            <AppButton
              label="Atacante demo"
              variant="secondary"
              onPress={() => void handleDemo('atacante@bocaiuva.app')}
              loading={demoLoading === 'atacante@bocaiuva.app'}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  hero: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  helperNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  demoSection: {
    gap: 10,
  },
  demoTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  demoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
