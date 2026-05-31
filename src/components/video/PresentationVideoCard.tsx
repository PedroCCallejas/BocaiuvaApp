import { createElement, useMemo, useState } from 'react';
import {
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { openExternalUrl } from '@/lib/external-url';

interface PresentationVideoCardProps {
  title: string;
  description: string;
  videoUrl: string;
  posterUrl?: string | null;
  accentColors?: [string, string];
}

export function PresentationVideoCard({
  title,
  description,
  videoUrl,
  posterUrl,
  accentColors,
}: PresentationVideoCardProps) {
  const theme = useAppTheme();
  const [hasError, setHasError] = useState(false);
  const [opening, setOpening] = useState(false);
  const resolvedAccentColors = useMemo<[string, string]>(
    () => accentColors ?? [theme.colors.primary, theme.colors.secondary],
    [accentColors, theme.colors.primary, theme.colors.secondary],
  );

  async function handleOpenVideo() {
    try {
      setOpening(true);
      await openExternalUrl(videoUrl);
    } catch (error) {
      Alert.alert(
        'Não foi possível abrir o vídeo',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
      setHasError(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <View style={styles.copyBlock}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>{description}</Text>
      </View>

      <LinearGradient
        colors={[
          `${resolvedAccentColors[0]}18`,
          `${resolvedAccentColors[1]}28`,
          theme.colors.backgroundElevated,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.storyPanel}>
        {Platform.OS === 'web' ? (
          <View style={styles.storyFrame}>
            {hasError ? (
              <View style={styles.errorShell}>
                <Text style={[styles.error, { color: theme.colors.warning }]}>
                  Não foi possível carregar o vídeo.
                </Text>
              </View>
            ) : (
              createElement('video', {
                src: videoUrl,
                controls: true,
                poster: posterUrl ?? undefined,
                preload: 'metadata',
                playsInline: true,
                onError: () => setHasError(true),
                style: {
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#050708',
                  objectFit: 'contain',
                },
              })
            )}
          </View>
        ) : (
          <Pressable
            onPress={() => void handleOpenVideo()}
            style={({ pressed }) => [
              styles.storyFrame,
              styles.mobilePressable,
              { opacity: pressed ? 0.94 : 1 },
            ]}>
            {posterUrl ? (
              <ImageBackground
                source={{ uri: posterUrl }}
                resizeMode="cover"
                imageStyle={styles.posterImage}
                style={styles.posterFrame}>
                <StoryOverlay
                  hasError={hasError}
                  loading={opening}
                  warningColor={theme.colors.warning}
                  textColor={theme.colors.text}
                  mutedColor={theme.colors.textMuted}
                />
              </ImageBackground>
            ) : (
              <View style={styles.posterFrame}>
                <StoryOverlay
                  hasError={hasError}
                  loading={opening}
                  warningColor={theme.colors.warning}
                  textColor={theme.colors.text}
                  mutedColor={theme.colors.textMuted}
                />
              </View>
            )}
          </Pressable>
        )}
      </LinearGradient>
    </View>
  );
}

function StoryOverlay({
  hasError,
  loading,
  warningColor,
  textColor,
  mutedColor,
}: {
  hasError: boolean;
  loading: boolean;
  warningColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <LinearGradient
      colors={['rgba(7, 10, 14, 0.18)', 'rgba(7, 10, 14, 0.7)']}
      style={styles.overlay}>
      <View style={styles.playBadge}>
        <Text style={[styles.playBadgeText, { color: textColor }]}>
          {loading ? '...' : '▶'}
        </Text>
      </View>
      <Text style={[styles.overlayTitle, { color: textColor }]}>
        {hasError ? 'Falha ao carregar' : 'Toque para reproduzir'}
      </Text>
      <Text
        style={[
          styles.overlayHint,
          { color: hasError ? warningColor : mutedColor },
        ]}>
        {hasError ? 'Não foi possível abrir o vídeo.' : 'Formato vertical pronto para celular'}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  copyBlock: {
    gap: 6,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  storyPanel: {
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  storyFrame: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 9 / 16,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#050708',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
  },
  mobilePressable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterFrame: {
    flex: 1,
    backgroundColor: '#050708',
  },
  posterImage: {
    resizeMode: 'cover',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 10,
  },
  playBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadgeText: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '900',
  },
  overlayTitle: {
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  overlayHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
