import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { SelectedVideoAsset } from '@/lib/uploadVideo';

interface VideoUploadFieldProps {
  label: string;
  hint?: string;
  videoUrl?: string | null;
  pendingVideo?: SelectedVideoAsset | null;
  onPickFromLibrary: () => void;
  onClear?: () => void;
  clearLabel?: string;
  emptyLabel?: string;
  progress?: number | null;
  disabled?: boolean;
}

export function VideoUploadField({
  label,
  hint,
  videoUrl,
  pendingVideo,
  onPickFromLibrary,
  onClear,
  clearLabel,
  emptyLabel = 'Nenhum vídeo enviado',
  progress,
  disabled,
}: VideoUploadFieldProps) {
  const theme = useAppTheme();
  const hasVideo = Boolean(videoUrl || pendingVideo);
  const normalizedProgress = progress == null ? null : Math.round(progress * 100);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <View
          style={[
            styles.previewShell,
            {
              backgroundColor: theme.colors.backgroundElevated,
              borderColor: theme.colors.border,
            },
          ]}>
          <View
            style={[
              styles.playBadge,
              {
                backgroundColor: `${theme.colors.primary}20`,
                borderColor: `${theme.colors.primary}44`,
              },
            ]}>
            <Text style={[styles.playBadgeText, { color: theme.colors.text }]}>▶ MP4</Text>
          </View>
          <View style={styles.copyColumn}>
            <Text style={[styles.status, { color: theme.colors.text }]}>
              {pendingVideo
                ? 'Novo vídeo pronto para salvar.'
                : videoUrl
                  ? 'Vídeo atual carregado.'
                  : 'Sem vídeo enviado.'}
            </Text>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              {hint ?? 'Escolha um vídeo curto em MP4 para destacar o time ou o jogador.'}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              {pendingVideo?.fileName
                ? pendingVideo.fileName
                : hasVideo
                  ? 'Arquivo salvo no Storage do app.'
                  : emptyLabel}
            </Text>
            {normalizedProgress != null ? (
              <View style={styles.progressGroup}>
                <Text style={[styles.progressText, { color: theme.colors.textMuted }]}>
                  Upload em andamento: {normalizedProgress}%
                </Text>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: theme.colors.background },
                  ]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${normalizedProgress}%`,
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actionsRow}>
          <ActionChip
            label="Selecionar MP4"
            onPress={onPickFromLibrary}
            disabled={disabled}
          />
          {onClear && hasVideo ? (
            <ActionChip
              label={clearLabel ?? 'Remover vídeo'}
              onPress={onClear}
              disabled={disabled}
              tone="danger"
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ActionChip({
  label,
  onPress,
  disabled,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor:
            tone === 'danger' ? `${theme.colors.danger}16` : theme.colors.backgroundElevated,
          borderColor:
            tone === 'danger' ? `${theme.colors.danger}55` : theme.colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
      ]}>
      <Text
        style={[
          styles.chipLabel,
          {
            color: tone === 'danger' ? theme.colors.danger : theme.colors.text,
          },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 14,
  },
  previewShell: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  playBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playBadgeText: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
  },
  copyColumn: {
    gap: 8,
  },
  status: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  progressGroup: {
    gap: 6,
  },
  progressText: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
});
