import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import {
  getGoogleAuthDebugInfo,
  getGoogleAuthRequestConfig,
  getGoogleSignInSetupHint,
  isGoogleSignInConfigured,
} from '@/config/auth/google';
import { Screen } from '@/components/ui/Screen';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  extractGoogleAuthTokens,
  getGoogleAuthRuntimeHint,
  isExpoGoForGoogleAuth,
} from '@/services/auth/google-auth';
import { useAppStore } from '@/store/app-store';

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
  const googleSetupHint = !googleConfigured && __DEV__ ? getGoogleSignInSetupHint() : null;
  const isExpoGo = isExpoGoForGoogleAuth();
  const showGoogleLogin = !isMockMode && googleConfigured;
  const showGoogleSetupHint = Boolean(googleSetupHint);
  const googleRuntimeHint = getGoogleAuthRuntimeHint();
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleDebugInfo = useMemo(() => getGoogleAuthDebugInfo(), []);
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
    if (__DEV__) {
      console.info('[google-auth] request-config', googleDebugInfo);
    }
  }, [googleDebugInfo]);

  useEffect(() => {
    if (!response) {
      return;
    }

    const { idToken, accessToken, errorMessage, idTokenSource } =
      extractGoogleAuthTokens(response);

    if (__DEV__) {
      const debugResponse = response as typeof response & {
        params?: Record<string, string>;
      };
      console.info('[google-auth] response', {
        platform: googleDebugInfo.platform,
        responseType: response.type,
        redirectUri: googleDebugInfo.redirectUri,
        clientIdUsed: googleDebugInfo.clientIdUsed,
        idTokenFound: Boolean(idToken),
        params: debugResponse.params ?? null,
      });
    }

    if (response.type === 'dismiss' || response.type === 'cancel') {
      setGoogleLoading(false);
      return;
    }

    if (response.type !== 'success') {
      setGoogleLoading(false);
      Alert.alert(
        'Nao foi possivel entrar com Google',
        'A autenticacao foi interrompida antes da confirmacao final.',
      );
      return;
    }

    console.info('[google-auth] auth-success', {
      platform: googleDebugInfo.platform,
      redirectUri: googleDebugInfo.redirectUri,
      clientIdUsed: googleDebugInfo.clientIdUsed,
      responseType: response.type,
    });

    if (!idToken) {
      setGoogleLoading(false);
      if (__DEV__) {
        console.warn('[google-auth] missing-id-token', {
          platform: googleDebugInfo.platform,
          responseType: response.type,
          redirectUri: googleDebugInfo.redirectUri,
          clientIdUsed: googleDebugInfo.clientIdUsed,
          idTokenFound: false,
          error: errorMessage,
        });
      }
      Alert.alert(
        'Nao foi possivel entrar com Google',
        'O Google nao devolveu o token de login. Revise o client ID e o redirect do app.',
      );
      return;
    }

    console.info('[google-auth] id-token-found', {
      platform: googleDebugInfo.platform,
      clientIdUsed: googleDebugInfo.clientIdUsed,
      responseType: response.type,
      source: idTokenSource,
      redirectUri: googleDebugInfo.redirectUri,
      idTokenFound: true,
    });

    void (async () => {
      try {
        await loginWithGoogle({ idToken, accessToken: accessToken ?? null });
        console.info('[google-auth] firebase-login-success', {
          platform: googleDebugInfo.platform,
          redirectUri: googleDebugInfo.redirectUri,
          clientIdUsed: googleDebugInfo.clientIdUsed,
          responseType: response.type,
          idTokenFound: true,
          tokenSource: idTokenSource,
        });
        router.replace('/');
      } catch (error) {
        console.warn('[google-auth] firebase-login-error', {
          platform: googleDebugInfo.platform,
          redirectUri: googleDebugInfo.redirectUri,
          clientIdUsed: googleDebugInfo.clientIdUsed,
          responseType: response.type,
          idTokenFound: true,
          error: error instanceof Error ? error.message : error,
        });
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
    if (isExpoGo) {
      Alert.alert(
        'Use um development build',
        googleRuntimeHint ??
          'Entrar com Google precisa ser testado em development build ou build instalada.',
      );
      return;
    }

    if (!googleConfigured) {
      Alert.alert(
        'Esse acesso ainda nao esta pronto',
        googleSetupHint ??
          'Entrar com Google sera liberado assim que a conta estiver configurada.',
      );
      return;
    }

    setGoogleLoading(true);

    try {
      console.log(`[GOOGLE_AUTH] redirectUri: ${googleDebugInfo.redirectUri}`);
      if (__DEV__) {
        console.info('[google-auth] prompt', googleDebugInfo);
      }
      await promptAsync({
        showInRecents: true,
      });
    } catch (error) {
      setGoogleLoading(false);
      if (__DEV__) {
        console.warn('[google-auth] prompt-error', {
          platform: googleDebugInfo.platform,
          redirectUri: googleDebugInfo.redirectUri,
          clientIdUsed: googleDebugInfo.clientIdUsed,
          error: error instanceof Error ? error.message : error,
        });
      }
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
    <Screen formMode contentContainerStyle={styles.screen}>
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
                disabled={!request || isExpoGo}
                loading={googleLoading}
                fullWidth
              />
            ) : null}
            {showGoogleSetupHint ? (
              <Text style={[styles.helperNote, { color: theme.colors.textMuted }]}>
                {googleSetupHint}
              </Text>
            ) : showGoogleLogin && isExpoGo ? (
              <Text style={[styles.helperNote, { color: theme.colors.textMuted }]}>
                {googleRuntimeHint}
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
