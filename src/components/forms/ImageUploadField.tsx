import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { SelectedImageAsset } from '@/lib/uploadImage';

interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  imageUrl?: string | null;
  pendingImage?: SelectedImageAsset | null;
  onPickFromLibrary: () => void;
  onPickFromCamera: () => void;
  onClear?: () => void;
  clearLabel?: string;
  emptyLabel?: string;
  shape?: 'circle' | 'rounded';
  progress?: number | null;
  disabled?: boolean;
}

export function ImageUploadField({
  label,
  hint,
  imageUrl,
  pendingImage,
  onPickFromLibrary,
  onPickFromCamera,
  onClear,
  clearLabel,
  emptyLabel = 'Nenhuma imagem selecionada',
  shape = 'rounded',
  progress,
  disabled,
}: ImageUploadFieldProps) {
  const theme = useAppTheme();
  const previewUri = pendingImage?.uri ?? imageUrl ?? null;
  const hasImage = Boolean(previewUri);
  const normalizedProgress = progress == null ? null : Math.round(progress * 100);
  const previewRadius = shape === 'circle' ? 56 : 24;

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
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewFrame,
              {
                borderRadius: previewRadius,
                backgroundColor: theme.colors.backgroundElevated,
                borderColor: theme.colors.border,
              },
            ]}>
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                resizeMode="cover"
                style={[
                  styles.previewImage,
                  {
                    borderRadius: previewRadius,
                  },
                ]}
              />
            ) : (
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                {emptyLabel}
              </Text>
            )}
          </View>

          <View style={styles.copyColumn}>
            <Text style={[styles.status, { color: theme.colors.text }]}>
              {pendingImage
                ? 'Nova imagem pronta para salvar.'
                : hasImage
                  ? 'Imagem atual carregada.'
                  : 'Sem imagem enviada.'}
            </Text>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              {hint ?? 'Use a camera ou escolha um arquivo da galeria.'}
            </Text>
            {normalizedProgress != null ? (
              <View style={styles.progressGroup}>
                <Text style={[styles.progressText, { color: theme.colors.textMuted }]}>
                  Upload em andamento: {normalizedProgress}%
                </Text>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: theme.colors.backgroundElevated },
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
            label="Galeria"
            onPress={onPickFromLibrary}
            disabled={disabled}
          />
          <ActionChip
            label="Camera"
            onPress={onPickFromCamera}
            disabled={disabled}
          />
          {onClear && hasImage ? (
            <ActionChip
              label={clearLabel ?? 'Remover'}
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
  previewRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  previewFrame: {
    width: 112,
    height: 112,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  copyColumn: {
    flex: 1,
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
  emptyText: {
    textAlign: 'center',
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
