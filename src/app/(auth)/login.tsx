import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { z } from 'zod';

import {
  getGoogleAuthRequestConfig,
  getGoogleAuthDebugInfo,
  isGoogleSignInConfigured,
} from '@/config/auth/google';
import { PublicPageShell } from '@/components/public/PublicPageShell';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { APP_NAME } from '@/constants/branding';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  extractGoogleAuthTokens,
  isExpoGoForGoogleAuth,
} from '@/services/auth/google-auth';
import { toFriendlyAuthError } from '@/services/auth';
import type { GoogleLoginInput } from '@/services/repository/types';
import { useAppStore } from '@/store/app-store';

const schema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres.'),
});

type LoginValues = z.infer<typeof schema>;
type ErrorWithCode = Error & { code?: string };

const GOOGLE_LOGIN_USER_MESSAGE =
  'Não foi possível entrar com Google. Tente novamente ou use e-mail e senha.';

function getErrorDebugInfo(error: unknown) {
  if (error instanceof Error) {
    return {
      code: (error as ErrorWithCode).code ?? null,
      message: error.message,
    };
  }

  return {
    code: null,
    message: String(error),
  };
}

export default function LoginScreen() {
  const isWeb = Platform.OS === 'web';
  const theme = useAppTheme();
  const backendMode = useAppStore((state) => state.backendMode);
  const login = useAppStore((state) => state.login);
  const loginWithGoogle = useAppStore((state) => state.loginWithGoogle);
  const isMockMode = backendMode === 'mock';
  const googleConfigured = isGoogleSignInConfigured();
  const isExpoGo = !isWeb && isExpoGoForGoogleAuth();
  const showGoogleLogin = !isMockMode && googleConfigured;
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleFeedbackMessage, setGoogleFeedbackMessage] = useState<string | null>(null);
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

  async function handleGoogleLoginWeb() {
    setGoogleFeedbackMessage(null);

    if (!googleConfigured) {
      Alert.alert(
        'Esse acesso ainda não está pronto',
        'Entrar com o Google será liberado assim que a conta estiver configurada.',
      );
      return;
    }

    if (__DEV__) {
      console.log('[google-auth] pressed', {
        platform: 'web',
      });
      console.log('[google-auth] web-start', {
        ...getGoogleAuthDebugInfo(),
        flow: 'firebase.signInWithPopup',
      });
      console.log('[google-auth] web-debug', getGoogleAuthDebugInfo());
    }

    setGoogleLoading(true);

    try {
      await loginWithGoogle({});
      router.replace('/');
    } catch (error) {
      const friendlyError = toFriendlyAuthError(
        error,
        GOOGLE_LOGIN_USER_MESSAGE,
      );
      if (__DEV__) {
        console.warn('[google-auth] web-error', {
          ...getErrorDebugInfo(error),
          friendlyMessage: friendlyError.message,
        });
      }
      setGoogleFeedbackMessage(GOOGLE_LOGIN_USER_MESSAGE);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function onSubmit(values: LoginValues) {
    try {
      await login(values);
      router.replace('/');
    } catch (error) {
      Alert.alert(
        'Não foi possível entrar',
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
        'Não foi possível entrar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <PublicPageShell
      eyebrow="Acesso à plataforma"
      title="Entre no Professô FC e retome a rotina do seu time"
      description={
        isMockMode
          ? 'Use uma conta demonstrativa para conhecer a navegação do produto, entender a proposta e explorar a organização de um elenco completo.'
          : `Entre com sua conta para abrir o ${APP_NAME}, receber convites, acompanhar partidas e acessar a galeria pública de times.`
      }
      actions={[
        { label: 'Conhecer o projeto', href: '/' },
        { label: 'Ver galeria pública', href: '/teams-gallery', variant: 'secondary' },
        { label: 'Criar conta', href: '/register', variant: 'ghost' },
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
          Como funciona o acesso
        </Text>
        <Text style={[styles.helperDescription, { color: theme.colors.textMuted }]}>
          Entre com e-mail e senha para abrir seus times, usar convites e acompanhar elenco,
          partidas, presença, estatísticas e perfis públicos.
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
          label="Entrar com e-mail"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          fullWidth
        />
        {!isMockMode ? (
          <>
            {showGoogleLogin && isWeb ? (
              <AppButton
                label="Entrar com Google"
                variant="secondary"
                onPress={() => void handleGoogleLoginWeb()}
                loading={googleLoading}
                fullWidth
              />
            ) : null}
            {showGoogleLogin && isWeb && googleFeedbackMessage ? (
              <Text style={[styles.helperNote, { color: theme.colors.danger }]}>
                {googleFeedbackMessage}
              </Text>
            ) : null}
            {showGoogleLogin && !isWeb ? (
              <NativeGoogleLoginAction
                googleLoading={googleLoading}
                loginWithGoogle={loginWithGoogle}
                onLoadingChange={setGoogleLoading}
              />
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
          <Text style={[styles.demoTitle, { color: theme.colors.text }]}>Acesso rápido</Text>
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
    </PublicPageShell>
  );
}

function NativeGoogleLoginAction({
  googleLoading,
  loginWithGoogle,
  onLoadingChange,
}: {
  googleLoading: boolean;
  loginWithGoogle: (input: GoogleLoginInput) => Promise<void>;
  onLoadingChange: (loading: boolean) => void;
}) {
  const theme = useAppTheme();
  const isExpoGo = isExpoGoForGoogleAuth();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
    getGoogleAuthRequestConfig(),
  );

  useEffect(() => {
    if (!response) {
      return;
    }

    if (__DEV__) {
      console.log('[google-auth] native-response', {
        type: response.type,
      });
    }

    const { idToken, accessToken, errorMessage } = extractGoogleAuthTokens(response);

    if (response.type === 'dismiss' || response.type === 'cancel') {
      onLoadingChange(false);
      return;
    }

    if (response.type !== 'success') {
      onLoadingChange(false);
      const friendlyError = toFriendlyAuthError(
        new Error(errorMessage ?? 'A autenticação foi interrompida antes da confirmação final.'),
        'Não foi possível entrar com o Google agora.',
      );
      if (__DEV__) {
        console.warn('[google-auth] native-error', {
          type: response.type,
          message: friendlyError.message,
        });
      }
      Alert.alert('Não foi possível entrar com o Google', friendlyError.message);
      return;
    }

    if (!idToken) {
      onLoadingChange(false);
      const friendlyError = toFriendlyAuthError(
        new Error(
          errorMessage ??
            'O acesso com o Google não foi concluído. Tente novamente em alguns instantes.',
        ),
        'Não foi possível entrar com o Google agora.',
      );
      if (__DEV__) {
        console.warn('[google-auth] native-error', {
          type: response.type,
          message: friendlyError.message,
          idTokenSource: null,
        });
      }
      Alert.alert('Não foi possível entrar com o Google', friendlyError.message);
      return;
    }

    void (async () => {
      try {
        if (__DEV__) {
          console.log('[google-auth] native-start', {
            ...getGoogleAuthDebugInfo(),
            flow: 'expo-auth-session-id-token',
          });
          console.log('[google-auth] native-debug', getGoogleAuthDebugInfo());
        }

        await loginWithGoogle({ idToken, accessToken: accessToken ?? null });
        router.replace('/');
      } catch (error) {
        const friendlyError = toFriendlyAuthError(
          error,
          'Não foi possível entrar com o Google agora.',
        );
        if (__DEV__) {
          console.warn('[google-auth] native-error', {
            ...getErrorDebugInfo(error),
            friendlyMessage: friendlyError.message,
          });
        }
        Alert.alert('Não foi possível entrar com o Google', friendlyError.message);
      } finally {
        onLoadingChange(false);
      }
    })();
  }, [loginWithGoogle, onLoadingChange, response]);

  async function handleGoogleLogin() {
    if (__DEV__) {
      console.log('[google-auth] pressed', {
        platform: Platform.OS,
        hasRequest: Boolean(request),
        isExpoGo,
      });
    }

    if (isExpoGo) {
      Alert.alert(
        'Google indisponível neste ambiente',
        'Abra a versão instalada do app para continuar com o acesso pelo Google.',
      );
      return;
    }

    onLoadingChange(true);

    try {
      if (__DEV__) {
        console.log('[google-auth] native-start', {
          ...getGoogleAuthDebugInfo(),
          flow: 'expo-auth-session-id-token',
        });
      }
      await promptAsync({
        showInRecents: true,
      });
    } catch (error) {
      onLoadingChange(false);
      const friendlyError = toFriendlyAuthError(
        error,
        'Não foi possível abrir o Google agora.',
      );
      if (__DEV__) {
        console.warn('[google-auth] native-open-error', {
          ...getErrorDebugInfo(error),
          friendlyMessage: friendlyError.message,
        });
      }
      Alert.alert('Não foi possível abrir o Google', friendlyError.message);
    }
  }

  return (
    <>
      <AppButton
        label="Entrar com Google"
        variant="secondary"
        onPress={() => void handleGoogleLogin()}
        disabled={!request || isExpoGo}
        loading={googleLoading}
        fullWidth
      />
      {!request ? (
        <Text style={[styles.helperNote, { color: theme.colors.textMuted }]}>
          Preparando a entrada com o Google.
        </Text>
      ) : null}
    </>
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
